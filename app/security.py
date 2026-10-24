# -*- coding: utf-8 -*-
"""会话与管理员鉴权（BFF 层）。

令牌由数据库函数签发（`app_login` 返回），BFF 只做两件事：
  1. `require_session` —— 调 `app_verify_token` 确认令牌有效（结果缓存 5 分钟，
     避免每个请求都多一次数据库往返）；
  2. `require_admin` —— 调 `app_admin_list_users` 判断是否管理员（同样缓存），
     让「管理员写操作」在 BFF 层就拦住，而不是依赖前端不点错按钮。
"""
from __future__ import annotations

import hashlib
from typing import Any

from fastapi import HTTPException

from . import db
from .cache import cache
from .settings import CACHE_TTL_SESSION


def _auth(args: dict[str, Any]) -> tuple[str, str]:
    node = args.get("auth") or args.get("__auth") or {}
    uid = str(node.get("uid") or "").strip()
    token = str(node.get("token") or "").strip()
    return uid, token


def _cache_key(prefix: str, uid: str, token: str) -> str:
    digest = hashlib.sha256(token.encode("utf-8")).hexdigest()[:16]
    return f"{prefix}:{uid}:{digest}"


async def require_session(args: dict[str, Any]) -> tuple[str, str]:
    uid, token = _auth(args)
    if not uid or not token:
        raise HTTPException(status_code=401, detail="请先登录（缺少会话令牌）")

    key = _cache_key("sess", uid, token)
    if cache.get(key):
        return uid, token

    ok = await db.rpc("app_verify_token", {"p_uid": uid, "p_token": token})
    if ok is not True:
        raise HTTPException(status_code=401, detail="登录状态已失效，请重新登录")
    cache.set(key, True, CACHE_TTL_SESSION)
    return uid, token


async def require_admin(args: dict[str, Any]) -> tuple[str, str]:
    uid, token = await require_session(args)

    key = _cache_key("admin", uid, token)
    if cache.get(key):
        return uid, token

    rows = await db.rpc("app_admin_list_users", {"p_uid": uid, "p_token": token})
    first = rows[0] if isinstance(rows, list) and rows else None
    if not (isinstance(first, dict) and first.get("ok")):
        reason = (first or {}).get("reason") if isinstance(first, dict) else None
        raise HTTPException(status_code=403, detail="没有后台管理权限" if reason != "NOT_ADMIN" else "没有后台管理权限")
    cache.set(key, True, CACHE_TTL_SESSION)
    return uid, token
