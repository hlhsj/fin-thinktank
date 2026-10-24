# -*- coding: utf-8 -*-
"""只读方法：公共数据（带共享缓存）+ 需登录的受保护读。"""
from __future__ import annotations

import asyncio
from typing import Any

from .. import db
from ..cache import cached
from ..registry import METHODS, method
from ..security import require_admin, require_session
from ..settings import CACHE_TTL_PUBLIC

# 列表列与前端保持一致：**资产表绝不拉 data 列**（几十兆 base64）
ASSET_LIST_COLUMNS = "id, owner_id, file_name, content_type, size_bytes, kind, created_at"


# ---------------- 公共数据（无需登录） ----------------

@method("listGlossary")
async def list_glossary(args: dict[str, Any]):
    kw = (args.get("keyword") or "").strip()
    where = [("term", "ilike", f"%{kw}%")] if kw else []

    async def load():
        return await db.select("glossary", where=where, order="category.asc,order_no.asc")

    return await cached(f"glossary:{kw}", CACHE_TTL_PUBLIC, load)


@method("listReviews")
async def list_reviews(args: dict[str, Any]):
    async def load():
        return await db.select("review", order="week_no.desc")

    return await cached("review:all", CACHE_TTL_PUBLIC, load)


@method("getReview")
async def get_review(args: dict[str, Any]):
    async def load():
        return await db.select_one("review", where=[("id", "eq", int(args["id"]))])

    return await cached(f"review:one:{args['id']}", CACHE_TTL_PUBLIC, load)


@method("listCases")
async def list_cases(args: dict[str, Any]):
    async def load():
        return await db.select("case_video", order="order_no.asc")

    return await cached("case:all", CACHE_TTL_PUBLIC, load)


@method("getCase")
async def get_case(args: dict[str, Any]):
    async def load():
        return await db.select_one("case_video", where=[("id", "eq", int(args["id"]))])

    return await cached(f"case:one:{args['id']}", CACHE_TTL_PUBLIC, load)


@method("listMarket")
async def list_market(args: dict[str, Any]):
    days = int(args.get("days") or 120)

    async def load():
        rows = await db.select("market_data", order="data_date.desc", limit=days)
        return list(reversed(rows))

    return await cached(f"market:{days}", CACHE_TTL_PUBLIC, load)


@method("listExtremes")
async def list_extremes(args: dict[str, Any]):
    async def load():
        rows = await db.select("market_extreme")
        return {r.get("metric_type"): r for r in rows}

    return await cached("market:extremes", CACHE_TTL_PUBLIC, load)


@method("listMaterials")
async def list_materials(args: dict[str, Any]):
    async def load():
        return await db.select("master_material", order="sort_order.asc")

    return await cached("material:all", CACHE_TTL_PUBLIC, load)


@method("listHomework")
async def list_homework(args: dict[str, Any]):
    async def load():
        return await db.select("master_homework", order="published_at.desc")

    return await cached("homework:all", CACHE_TTL_PUBLIC, load)


@method("listCourseVideos")
async def list_course_videos(args: dict[str, Any]):
    only_published = args.get("onlyPublished", True)

    async def load():
        where = [("published", "eq", "true")] if only_published else []
        return await db.select("course_video", where=where, order="sort_order.asc,created_at.desc")

    return await cached(f"video:{bool(only_published)}", CACHE_TTL_PUBLIC, load)


@method("listCompanyResearch")
async def list_company_research(args: dict[str, Any]):
    async def load():
        return await db.select("company_research", order="sort_order.asc,id.asc")

    return await cached("company:all", 300, load)


@method("listThinktankIndex")
async def list_thinktank_index(args: dict[str, Any]):
    async def load():
        return await db.select("thinktank_index", order="trade_date.asc")

    return await cached("index:all", 300, load)


@method("listPeIndex")
async def list_pe_index(args: dict[str, Any]):
    since = args.get("since")
    until = args.get("until")
    where = []
    if since:
        where.append(("pe_date", "gte", since))
    if until:
        where.append(("pe_date", "lte", until))

    async def load():
        return await db.select(
            "pe_index",
            columns="index_code,index_name,pe_date,pe_ttm,close_price,kind,source",
            where=where,
            order="pe_date.asc,index_code.asc",
        )

    return await cached(f"pe:index:{since or ''}:{until or ''}", CACHE_TTL_PUBLIC, load)


@method("listPeExtreme")
async def list_pe_extreme(args: dict[str, Any]):
    async def load():
        return await db.select("pe_extreme")

    return await cached("pe:extreme", CACHE_TTL_PUBLIC, load)


@method("listPeDataGap")
async def list_pe_data_gap(args: dict[str, Any]):
    async def load():
        try:
            return await db.select(
                "pe_data_gap",
                columns="id,kind,target_code,target_name,gap_from,gap_to,reason,verified,note",
            )
        except Exception:  # noqa: BLE001  表缺失时降级为空，不影响市场页
            return []

    return await cached("pe:gap", 300, load)


@method("listPeIndustryDaily")
async def list_pe_industry_daily(args: dict[str, Any]):
    kind = args.get("kind") or "region"
    code = str(args.get("code") or "")
    since = args.get("since")
    where = [("kind", "eq", kind), ("industry_code", "eq", code)]
    if since:
        where.append(("pe_date", "gte", since))

    async def load():
        return await db.select(
            "pe_industry_daily",
            columns="industry_code,industry_name,kind,pe_date,pe_ttm",
            where=where,
            order="pe_date.asc",
        )

    return await cached(f"pe:daily:{kind}:{code}:{since or ''}", CACHE_TTL_PUBLIC, load)


