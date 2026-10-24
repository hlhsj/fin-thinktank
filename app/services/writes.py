# -*- coding: utf-8 -*-
"""写入方法：一律先鉴权（会话 / 管理员），写成功后清空公共缓存。"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException

from .. import db
from ..cache import cache
from ..registry import method
from ..security import require_admin, require_session

ASSET_LIST_COLUMNS = "id, owner_id, file_name, content_type, size_bytes, kind, created_at"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


async def _update_checked(table: str, patch: dict[str, Any], where, err: str = "保存未生效：记录可能已不存在"):
    rows = await db.update(table, patch, where, returning=True)
    if not rows:
        raise HTTPException(status_code=400, detail=err)
    return rows


async def _delete_checked(table: str, where, err: str = "删除未生效：记录可能已不存在"):
    rows = await db.delete(table, where, returning=True)
    if not rows:
        raise HTTPException(status_code=400, detail=err)
    return rows


# ---------------- 学员写入 ----------------

@method("createMessage")
async def create_message(args: dict[str, Any]):
    uid, _ = await require_session(args)
    row = dict(args.get("row") or {})
    row["user_id"] = uid  # 不信任前端传入的身份
    await db.insert("messages", row, returning=False)
    cache.clear()
    return True


@method("submitHomework")
async def submit_homework(args: dict[str, Any]):
    uid, _ = await require_session(args)
    row = dict(args.get("row") or {})
    row["user_id"] = uid
    await db.insert("homework_submit", row, returning=False)
    cache.clear()
    return True


@method("createPhoneChange")
async def create_phone_change(args: dict[str, Any]):
    uid, _ = await require_session(args)
    row = dict(args.get("row") or {})
    row.update({"user_id": uid, "status": "pending", "source": "web"})
    await db.insert("phone_change", row, returning=False)
    cache.clear()
    return True


@method("addPosition")
async def add_position(args: dict[str, Any]):
    uid, _ = await require_session(args)
    row = dict(args.get("row") or {})
    row.update({"owner_id": uid, "updated_at": _now()})
    await db.insert("trade_position", row, returning=False)
    return True


@method("removePosition")
async def remove_position(args: dict[str, Any]):
    uid, _ = await require_session(args)
    await _delete_checked(
        "trade_position",
        [("id", "eq", int(args["id"])), ("owner_id", "eq", uid)],
        "删除未生效，该记录可能不属于你",
    )
    return True


@method("addTrade")
async def add_trade(args: dict[str, Any]):
    uid, _ = await require_session(args)
    row = dict(args.get("row") or {})
    row["owner_id"] = uid
    await db.insert("trade_history", row, returning=False)
    return True


@method("removeTrade")
async def remove_trade(args: dict[str, Any]):
    uid, _ = await require_session(args)
    await _delete_checked(
        "trade_history",
        [("id", "eq", int(args["id"])), ("owner_id", "eq", uid)],
        "删除未生效，该记录可能不属于你",
    )
    return True


@method("saveAsset")
async def save_asset(args: dict[str, Any]):
    uid, _ = await require_session(args)
    row = dict(args.get("row") or {})
    row["owner_id"] = uid
    rows = await db.insert("asset_blobs", row, returning=True)
    if not rows:
        raise HTTPException(status_code=400, detail="素材保存失败，请稍后重试")
    full = rows[0]
    return {k: full.get(k) for k in ASSET_LIST_COLUMNS.split(", ")}


@method("removeAssetRecord")
async def remove_asset_record(args: dict[str, Any]):
    uid, _ = await require_session(args)
    await _delete_checked(
        "asset_blobs",
        [("id", "eq", int(args["id"])), ("owner_id", "eq", uid)],
        "删除未生效，该素材可能不属于当前账号",
    )
    return True


@method("createOrder")
async def create_order(args: dict[str, Any]):
    uid, token = await require_session(args)
    row = dict(args.get("row") or {})
    data = await db.rpc(
        "app_create_order",
        {
            "p_uid": uid,
            "p_token": token,
            "p_phone": row.get("phone"),
            "p_nickname": row.get("nickname"),
            "p_product_type": row.get("product_type"),
            "p_quantity": row.get("quantity") or 1,
            "p_remark": row.get("remark"),
        },
    )
    if isinstance(data, list):
        data = data[0] if data else None
    try:
        return int(data) if data is not None else None
    except (TypeError, ValueError):
        return None


# ---------------- 管理员：留言 / 章节 ----------------

@method("adminUpdateMessage")
async def admin_update_message(args: dict[str, Any]):
    uid, token = await require_admin(args)
    patch = args.get("patch") or {}
    await db.rpc(
        "app_admin_update_message",
        {
            "p_uid": uid,
            "p_token": token,
            "p_id": int(args["id"]),
            "p_reply": patch.get("reply"),
            "p_replied_at": patch.get("replied_at"),
            "p_pinned": patch.get("pinned") if isinstance(patch.get("pinned"), bool) else None,
        },
    )
    cache.clear()
    return True


@method("adminDeleteMessage")
async def admin_delete_message(args: dict[str, Any]):
    uid, token = await require_admin(args)
    await db.rpc(
        "app_admin_update_message",
        {"p_uid": uid, "p_token": token, "p_id": int(args["id"]), "p_delete": True},
    )
    cache.clear()
    return True


@method("saveChapterAdmin")
async def save_chapter_admin(args: dict[str, Any]):
    uid, token = await require_admin(args)
    row = args.get("row") or {}
    data = await db.rpc(
        "app_admin_save_chapter",
        {
            "p_uid": uid,
            "p_token": token,
            "p_id": row.get("id"),
            "p_title": row.get("title"),
            "p_summary": row.get("summary"),
            "p_content": row.get("content"),
            "p_kind": row.get("kind"),
            "p_order_no": row.get("order_no"),
            "p_visible_to": row.get("visible_to"),
            "p_parent_id": row.get("parent_id"),
        },
    )
    if isinstance(data, list):
        data = data[0] if data else None
    cache.clear()
    try:
        return int(data)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="保存失败，请重试") from None


@method("deleteChapterAdmin")
async def delete_chapter_admin(args: dict[str, Any]):
    uid, token = await require_admin(args)
    await db.rpc("app_admin_delete_chapter", {"p_uid": uid, "p_token": token, "p_id": int(args["id"])})
    cache.clear()
    return True


# ---------------- 管理员：词条 / 复盘 / 案例 ----------------

@method("saveGlossary")
async def save_glossary(args: dict[str, Any]):
    await require_admin(args)
    row = dict(args.get("row") or {})
    row["updated_at"] = _now()
    await db.insert("glossary", row, returning=False)
    cache.clear()
    return True


@method("updateGlossary")
async def update_glossary(args: dict[str, Any]):
    await require_admin(args)
    patch = dict(args.get("patch") or {})
    patch["updated_at"] = _now()
    await database_update_checked("glossary", patch, [("id", "eq", int(args["id"]))], "保存未生效：该词条可能已不存在")
    cache.clear()
    return True


@method("deleteGlossary")
async def delete_glossary(args: dict[str, Any]):
    await require_admin(args)
    await _delete_checked("glossary", [("id", "eq", int(args["id"]))], "删除未生效：该词条可能已不存在")
    cache.clear()
    return True


@method("saveReview")
async def save_review(args: dict[str, Any]):
    await require_admin(args)
    row = dict(args.get("row") or {})
    await db.insert("review", row, returning=False)
    cache.clear()
    return True


@method("updateReview")
async def update_review(args: dict[str, Any]):
    await require_admin(args)
    patch = dict(args.get("patch") or {})
    patch["updated_at"] = _now()
    await database_update_checked("review", patch, [("id", "eq", int(args["id"]))], "保存未生效：该复盘可能已不存在")
    cache.clear()
    return True


@method("deleteReview")
async def delete_review(args: dict[str, Any]):
    await require_admin(args)
    await _delete_checked("review", [("id", "eq", int(args["id"]))], "删除未生效：该复盘可能已不存在")
    cache.clear()
    return True


@method("saveCase")
async def save_case(args: dict[str, Any]):
    await require_admin(args)
    await db.insert("case_video", dict(args.get("row") or {}), returning=False)
    cache.clear()
    return True


@method("updateCase")
async def update_case(args: dict[str, Any]):
    await require_admin(args)
    await database_update_checked(
        "case_video", dict(args.get("patch") or {}), [("id", "eq", int(args["id"]))], "保存未生效：该案例可能已不存在"
    )
    cache.clear()
    return True


@method("deleteCase")
async def delete_case(args: dict[str, Any]):
    await require_admin(args)
    await _delete_checked("case_video", [("id", "eq", int(args["id"]))], "删除未生效：该案例可能已不存在")
    cache.clear()
    return True


# ---------------- 管理员：市场数据 ----------------

@method("upsertMarket")
async def upsert_market(args: dict[str, Any]):
    await require_admin(args)
    rows = await db.insert("market_data", dict(args.get("row") or {}), on_conflict="data_date", returning=True)
    cache.clear()
    return rows[0] if rows else None


@method("recomputeExtremes")
async def recompute_extremes(args: dict[str, Any]):
    await require_admin(args)
    all_rows = await db.select("market_data", order="data_date.asc")
    defs = [
        ("whole_temp", "全网估值温度", "°"),
        ("tech_temp", "科技股估值温度", "°"),
        ("dividend_temp", "红利股估值温度", "°"),
        ("dividend_yield", "红利平均股息率", "%"),
        ("pe_median", "科技市盈率中位数", "PE-TTM"),
    ]
    payload: list[dict[str, Any]] = []
    for key, label, unit in defs:
        vals = [(float(r[key]), r["data_date"]) for r in all_rows if isinstance(r.get(key), (int, float))]
        if not vals:
            continue
        lo = min(vals, key=lambda x: x[0])
        hi = max(vals, key=lambda x: x[0])
        payload.append(
            {
                "metric_type": key,
                "label": label,
                "unit": unit,
                "min_val": lo[0],
                "max_val": hi[0],
                "min_date": lo[1],
                "max_date": hi[1],
                "updated_at": _now(),
            }
        )
    if payload:
        await db.insert("market_extreme", payload, on_conflict="metric_type", returning=False)
    cache.clear()
    return len(payload)


@method("removeMarketRow")
async def remove_market_row(args: dict[str, Any]):
    await require_admin(args)
    await db.delete("market_data", [("data_date", "eq", args["date"])], returning=False)
    cache.clear()
    return True


# ---------------- 管理员：高级学员资料 / 作业 ----------------

@method("adminSaveMaterial")
async def admin_save_material(args: dict[str, Any]):
    await require_admin(args)
    await db.insert("master_material", dict(args.get("row") or {}), returning=False)
    cache.clear()
    return True


@method("adminUpdateMaterial")
async def admin_update_material(args: dict[str, Any]):
    await require_admin(args)
    await database_update_checked(
        "master_material", dict(args.get("patch") or {}), [("id", "eq", int(args["id"]))], "保存未生效：该资料可能已不存在"
    )
    cache.clear()
    return True


@method("adminDeleteMaterial")
async def admin_delete_material(args: dict[str, Any]):
    await require_admin(args)
    await _delete_checked("master_material", [("id", "eq", int(args["id"]))], "删除未生效：该资料可能已不存在")
    cache.clear()
    return True


@method("saveHomeworkAdmin")
async def save_homework_admin(args: dict[str, Any]):
    await require_admin(args)
    row = dict(args.get("row") or {})
    payload = {
        "title": row.get("title"),
        "period": row.get("period") or "",
        "content": row.get("content") or "",
        "status": row.get("status") or "published",
        "deadline": row.get("deadline"),
        "published_at": row.get("published_at") or _now(),
    }
    cache.clear()
    if row.get("id"):
        await _update_checked("master_homework", payload, [("id", "eq", int(row["id"]))], "保存未生效：该作业可能已不存在")
        return int(row["id"])
    rows = await db.insert("master_homework", payload, returning=True)
    if not rows:
        raise HTTPException(status_code=400, detail="发布失败，请重试")
    return int(rows[0]["id"])


@method("deleteHomeworkAdmin")
async def delete_homework_admin(args: dict[str, Any]):
    await require_admin(args)
    hid = int(args["id"])
    await db.delete("homework_submit", [("homework_id", "eq", hid)], returning=False)
    await _delete_checked("master_homework", [("id", "eq", hid)], "删除未生效：该作业可能已不存在")
    cache.clear()
    return True


@method("gradeSubmitAdmin")
async def grade_submit_admin(args: dict[str, Any]):
    await require_admin(args)
    await _update_checked(
        "homework_submit",
        {"score": args.get("score"), "review": args.get("review")},
        [("id", "eq", int(args["id"]))],
        "保存未生效：该提交可能已不存在",
    )
    cache.clear()
    return True


# ---------------- 管理员：换绑 / 订单 / 价格 ----------------

@method("updatePhoneChange")
async def update_phone_change(args: dict[str, Any]):
    await require_admin(args)
    await database_update_checked(
        "phone_change", dict(args.get("patch") or {}), [("id", "eq", int(args["id"]))], "保存未生效：该申请可能已不存在"
    )
    cache.clear()
    return True


@method("adminSetPrice")
async def admin_set_price(args: dict[str, Any]):
    uid, token = await require_admin(args)
    await db.rpc(
        "app_admin_set_price",
        {"p_uid": uid, "p_token": token, "p_product_type": args["productType"], "p_price": args["price"]},
    )
    cache.clear()
    return True


@method("confirmOrderAdmin")
async def confirm_order_admin(args: dict[str, Any]):
    uid, token = await require_admin(args)
    data = await db.rpc(
        "app_admin_confirm_order",
        {
            "p_uid": uid,
            "p_token": token,
            "p_order_id": int(args["orderId"]),
            "p_grant": bool(args.get("grant", True)),
        },
    )
    row = data[0] if isinstance(data, list) and data else (data if isinstance(data, dict) else {})
    cache.clear()
    return {
        "granted": bool((row or {}).get("granted")),
        "memberExpireAt": (row or {}).get("member_expire_at"),
        "masterExpireAt": (row or {}).get("master_expire_at"),
    }


@method("updateOrderAdmin")
async def update_order_admin(args: dict[str, Any]):
    uid, token = await require_admin(args)
    await db.rpc(
        "app_admin_update_order",
        {
            "p_uid": uid,
            "p_token": token,
            "p_id": int(args["id"]),
            "p_status": args["status"],
            "p_confirmed_at": args.get("confirmedAt"),
        },
    )
    cache.clear()
    return True


# ---------------- 管理员：PE 数据 ----------------

@method("upsertPeIndex")
async def upsert_pe_index(args: dict[str, Any]):
    await require_admin(args)
    payload = list(args.get("payload") or [])
    for i in range(0, len(payload), 500):
        await db.insert("pe_index", payload[i : i + 500], on_conflict="index_code,pe_date", returning=False)
    cache.clear()
    return True


@method("updatePeIndustry")
async def update_pe_industry(args: dict[str, Any]):
    await require_admin(args)
    patch = dict(args.get("patch") or {})
    patch["updated_at"] = _now()
    await database_update_checked(
        "pe_industry", patch, [("industry_code", "eq", args["code"])], "保存未生效：该板块可能已不存在"
    )
    cache.clear()
    return True


@method("upsertPeIndustryValue")
async def upsert_pe_industry_value(args: dict[str, Any]):
    await require_admin(args)
    code = str(args["code"])
    pe = args.get("pe")
    pe_date = args["peDate"]
    row = await db.select_one("pe_industry", columns="hist_min_pe", where=[("industry_code", "eq", code)])
    current = (row or {}).get("hist_min_pe")
    if pe is None:
        next_min = current
    elif current is None:
        next_min = pe
    else:
        next_min = min(float(current), float(pe))
    patch: dict[str, Any] = {"pe_ttm": pe, "pe_date": pe_date, "hist_min_pe": next_min, "updated_at": _now()}
    if pe is not None and (current is None or float(pe) <= float(current)):
        patch["hist_min_date"] = pe_date
    await database_update_checked("pe_industry", patch, [("industry_code", "eq", code)])
    cache.clear()
    return True


# ---------------- 管理员：课程回放 / 企业研究 ----------------

@method("adminSaveCourseVideo")
async def admin_save_course_video(args: dict[str, Any]):
    await require_admin(args)
    row = dict(args.get("row") or {})
    cache.clear()
    if row.get("id"):
        vid = int(row.pop("id"))
        await _update_checked("course_video", row, [("id", "eq", vid)])
        return vid
    rows = await db.insert("course_video", row, returning=True)
    return int(rows[0]["id"]) if rows else None


@method("adminDeleteCourseVideo")
async def admin_delete_course_video(args: dict[str, Any]):
    await require_admin(args)
    await _delete_checked("course_video", [("id", "eq", int(args["id"]))], "删除未生效：该回放可能已不存在")
    cache.clear()
    return True


@method("adminSaveCompanyResearch")
async def admin_save_company_research(args: dict[str, Any]):
    await require_admin(args)
    row = dict(args.get("row") or {})
    today = datetime.now().strftime("%Y-%m-%d")
    cache.clear()
    if row.get("id"):
        cid = int(row.pop("id"))
        row["updated_date"] = today
        await _update_checked("company_research", row, [("id", "eq", cid)], "保存未生效：该企业可能已不存在")
        return cid
    row["updated_date"] = today
    rows = await db.insert("company_research", row, returning=True)
    return int(rows[0]["id"]) if rows else None


@method("adminImportCompanyResearch")
async def admin_import_company_research(args: dict[str, Any]):
    await require_admin(args)
    items = list(args.get("items") or [])
    if not items:
        return 0
    today = datetime.now().strftime("%Y-%m-%d")
    payload = [{**r, "updated_date": today} for r in items]
    total = 0
    for i in range(0, len(payload), 500):
        rows = await db.insert("company_research", payload[i : i + 500], returning=True)
        total += len(rows)
    cache.clear()
    return total


@method("adminDeleteCompanyResearch")
async def admin_delete_company_research(args: dict[str, Any]):
    await require_admin(args)
    await _delete_checked("company_research", [("id", "eq", int(args["id"]))], "删除未生效：该企业可能已不存在")
    cache.clear()
    return True


@method("adminClearCompanyResearch")
async def admin_clear_company_research(args: dict[str, Any]):
    await require_admin(args)
    await db.delete("company_research", [("id", "gte", 0)], returning=False)
    cache.clear()
    return True


@method("upsertThinktankIndex")
async def upsert_thinktank_index(args: dict[str, Any]):
    """智库指数批量 upsert（按 trade_date 幂等）。

    为什么走 RPC 而不是直接写表：`thinktank_index` 对应用 key 的直写权限是关闭的
    （42501），只有 SECURITY DEFINER 函数能以函数所有者身份写入。该函数内部还会
    再校验一次 token 与管理员身份，前端即使拿到方法名也无法越权。
    """
    uid, token = await require_admin(args)
    rows = args.get("rows") or []
    if not isinstance(rows, list) or not rows:
        raise HTTPException(status_code=400, detail="rows 不能为空")
    written = await db.rpc(
        "app_upsert_thinktank_index",
        {"p_uid": uid, "p_token": token, "p_rows": rows},
    )
    cache.clear()
    return {"written": int(written or 0)}


# 兼容旧代码里对 `_update_checked` 的别名（语义相同，便于阅读处使用）
async def database_update_checked(table: str, patch: dict[str, Any], where, err: str = "保存未生效：记录可能已不存在"):
    return await _update_checked(table, patch, where, err)
