# -*- coding: utf-8 -*-
"""云数据库访问层（PostgREST）。

设计要点
  1. 连接池复用：所有请求走同一个 httpx.AsyncClient，避免每次新建 TLS 连接；
  2. 自动分页：云库单次查询有 1000 行硬上限且**静默截断**，这里统一按页拉全量
     （`select(..., limit=None)`），调用方不需要再关心分页；
  3. 错误统一转 HTTPException：把 PostgREST 的 message 原样上抛，前端 readableError 可直接展示。
"""
from __future__ import annotations

import urllib.parse
from typing import Any, Iterable, Sequence

import httpx
from fastapi import HTTPException

from .settings import (
    DB_KEY,
    DB_ORIGIN,
    DB_PAGE_SIZE,
    DB_URL,
    HTTP_MAX_CONN,
    HTTP_MAX_KEEPALIVE,
    HTTP_TIMEOUT,
)

_client: httpx.AsyncClient | None = None

Where = Sequence[tuple[str, str, Any]]


def client() -> httpx.AsyncClient:
    global _client
    if _client is None:
        _client = httpx.AsyncClient(
            base_url=DB_URL,
            timeout=HTTP_TIMEOUT,
            limits=httpx.Limits(
                max_connections=HTTP_MAX_CONN,
                max_keepalive_connections=HTTP_MAX_KEEPALIVE,
            ),
            headers={
                "x-wb-webapp-access-key": DB_KEY,
                "Origin": DB_ORIGIN,
                "Accept": "application/json",
            },
        )
    return _client


async def close() -> None:
    global _client
    if _client is not None:
        await _client.aclose()
        _client = None


def _where(where: Where | None) -> list[tuple[str, str]]:
    out: list[tuple[str, str]] = []
    for col, op, val in where or []:
        if op == "in":
            vals = ",".join(f'"{str(v)}"' for v in val)
            out.append((col, f"in.({vals})"))
        elif op == "is":
            out.append((col, f"is.{val}"))
        else:
            out.append((col, f"{op}.{val}"))
    return out


async def _request(
    method: str,
    path: str,
    *,
    params: list[tuple[str, str]] | None = None,
    json_body: Any = None,
    prefer: str | None = None,
) -> httpx.Response:
    headers = {"Prefer": prefer} if prefer else None
    try:
        resp = await client().request(method, path, params=params or [], json=json_body, headers=headers)
    except httpx.HTTPError as e:  # 网络层失败（DNS/连接/超时）
        raise HTTPException(status_code=502, detail=f"数据服务不可达：{e}") from e
    if resp.status_code >= 400:
        detail = f"数据服务返回 HTTP {resp.status_code}"
        try:
            payload = resp.json()
            if isinstance(payload, dict) and payload.get("message"):
                detail = payload["message"]
        except Exception:  # noqa: BLE001
            pass
        # 401/403 透传为 403，避免前端把权限问题当成网关故障
        status = 403 if resp.status_code in (401, 403) else 502
        raise HTTPException(status_code=status, detail=detail)
    return resp


async def select(
    table: str,
    *,
    columns: str = "*",
    where: Where | None = None,
    order: str | None = None,
    limit: int | None = None,
    offset: int = 0,
) -> list[dict[str, Any]]:
    params: list[tuple[str, str]] = [("select", columns)]
    params += _where(where)
    if order:
        params.append(("order", order))

    if limit is not None:
        if offset:
            params.append(("offset", str(offset)))
        params.append(("limit", str(limit)))
        resp = await _request("GET", f"/{table}", params=params)
        return resp.json() or []

    rows: list[dict[str, Any]] = []
    page = 0
    while True:
        p = params + [("offset", str(page * DB_PAGE_SIZE)), ("limit", str(DB_PAGE_SIZE))]
        resp = await _request("GET", f"/{table}", params=p)
        chunk = resp.json() or []
        rows.extend(chunk)
        if len(chunk) < DB_PAGE_SIZE:
            break
        page += 1
        if page > 200:  # 兜底：20 万行，正常业务不会到这里
            break
    return rows


async def select_one(
    table: str,
    *,
    columns: str = "*",
    where: Where | None = None,
    order: str | None = None,
) -> dict[str, Any] | None:
    rows = await select(table, columns=columns, where=where, order=order, limit=1)
    return rows[0] if rows else None


async def insert(
    table: str,
    rows: dict[str, Any] | list[dict[str, Any]],
    *,
    on_conflict: str | None = None,
    returning: bool = True,
) -> list[dict[str, Any]]:
    body = rows if isinstance(rows, list) else [rows]
    params: list[tuple[str, str]] = []
    if on_conflict:
        params.append(("on_conflict", on_conflict))
    prefer = "resolution=merge-duplicates,return=representation" if on_conflict else "return=representation"
    if not returning:
        prefer = prefer.replace("return=representation", "return=minimal")
    resp = await _request("POST", f"/{table}", params=params, json_body=body, prefer=prefer)
    if not returning or not resp.content:
        return []
    data = resp.json()
    return data if isinstance(data, list) else [data]


async def update(
    table: str,
    patch: dict[str, Any],
    where: Where,
    *,
    returning: bool = False,
) -> list[dict[str, Any]]:
    resp = await _request(
        "PATCH",
        f"/{table}",
        params=_where(where),
        json_body=patch,
        prefer="return=representation" if returning else "return=minimal",
    )
    if not returning or not resp.content:
        return []
    data = resp.json()
    return data if isinstance(data, list) else [data]


async def delete(table: str, where: Where, *, returning: bool = False) -> list[dict[str, Any]]:
    resp = await _request(
        "DELETE",
        f"/{table}",
        params=_where(where),
        prefer="return=representation" if returning else "return=minimal",
    )
    if not returning or not resp.content:
        return []
    data = resp.json()
    return data if isinstance(data, list) else [data]


async def rpc(name: str, args: dict[str, Any] | None = None) -> Any:
    resp = await _request("POST", f"/rpc/{name}", json_body=args or {})
    if not resp.content:
        return None
    return resp.json()


async def ping() -> bool:
    """轻量存活检查（挑一张公开小表，避免拉大表拖慢健康探测）。"""
    try:
        await select("glossary", columns="id", limit=1)
        return True
    except Exception:  # noqa: BLE001
        return False