@method("listPeIndustry")
async def list_pe_industry(args: dict[str, Any]):
    kind = args.get("kind") or "region"

    async def load():
        return await db.select("pe_industry", where=[("kind", "eq", kind)], order="industry_code.asc")

    return await cached(f"pe:industry:{kind}", CACHE_TTL_PUBLIC, load)


@method("listMarketTemp")
async def list_market_temp(args: dict[str, Any]):
    async def load():
        return await db.select_one("market_temp", where=[], order="as_of_date.desc")

    return await cached("temp:latest", 120, load)


@method("listMarketTempHistory")
async def list_market_temp_history(args: dict[str, Any]):
    since = args.get("since")
    where = [("trade_date", "gte", since)] if since else []

    async def load():
        return await db.select(
            "market_temp_history",
            columns="trade_date,temperature,label,momentum,volume,volatility,risk_appetite,style,breadth,margin",
            where=where,
            order="trade_date.asc",
        )

    return await cached(f"temp:history:{since or ''}", 120, load)


@method("marketSummary")
async def market_summary(args: dict[str, Any]):
    """市场页首屏聚合：一次请求返回温度计快照 + 指数窗口 + 历史极值（可选板块）。

    为什么合并：这三个资源在页面上永远同时需要，拆成三个请求就是三次 TLS 往返。
    合并后在服务端并发取数（各自仍有独立缓存），前端只付出一次往返。
    `boards=True` 时才带板块数据（前端 SHOW_BOARD_PE 关闭时不必白拉两张表）。
    """
    since = args.get("since")
    with_boards = bool(args.get("boards"))

    async def load():
        tasks = [
            METHODS["listMarketTemp"]({}),
            METHODS["listPeIndex"]({"since": since}),
            METHODS["listPeExtreme"]({}),
        ]
        if with_boards:
            tasks += [
                METHODS["listPeDataGap"]({}),
                METHODS["listPeIndustry"]({"kind": "region"}),
                METHODS["listPeIndustry"]({"kind": "industry"}),
            ]
        got = await asyncio.gather(*tasks)
        out = {
            "temp": got[0],
            "index": got[1],
            "extreme": got[2],
            "gap": got[3] if with_boards else [],
            "region": got[4] if with_boards else [],
            "industry": got[5] if with_boards else [],
        }
        return out

    return await cached(f"market:summary:{since or ''}:{int(with_boards)}", CACHE_TTL_PUBLIC, load)


@method("readPrices")
async def read_prices(args: dict[str, Any]):
    async def load():
        rows = await db.rpc("app_read_prices", {})
        out: dict[str, float] = {}
        for r in rows or []:
            out[str(r.get("product_type"))] = float(r.get("price"))
        return out

    return await cached("prices:all", 300, load)


# ---------------- 需登录 ----------------

@method("listChapters")
async def list_chapters(args: dict[str, Any]):
    uid, token = await require_session(args)
    rows = await db.rpc("app_read_chapters", {"p_uid": uid, "p_token": token})
    rows = rows or []
    roots = [r for r in rows if not r.get("parent_id")]
    out: list[dict[str, Any]] = []
    for chapter in roots:
        out.append(chapter)
        out.extend([r for r in rows if r.get("parent_id") == chapter.get("id")])
    orphan = [r for r in rows if r.get("parent_id") and not any(c.get("id") == r["parent_id"] for c in roots)]
    out.extend(orphan)
    return out


@method("listMessages")
async def list_messages(args: dict[str, Any]):
    uid, token = await require_session(args)
    rows = await db.rpc("app_read_messages", {"p_uid": uid, "p_token": token})
    rows = rows or []
    if args.get("mineOnly"):
        rows = [r for r in rows if r.get("user_id") == uid]
    # 置顶优先 + 时间倒序：两次稳定排序（Python 的 sort 是稳定的）
    rows.sort(key=lambda r: str(r.get("created_at") or ""), reverse=True)
    rows.sort(key=lambda r: 0 if r.get("pinned") else 1)
    return rows


@method("listMySubmits")
async def list_my_submits(args: dict[str, Any]):
    uid, _ = await require_session(args)
    return await db.select("homework_submit", where=[("user_id", "eq", uid)], order="submitted_at.desc")


@method("listPositions")
async def list_positions(args: dict[str, Any]):
    uid, _ = await require_session(args)
    return await db.select("trade_position", where=[("owner_id", "eq", uid)], order="updated_at.desc")


@method("listTrades")
async def list_trades(args: dict[str, Any]):
    uid, _ = await require_session(args)
    return await db.select("trade_history", where=[("owner_id", "eq", uid)], order="traded_at.desc")


@method("listAssets")
async def list_assets(args: dict[str, Any]):
    uid, _ = await require_session(args)
    return await db.select(
        "asset_blobs", columns=ASSET_LIST_COLUMNS, where=[("owner_id", "eq", uid)], order="created_at.desc", limit=200
    )


@method("fetchAssetData")
async def fetch_asset_data(args: dict[str, Any]):
    uid, _ = await require_session(args)
    row = await db.select_one(
        "asset_blobs",
        columns="data",
        where=[("id", "eq", int(args["id"])), ("owner_id", "eq", uid)],
    )
    return (row or {}).get("data")


# ---------------- 管理员只读 ----------------

@method("listOrdersAdmin")
async def list_orders_admin(args: dict[str, Any]):
    uid, token = await require_admin(args)
    return await db.rpc("app_admin_list_orders", {"p_uid": uid, "p_token": token})


@method("listPhoneChanges")
async def list_phone_changes(args: dict[str, Any]):
    await require_admin(args)
    return await db.select("phone_change", order="created_at.desc")


@method("listSubmits")
async def list_submits(args: dict[str, Any]):
    await require_admin(args)
    return await db.select("homework_submit", where=[("homework_id", "eq", int(args["homeworkId"]))], order="submitted_at.desc")
