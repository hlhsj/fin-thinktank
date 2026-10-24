#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""把温度计 payload 写入 market_temp 当日快照。

为什么需要它
  thermo.mjs 只产出 JSON，`load-temp-history.mjs` 只写**明细表** market_temp_history；
  market_temp 这张**当班快照表**一直没有脚本负责，长期靠定时任务里手写的一段 SQL upsert 完成
  （series 是近一年 250 个交易日的嵌套 JSON，手写容易错、也没法本地复核）。
  这里把它固定成一条命令：默认 dry-run 只打印将要写入的内容，`--apply` 才真的落库。

用法：
    ./.venv/Scripts/python.exe jobs/load_payload.py            # 预演（不写库）
    ./.venv/Scripts/python.exe jobs/load_payload.py --apply     # 真正 upsert
    ./.venv/Scripts/python.exe jobs/load_payload.py --file scripts/output/market_temp_payload.json

幂等性：以 as_of_date 为唯一键 upsert，重复执行结果一致。
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

DEFAULT_FILE = ROOT / "scripts" / "output" / "market_temp_payload.json"

# payload 字段 → market_temp 列（一一对应，写错会立刻在 dry-run 里看出来）
FIELDS = [
    "as_of_date",
    "temperature",
    "label",
    "pct_rank",
    "factors",
    "stats",
    "prev_date",
    "prev_temperature",
    "series",
    "source",
    "window_start",
    "hist_min_temp",
    "hist_min_date",
    "hist_max_temp",
    "hist_max_date",
]


def build_row(payload: dict) -> dict:
    missing = [f for f in FIELDS if f not in payload]
    if missing:
        raise SystemExit(f"payload 缺少字段：{', '.join(missing)}")
    row = {f: payload[f] for f in FIELDS}
    row["as_of_date"] = str(row["as_of_date"])[:10]
    row["created_at"] = dt.datetime.now().isoformat(timespec="seconds")
    return row


def describe(row: dict) -> str:
    series = row.get("series") or {}
    dates = series.get("dates") or []
    return (
        f"日期 {row['as_of_date']} · 温度 {row['temperature']}（{row['label']}，分位 {row['pct_rank']}%）\n"
        f"  前一日 {row['prev_date']} {row['prev_temperature']} · 历史极值 "
        f"{row['hist_min_temp']}（{row['hist_min_date']}）~ {row['hist_max_temp']}（{row['hist_max_date']}）\n"
        f"  曲线 {len(dates)} 个交易日（{dates[0] if dates else '-'} ~ {dates[-1] if dates else '-'}）"
        f" · 因子 {len(row.get('factors') or {})} 个"
    )


async def main() -> int:
    ap = argparse.ArgumentParser(description="把温度计 payload 写入 market_temp 当日快照")
    ap.add_argument("--file", default=str(DEFAULT_FILE), help="payload 路径")
    ap.add_argument("--apply", action="store_true", help="真正写库（默认只预演）")
    args = ap.parse_args()

    path = Path(args.file)
    if not path.is_file():
        print(f"找不到 payload：{path}（先跑 bash scripts/thermo-fetch.sh && node scripts/thermo.mjs）", file=sys.stderr)
        return 1

    payload = json.loads(path.read_text(encoding="utf-8"))
    row = build_row(payload)
    print("待写入 market_temp：")
    print("  " + describe(row))

    try:
        existing = await db.select_one("market_temp", columns="as_of_date,temperature", where=[("as_of_date", "eq", row["as_of_date"])])
        if existing:
            print(f"  库中已存在 {existing['as_of_date']}（温度 {existing['temperature']}）→ 将按 as_of_date 覆盖")
        else:
            print("  库中无该日期记录 → 将新增")

        if not args.apply:
            print("\n[dry-run] 未写库。确认无误后加 --apply。")
            return 0

        await db.insert("market_temp", row, on_conflict="as_of_date")
        after = await db.select_one("market_temp", columns="as_of_date,temperature,pct_rank", order="as_of_date.desc")
        print(f"\n已写入。库中最新：{after['as_of_date']} 温度 {after['temperature']}（分位 {after['pct_rank']}%）")
        return 0
    finally:
        await db.close()


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
