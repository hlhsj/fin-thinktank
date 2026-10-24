# -*- coding: utf-8 -*-
"""数据新鲜度自检：把「定时任务到底跑没跑、几张表是否对齐」变成一句可查的结论。

背景
  2026-10 的真实故障里，最耗时的不是「任务报错」，而是「任务显示成功、页面却不动」：
  数据被写进了错误的日期区间、或被后续步骤抹掉，而没有任何一处会主动说出「数据不新了」。
  自检的目的很单一——**用一条可复现的结论替代人工翻库**。

判定口径
  1. `latest`：该表按日期列倒序的第一行（空表则为 null）。
  2. `lag_days`：今天 − latest（自然日）。A股有周末与长假，所以阈值放宽到 5 天；
     超过阈值才算 `stale`，否则 `ok`。长假期间会给出 `warn` 而不是阻断，避免误杀。
  3. `aligned`：核心数据族（温度计/四大指数PE/智库指数）的最新日期是否一致。
     不一致意味着某一个定时任务当天没跑成功——这比「都旧了」更隐蔽。
  4. 板块 PE（pe_industry_daily）2026-10-20 起已停止每日更新，只报最新日期，不参与对齐判定。

两种用法
  · 部署侧：GET /api/health/data（app/services/freshness.py 直接被 main.py 调用）
  · 本机侧：python jobs/freshness.py（退出码非 0 表示有硬性问题，可被定时任务串在末尾）
"""
from __future__ import annotations

import datetime as dt
import os
from typing import Any

from .. import db

# (键, 表名, 日期列, 中文名, 是否参与对齐判定, 是否应每日更新)
TARGETS: list[tuple[str, str, str, str, bool, bool]] = [
    ("temp", "market_temp", "as_of_date", "A股温度计快照", True, True),
    ("temp_history", "market_temp_history", "trade_date", "温度计历史序列", True, True),
    ("pe_index", "pe_index", "pe_date", "四大指数 PE", True, True),
    ("thinktank", "thinktank_index", "trade_date", "智库指数", True, True),
    ("market_cap", "company_research", "updated_date", "企业研究市值", False, True),
    # 2026-10-20 起板块 PE 停止每日更新（历史数据保留），因此只报日期、不判新鲜度
    ("board_pe", "pe_industry_daily", "pe_date", "板块 PE（已停更）", False, False),
]

MAX_LAG_DAYS = int(os.environ.get("FT_FRESHNESS_MAX_LAG", "5"))


def _today() -> dt.date:
    return dt.date.today()


async def _probe(table: str, col: str) -> tuple[str | None, str | None]:
    """返回 (最新日期, 错误信息)。表不存在或查询失败时把原因带出来，不静默当空表。"""
    try:
        row = await db.select_one(table, columns=col, order=f"{col}.desc")
    except Exception as e:  # noqa: BLE001
        return None, str(getattr(e, "detail", e))[:160]
    if not row:
        return None, None
    value = row.get(col)
    return (str(value)[:10] if value else None), None


async def snapshot() -> dict[str, Any]:
    """生成一次完整自检结果（供 API 与 CLI 共用）。"""
    today = _today()
    items: list[dict[str, Any]] = []

    for key, table, col, label, aligned, daily in TARGETS:
        latest, error = await _probe(table, col)
        lag = None
        status = "ok"
        if error:
            status = "error"
        elif latest is None:
            status = "empty"
        else:
            try:
                lag = (today - dt.date.fromisoformat(latest)).days
            except ValueError:
                status = "error"
            else:
                if not daily:
                    status = "paused"  # 已停更的表：只报日期，不判新鲜度
                elif lag > MAX_LAG_DAYS:
                    status = "stale"

        items.append(
            {
                "key": key,
                "table": table,
                "column": col,
                "label": label,
                "latest": latest,
                "lag_days": lag,
                "status": status,
                "expects_daily": daily,
                "counts_for_alignment": aligned,
                "error": error,
            }
        )

    core = [i for i in items if i["counts_for_alignment"] and i["latest"]]
    aligned_dates = {i["latest"] for i in core}
    aligned_ok = len(aligned_dates) <= 1

    problems = [
        f"{i['label']}：{i['status']}" + (f"（{i['error']}）" if i["error"] else f"（最新 {i['latest']}）")
        for i in items
        if i["status"] in ("error", "empty", "stale")
    ]
    if not aligned_ok:
        detail = "、".join(f"{i['label']}={i['latest']}" for i in core)
        problems.append(f"核心数据族日期不一致：{detail}")

    return {
        "ok": not problems,
        "checked_at": dt.datetime.now().isoformat(timespec="seconds"),
        "today": today.isoformat(),
        "max_lag_days": MAX_LAG_DAYS,
        "aligned": aligned_ok,
        "core_latest": sorted(aligned_dates)[-1] if aligned_dates else None,
        "items": items,
        "problems": problems,
    }
