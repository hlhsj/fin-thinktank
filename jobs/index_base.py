#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""打印智库指数在云库中的「最后一个交易日 + 点位」，供 gen-index-recent.py 作增量起点。

用法：
    ./.venv/Scripts/python.exe jobs/index_base.py        # 输出形如：2026-10-23 4195.23
    BASE=$(./.venv/Scripts/python.exe jobs/index_base.py) && set -- $BASE && \
        ./.venv/Scripts/python.exe scripts/output/gen-index-recent.py "$1" "$2"

为什么单独成脚本
  gen-index-recent.py 需要 (base_date, base_value) 两个参数，而这两个值只有云库知道。
  以前由自动化任务先查 SQL 再手填参数，容易填错；这里固定成一条命令，避免人工搬运。
"""
from __future__ import annotations

import asyncio
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app import db  # noqa: E402


async def main() -> int:
    try:
        row = await db.select_one("thinktank_index", columns="trade_date,value", order="trade_date.desc")
    finally:
        await db.close()
    if not row or not row.get("trade_date"):
        print("智库指数表为空或不可读，无法给出增量起点", file=sys.stderr)
        return 1
    print(f"{str(row['trade_date'])[:10]} {row['value']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
