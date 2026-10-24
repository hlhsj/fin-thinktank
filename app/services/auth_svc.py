# -*- coding: utf-8 -*-
"""认证与账号管理：转发数据库 SECURITY DEFINER 函数。

为什么不在这里重写密码校验：bcrypt 比对、令牌签发都在数据库函数内完成，
BFF 只负责转发与会话校验——保证「密码永不出库」的既有安全属性。
"""
from __future__ import annotations

from typing import Any

from .. import db
from ..cache import cache
from ..registry import method
from ..security import require_admin, require_session


def _first(data: Any) -> Any:
    if isinstance(data, list):
        return data[0] if data else None
    return data


@method("loginAccount")
async def login_account(args: dict[str, Any]):
    return _first(await db.rpc("app_login", {"p_phone": args["phone"], "p_password": args["password"]}))


@method("registerAccount")
async def register_account(args: dict[str, Any]):
    return _first(
        await db.rpc(
            "app_register",
            {
                "p_phone": args["phone"],
                "p_password": args["password"],
                "p_nickname": args.get("nickname") or "",
            },
        )
    )


@method("refreshAccount")
async def refresh_account(args: dict[str, Any]):
    uid = str(args.get("uid") or "")
    if not uid:
        raise ValueError("缺少 uid")
    return _first(await db.rpc("app_refresh_account", {"p_uid": uid}))


@method("adminListUsers")
async def admin_list_users(args: dict[str, Any]):
    uid, token = await require_admin(args)
    return await db.rpc("app_admin_list_users", {"p_uid": uid, "p_token": token}) or []


@method("adminGrant")
async def admin_grant(args: dict[str, Any]):
    uid, token = await require_admin(args)
    row = _first(
        await db.rpc(
            "app_admin_grant",
            {
                "p_uid": uid,
                "p_token": token,
                "p_phone": args["phone"],
                "p_member_expire": args.get("memberExpire"),
                "p_master_expire": args.get("masterExpire"),
                "p_master_period": args.get("masterPeriod"),
            },
        )
    )
    cache.clear()
    return row


@method("adminRevoke")
async def admin_revoke(args: dict[str, Any]):
    uid, token = await require_admin(args)
    row = _first(
        await db.rpc(
            "app_admin_revoke",
            {"p_uid": uid, "p_token": token, "p_target_uid": args["targetUid"], "p_kind": args["kind"]},
        )
    )
    cache.clear()
    return row


@method("adminSetAdmin")
async def admin_set_admin(args: dict[str, Any]):
    uid, token = await require_admin(args)
    data = await db.rpc(
        "app_admin_set_admin",
        {"p_uid": uid, "p_token": token, "p_target_uid": args["targetUid"], "p_is_admin": bool(args.get("isAdmin"))},
    )
    return data is True


@method("requestPasswordReset")
async def request_password_reset(args: dict[str, Any]):
    return _first(
        await db.rpc(
            "app_request_password_reset",
            {"p_phone": args["phone"], "p_new_password": args["newPassword"]},
        )
    )


@method("adminListPasswordResets")
async def admin_list_password_resets(args: dict[str, Any]):
    uid, token = await require_admin(args)
    return await db.rpc("app_admin_list_password_resets", {"p_uid": uid, "p_token": token}) or []


@method("adminResolvePasswordReset")
async def admin_resolve_password_reset(args: dict[str, Any]):
    uid, token = await require_admin(args)
    await db.rpc(
        "app_admin_resolve_password_reset",
        {"p_uid": uid, "p_token": token, "p_reset_id": int(args["resetId"]), "p_approve": bool(args.get("approve"))},
    )
    cache.clear()
    return True
