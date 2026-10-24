#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""数据新鲜度自检（命令行版）。

用法（在项目根目录执行）：
    ./.venv/Scripts/python.exe jobs/freshness.py            # 人读表格，有硬性问题时退出码 1
    ./.venv/Scripts/python.exe jobs/freshness.py --json     # 机器可读，便于定时任务留档
    ./.venv/Scripts/python.exe jobs/freshness.py --warn-only  # 只报告不阻断（长假期间用）

为什么要有这个脚本
  定时任务的失败形态大多是「静默的」：数据写进了错的日期、或被后续步骤抹掉，
  任务本身退出码仍是 0。把它串在任务末尾，就能把「页面为什么不动」变成一个具体日期。
"""
from __future__ import annotations

import argparse
import asyncio
import json
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app import db  # noqa: E402
from app.services import freshness  # noqa: E402

ICON = {"ok": "OK", "stale": "STALE", "empty": "EMPTY", "error": "ERROR", "paused": "已停更"}


def _width(text: str) -> int:
    """中文按 2 列宽计算，避免表格在终端里错位。"""
    return sum(2 if unicodedata.east_asian_width(ch) in ("W", "F") else 1 for ch in text)


def _pad(text: str, width: int) -> str:
    return text + " " * max(0, width - _width(text))


async def main() -> int:
    try:
        result = await freshness.snapshot()
    finally:
        await db.close()

    if "--json" in sys.argv:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        print(f"数据新鲜度自检 · {result['checked_at']}（滞后阈值 {result['max_lag_days']} 天）")
        print("-" * 62)
        print(f"{_pad('数据族', 20)}{_pad('最新日期', 14)}{_pad('滞后', 7)}状态")
        for it in result["items"]:
            lag = "-" if it["lag_days"] is None else f"{it['lag_days']}d"
            print(f"{_pad(it['label'], 20)}{_pad(it['latest'] or '-', 14)}{_pad(lag, 7)}{ICON.get(it['status'], it['status'])}")
        print("-" * 62)
        print(f"核心数据对齐：{'是' if result['aligned'] else '否'} | 核心最新：{result['core_latest'] or '-'}")
        if result["problems"]:
            print("\n发现的问题：")
            for p in result["problems"]:
                print(f"  · {p}")
        else:
            print("结论：全部数据新鲜且日期对齐。")

    if result["ok"] or "--warn-only" in sys.argv:
        return 0
    return 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
