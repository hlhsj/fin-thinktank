#!/usr/bin/env bash
# 数据任务的统一入口（手动补跑 / 换机迁移 / 故障后验收）。
#
# 真实链路（2026-10-25 按自动化实际定义核对，不是凭记忆）
#   自动化 b2f44ae2（每交易日 23:20）：scripts/market-daily-all.sh
#       ├─ ① 温度计：thermo-fetch.sh → thermo.mjs → load-temp-history.mjs（写 market_temp_history）
#       │    ⚠️ market_temp **快照**不由脚本写，原由自动化用 SQL upsert；
#       │       现可用 `python jobs/load_payload.py --apply` 代劳（默认 dry-run）
#       └─ ② 四大指数 PE：refresh-and-update.sh（预检 → 增量 → 入库后自校验）
#   自动化 9e66632e（每交易日 23:01）：企业市值 + 智库指数
#       ├─ market-cap-update.sh（东财/腾讯取市值与 PE-TTM）→ jobs/load_cap.py（写 company_research）
#       └─ fetch-kline.sh → gen-index-recent.py → jobs/load_index.py（写 thinktank_index）
#
# 用法
#   bash jobs/run_all.sh                 # 全部（市场数据 + 企业研究）；写库步骤默认 dry-run
#   bash jobs/run_all.sh market          # 只跑 温度计 + 四大指数 PE
#   bash jobs/run_all.sh cap             # 只跑 企业市值 + 智库指数
#   APPLY=1 bash jobs/run_all.sh cap     # 真正落库（不加 APPLY 只预演变化）
#   FULL=1 bash jobs/run_all.sh market   # 板块 PE 一起更新（仅用户明确要求时）
#
# 注意：cap 链路的日K默认只拉「近 150 天窗口」（与自动化一致，98 次请求）。
#   确需重建全量历史（2020 起，294 次请求，容易触发腾讯 WAF 501）时用：
#   FULL_HISTORY=1 bash jobs/run_all.sh cap
#
# 注意
#   · 必须在**本机**运行：连接器凭据 AES-GCM 加密存放在 ~/.workbuddy/connectors/，
#     部署沙箱里没有该目录与 master key（详见 jobs/README.md）。
#   · 不替代定时任务：自动化仍按 23:20 / 23:01 分头触发，这里用于补跑与验收。
#   · 每一步失败不中断后续步骤，收尾统一由 jobs/freshness.py 给结论。
set -uo pipefail

cd "$(dirname "$0")/.." || exit 1
ROOT="$(pwd)"
PY="${PY:-$ROOT/.venv/Scripts/python.exe}"
NODE="${NODE:-node}"
mkdir -p logs/jobs
LOG="logs/jobs/$(date +%Y-%m-%d).log"

step() { echo "[$(date +%H:%M:%S)] $*" | tee -a "$LOG"; }

run_task() {
  local name="$1"; shift
  step "▶ 开始：$name"
  if "$@" 2>&1 | tee -a "$LOG"; then
    step "✔ 完成：$name"
    return 0
  fi
  step "✘ 失败：$name（继续执行后续任务，结束后统一看自检）"
  return 1
}

task_market() {
  bash scripts/market-daily-all.sh
}

task_cap() {
  bash scripts/market-cap-update.sh || return 1
  # 落库：默认 dry-run 只打印变化；APPLY=1 才真正写 company_research
  if [ "${APPLY:-0}" = "1" ]; then
    "$PY" jobs/load_cap.py --apply || return 1
  else
    "$PY" jobs/load_cap.py || return 1
  fi
  if [ "${FULL_HISTORY:-0}" = "1" ]; then
    bash scripts/fetch-kline.sh || return 1          # 全量 2020 起（294 次请求，易触发 WAF）
  else
    bash scripts/fetch-kline.sh "$(date -d '150 days ago' +%Y-%m-%d)" "$(date +%Y-%m-%d)" || return 1
  fi
  # 智库指数增量：起点（最后交易日 + 点位）从云库取，避免人工搬运
  local base
  base="$("$PY" jobs/index_base.py)" || return 1
  # shellcheck disable=SC2086  # base 是 "日期 点位" 两个字段，故意分词
  set -- $base
  "$PY" scripts/output/gen-index-recent.py "$1" "$2" || return 1
  # 智库指数写库走 app_upsert_thinktank_index RPC（表直写权限已关闭）；
  # APPLY=1 时需要管理员凭据：环境变量 FT_ADMIN_PHONE / FT_ADMIN_PASSWORD。
  if [ "${APPLY:-0}" = "1" ]; then
    "$PY" jobs/load_index.py --apply || return 1
  else
    "$PY" jobs/load_index.py || return 1
  fi
}

TARGET="${1:-all}"
FAILED=0

case "$TARGET" in
  market) run_task "A股市场数据（温度计 + 四大指数 PE）" task_market || FAILED=1 ;;
  cap)    run_task "企业研究市值 + 智库指数（脚本部分）" task_cap || FAILED=1 ;;
  all)
    run_task "A股市场数据（温度计 + 四大指数 PE）" task_market || FAILED=1
    run_task "企业研究市值 + 智库指数（脚本部分）" task_cap || FAILED=1
    ;;
  *) echo "未知目标：$TARGET（可选 market | cap | all）" >&2; exit 2 ;;
esac

step "— 收尾自检 —"
if "$PY" jobs/freshness.py 2>&1 | tee -a "$LOG"; then
  step "自检通过"
else
  step "⚠️ 自检发现问题（详见上方明细与 logs/jobs/）"
  FAILED=1
fi

step "日志：$LOG"
exit "$FAILED"
