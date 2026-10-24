#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""把 scripts/output/thinktank_index_recent.json 写入 thinktank_index（走 SECURITY DEFINER RPC）。

为什么不再直连写表
  `thinktank_index` 对应用 key 的**直写权限是关闭的**（INSERT 返回 42501 permission denied），
  这不是配置疏漏而是刻意的：该表是公开可读的行情派生数据，放开直写等于让任何持有公开 key 的人
  都能篡改指数。因此 2026-10-25 新增了 `app_upsert_thinktank_index(p_uid, p_token, p_rows)`：
    · SECURITY DEFINER —— 以函数所有者身份写表；
    · 函数内部校验 HMAC token 与 app_users.is_admin —— 非管理员调用直接 FORBIDDEN；
    · 逐行校验 trade_date 格式（YYYY-MM-DD）与 value 非空 —— 脏数据在入口就拒掉。
  本脚本是它的命令行封装：先登录拿 token，再批量提交。

用法：
    ./.venv/Scripts/python.exe jobs/load_index.py            # 预演（不登录、不写库）
    ./.venv/Scripts/python.exe jobs/load_index.py --apply      # 写库（需管理员凭据）
    FT_ADMIN_PHONE=138... FT_ADMIN_PASSWORD=*** ./.venv/Scripts/python.exe jobs/load_index.py --apply

凭据来源优先级：命令行 --phone/--password > 环境变量 FT_ADMIN_PHONE/FT_ADMIN_PASSWORD。
**不要把凭据写进脚本或提交到仓库。**
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app import db  # noqa: E402

DEFAULT_FILE = ROOT / "scripts" / "output" / "thinktank_index_recent.json"
BATCH = 100


def to_row(r: dict) -> dict:
    return {
        "trade_date": str(r["date"])[:10],
        "value": r.get("value"),
        "pct_change": r.get("pct_change"),
        "up_count": r.get("up_count"),
        "down_count": r.get("down_count"),
        "stock_count": r.get("stock_count"),
    }


async def login(phone: str, password: str) -> tuple[str, str]:
    """返回 (uid, token)。app_login 的 p_phone 必须带国际区号（形如 ``+86 138...``）。

    前端登录时是把区号与号码拼成 `+86 138...` 再提交的；命令行里如果只给 11 位号码，
    这里补成同样的格式，避免出现莫名其妙的 BAD_CREDENTIALS。
    """
    raw_phone = phone.strip()
    if raw_phone.startswith("+"):
        candidates = [raw_phone]
    else:
        digits = "".join(ch for ch in raw_phone if ch.isdigit())
        candidates = [f"+86 {digits}", digits]

    got = None
    for cand in candidates:
        got = await db.rpc("app_login", {"p_phone": cand, "p_password": password})
        row = (got[0] if isinstance(got, list) else got) or {}
        if row.get("ok"):
            break
    row = (got[0] if isinstance(got, list) else got) or {}
    if not row.get("ok"):
        raise SystemExit(f"登录失败：{row.get('reason') or '账号或密码不正确'}")
    if not row.get("is_admin"):
        raise SystemExit("该账号不是管理员，无法写入智库指数")
    token = str(row.get("token") or "")
    if not token:
        raise SystemExit("登录成功但未返回 token")
    return str(row["uid"]), token


async def main() -> int:
    ap = argparse.ArgumentParser(description="把智库指数增量 JSON 写入 thinktank_index（经 RPC）")
    ap.add_argument("--file", default=str(DEFAULT_FILE))
    ap.add_argument("--apply", action="store_true", help="真正写库（默认 dry-run）")
    ap.add_argument("--phone", default=os.environ.get("FT_ADMIN_PHONE", ""), help="管理员手机号")
    ap.add_argument("--password", default=os.environ.get("FT_ADMIN_PASSWORD", ""), help="管理员密码")
    args = ap.parse_args()

    path = Path(args.file)
    if not path.is_file():
        print(f"找不到 {path}（先跑 bash scripts/fetch-kline.sh 与 gen-index-recent.py）", file=sys.stderr)
        return 1

    raw = json.loads(path.read_text(encoding="utf-8"))
    if not raw:
        print("没有新增交易日（文件为空），无需写入。")
        return 0

    rows = [to_row(r) for r in raw]
    print(f"待写入 {len(rows)} 个交易日：{rows[0]['trade_date']} ~ {rows[-1]['trade_date']}")
    for r in rows[:5]:
        print(f"  {r['trade_date']}  点位 {r['value']}  涨跌 {r['pct_change']}%  "
              f"({r['up_count']}↑ {r['down_count']}↓ / {r['stock_count']}家)")
    if len(rows) > 5:
        print(f"  … 其余 {len(rows) - 5} 天略")

    try:
        latest = await db.select_one("thinktank_index", columns="trade_date,value", order="trade_date.desc")
        if latest:
            print(f"库中当前最新：{latest['trade_date']} 点位 {latest['value']}")
            if str(latest["trade_date"])[:10] >= rows[-1]["trade_date"]:
                print("⚠️ 待写入区间不新于库中数据——若确认无误可继续；否则先检查 gen-index-recent 的起点。")

        if not args.apply:
            print("\n[dry-run] 未写库。确认无误后加 --apply（需管理员凭据）。")
            return 0

        if not args.phone or not args.password:
            print(
                "\n缺少管理员凭据：用 --phone/--password，或设置环境变量 "
                "FT_ADMIN_PHONE / FT_ADMIN_PASSWORD。\n"
                "（凭据只用于本次登录换 token，不会落盘。）",
                file=sys.stderr,
            )
            return 2

        uid, token = await login(args.phone, args.password)
        print(f"\n已登录：{uid[:10]}…（管理员）")

        written = 0
        for i in range(0, len(rows), BATCH):
            chunk = rows[i:i + BATCH]
            got = await db.rpc(
                "app_upsert_thinktank_index",
                {"p_uid": uid, "p_token": token, "p_rows": chunk},
            )
            written += int(got or 0)
        after = await db.select_one("thinktank_index", columns="trade_date,value", order="trade_date.desc")
        print(f"写入 {written} 行。库中最新：{after['trade_date']} 点位 {after['value']}")
        return 0
    finally:
        await db.close()


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
