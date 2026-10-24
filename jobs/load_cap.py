#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""把 scripts/output/market_cap.json 直接写入 company_research（取代「生成 SQL 再落库」）。

原来这条链路是：
    market-cap-update.sh → market_cap.json → gen-cap-sql.py → update_cap_*.sql →（人工/MCP 执行）
本脚本把它收成一步：读 JSON → 按 name 匹配 → PATCH 对应记录。默认 **dry-run**。

写入规则（与 gen-cap-sql.py 的口径完全一致，不要各自演化）：
    market_cap    = 当日总市值（亿元）
    pe_ttm        = 当日 PE-TTM（可能为 null）
    min_pe_10y    = 当日 PE > 0 时取 LEAST(COALESCE(原值, 当日PE), 当日PE)；否则保持原值
    cap_updated_at / updated_date = 今天

用法：
    ./.venv/Scripts/python.exe jobs/load_cap.py            # 预演（打印将要变化的行，不写库）
    ./.venv/Scripts/python.exe jobs/load_cap.py --apply     # 真正写库
    ./.venv/Scripts/python.exe jobs/load_cap.py --apply --concurrency 4
"""
from __future__ import annotations

import argparse
import asyncio
import datetime as dt
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app import db  # noqa: E402

DEFAULT_FILE = ROOT / "scripts" / "output" / "market_cap.json"


def compute_patch(row: dict, cur: dict, today: str) -> tuple[dict, list[str]]:
    """按规则算出应写入的字段，并返回「变了什么」的中文说明。"""
    name = cur.get("name") or row.get("name")
    cap = row.get("market_cap")
    pe = row.get("pe_ttm")
    old_cap = cur.get("market_cap")
    old_pe = cur.get("pe_ttm")
    old_min = cur.get("min_pe_10y")

    notes: list[str] = []
    if cap is not None and old_cap != cap:
        notes.append(f"市值 {old_cap} → {cap}")
    if pe != old_pe:
        notes.append(f"PE {old_pe} → {pe}")

    new_min = old_min
    if pe is not None and float(pe) > 0:
        cand = float(pe)
        new_min = cand if old_min is None else min(float(old_min), cand)
        if old_min is None or float(new_min) < float(old_min):
            notes.append(f"十年最低 PE 刷新 {old_min} → {round(new_min, 2)}")

    patch = {
        "market_cap": cap,
        "pe_ttm": pe,
        "min_pe_10y": new_min,
        "cap_updated_at": today,
        "updated_date": today,
    }
    return patch, [f"{name}：{'；'.join(notes)}"] if notes else []


async def main() -> int:
    ap = argparse.ArgumentParser(description="把 market_cap.json 写入 company_research")
    ap.add_argument("--file", default=str(DEFAULT_FILE))
    ap.add_argument("--apply", action="store_true", help="真正写库（默认 dry-run）")
    ap.add_argument("--concurrency", type=int, default=6, help="并发 PATCH 数（默认 6）")
    args = ap.parse_args()

    path = Path(args.file)
    if not path.is_file():
        print(f"找不到 {path}（先跑 bash scripts/market-cap-update.sh）", file=sys.stderr)
        return 1

    rows = json.loads(path.read_text(encoding="utf-8"))
    today = dt.date.today().isoformat()

    existing = await db.select("company_research", columns="id,name,market_cap,pe_ttm,min_pe_10y")
    by_name = {str(r.get("name")): r for r in existing}
    print(f"本地 {len(rows)} 行 · 云库 {len(existing)} 家 · 日期 {today}")

    plan: list[tuple[int, dict]] = []
    notes: list[str] = []
    missing: list[str] = []
    for row in rows:
        name = str(row.get("name") or "").strip()
        cur = by_name.get(name)
        if not cur:
            missing.append(name)
            continue
        patch, changes = compute_patch(row, cur, today)
        plan.append((int(cur["id"]), patch))
        notes.extend(changes)

    print(f"可写入 {len(plan)} 家｜库中无此企业 {len(missing)} 个" + (f"：{'、'.join(missing[:8])}" if missing else ""))
    if notes:
        print("\n数值变化：")
        for n in notes[:30]:
            print("  ·", n)
        if len(notes) > 30:
            print(f"  … 另有 {len(notes) - 30} 条")
    else:
        print("\n数值无变化（仍会刷新 cap_updated_at / updated_date）")

    if not args.apply:
        print("\n[dry-run] 未写库。确认无误后加 --apply。")
        await db.close()
        return 0

    sem = asyncio.Semaphore(max(1, args.concurrency))
    ok = 0
    failed: list[tuple[int, str]] = []

    async def write(rid: int, patch: dict):
        nonlocal ok
        async with sem:
            try:
                await db.update("company_research", patch, [("id", "eq", rid)])
                ok += 1
            except Exception as e:  # noqa: BLE001
                failed.append((rid, str(getattr(e, "detail", e))[:120]))

    try:
        await asyncio.gather(*(write(rid, patch) for rid, patch in plan))
        print(f"\n写入完成：成功 {ok} 家，失败 {len(failed)} 家")
        for rid, msg in failed[:8]:
            print(f"  ✗ id={rid}：{msg}")
        if any("permission" in m.lower() or "42501" in m for _, m in failed):
            print("  ⚠️ 出现权限拒绝：该 key 对 company_research 的写权限被收回，需改用有权限的凭据。")
        after = await db.select_one("company_research", columns="updated_date,cap_updated_at", order="updated_date.desc")
        print(f"库中最新 updated_date：{after.get('updated_date') if after else '-'}")
        return 0 if not failed else 1
    finally:
        await db.close()


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
