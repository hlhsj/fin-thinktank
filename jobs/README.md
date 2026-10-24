# jobs/ — 数据任务运维层

这个目录只做三件事：**统一入口、快照落库、收尾自检**。
抓取任务本身仍在 `scripts/` 里跑（原地未改），因为它们依赖本机凭据。

## 先对齐事实：现在是 2 个自动化，不是 3 个

2026-10-20 起「A股温度计」已并入「A股市场数据」任务，实际只剩两条自动化：

| 自动化 | 时间 | 入口 | 写什么 |
|---|---|---|---|
| `b2f44ae2` A股市场数据（温度计 + 四大指数 PE） | 每交易日 23:20 | `scripts/market-daily-all.sh` | `market_temp_history`、`pe_index`、`pe_extreme`、**`market_temp` 快照（由任务侧 SQL 写）** |
| `9e66632e` 企业研究表（市值 + 智库指数） | 每交易日 23:01 | `scripts/market-cap-update.sh` + `gen-cap-sql.py` + `fetch-kline.sh` | `company_research`、`thinktank_index` |

两条任务的 cwd 都指向 `F:\AI\WorkBuddy\sc`（v1 项目）。数据写在云库，所以**前端升级到 v2.0.0 不影响任务**——这是下面「不迁移」的核心前提。

## 为什么定时任务没有迁进 FastAPI（阶段 5 的结论）

重构文档原本计划「把定时任务迁入后端，不再依赖本机客户端在线」。实测后**放弃**，理由是一条硬约束：

| 事实 | 证据 |
|---|---|
| iFinD / 通达信凭据不用环境变量，而是**加密存在本机用户目录** | `~/.workbuddy/connectors/<userId>/` 下的 `.master.key`（32B）与 `connector-states.v3.json` |
| 解密是 AES-256-GCM + HKDF，密钥由 `.master.key` 与 userId 派生 | `scripts/decrypt-auth.mjs` 第 7–17 行 |
| AAD 绑定 userId 与字段路径 | `connector-states:headerOverrides:<plugin>\|<field>` |
| 部署沙箱是独立环境，**没有该用户目录，也没有 master key** | 部署产物只含项目目录，`~/.workbuddy/` 不在其中 |

把任务搬进沙箱后，第一步 `decrypt-auth.mjs` 就会失败且**无法自救**——iFinD 是服务端授权，本地没有 refresh_token / token 端点 / client_secret。

更关键的是收益为零：任务只往云库写数据，与前端版本解耦。前端升 v2.0.0 后，任务继续按原时间写 `pe_index` / `market_temp_history` / `company_research`，页面照常读到新数据。迁移只带来「凭据不可用」这一确定性故障。

因此阶段 5 改为三件可落地的事：统一入口、快照落库脚本化、收尾自检 + 线上可观测。

## 文件

| 文件 | 作用 |
|---|---|
| `run_all.sh` | 手动补跑入口。`bash jobs/run_all.sh` 全跑；`market` / `cap` 跑单项；`APPLY=1` 才落库；`FULL=1` 连板块一起更新 |
| `freshness.py` | 数据新鲜度自检。非零退出码＝有硬性问题；`--json` 供机器读；`--warn-only` 长假期间只报告不阻断 |
| `load_payload.py` | 把 `market_temp_payload.json` upsert 进 `market_temp`（默认 dry-run）。取代自动化里手写的那段 SQL |
| `load_cap.py` | 把 `market_cap.json` 直接 PATCH 进 `company_research`（默认 dry-run），取代 `gen-cap-sql.py` + 人工执行 SQL |
| `load_index.py` | 把 `thinktank_index_recent.json` upsert 进 `thinktank_index`（默认 dry-run），取代 `update_index_recent.sql` |
| `index_base.py` | 打印智库指数「最后交易日 + 点位」，给 `gen-index-recent.py` 当增量起点，免人工搬运 |
| `../logs/jobs/YYYY-MM-DD.log` | 统一入口的运行日志（自动创建） |

## freshness.py 的判定口径

| 维度 | 含义 |
|---|---|
| `latest` | 该表按日期列倒序第一行 |
| `lag_days` | 今天 − latest（自然日）。阈值默认 5 天，可用 `FT_FRESHNESS_MAX_LAG` 覆盖 |
| `aligned` | 核心四族（温度计快照 / 温度计历史 / 四大指数 PE / 智库指数）最新日期是否一致 |
| `paused` | 板块 PE 自 2026-10-20 起停止每日更新，只报日期不判新鲜度，避免长期误报 |

**为什么要看 `aligned`**：两条任务在不同时间触发。某一个悄悄失败时，几张表会出现「三个新、一个旧」——单看每张表都「2 天前，还算新」，只有对齐比较才能暴露。

## 写权限矩阵（2026-10-25 用「错类型探针」实测，不写入任何行）

| 表 | 后端 key 写入 | 说明 |
|---|---|---|
| `market_temp` | ✅ 可写 | `load_payload.py --apply` 可用 |
| `market_temp_history` | ✅ 可写 | — |
| `pe_index` | ✅ 可写 | — |
| `company_research` | ✅ 可写 | `load_cap.py --apply` 可用 |
| `thinktank_index` | ❌ 42501 | `load_index.py --apply` 会以退出码 3 停止并给处置建议 |

`thinktank_index` 目前只能由自动化用 MCP 执行 `update_index_recent.sql` 写入。要改成脚本直写，
需要在该表上加一个 SECURITY DEFINER 的 `app_*` RPC（与 `app_read_chapters` 同思路）。

## 已知边界

- 自检**不判断工作日**：阈值是自然日 5 天，春节这类长假会正常落到 `ok`，不会误报；代价是无法识别「周三该更新却没更新」（滞后只有 2 天）。要更严格可在 `freshness.py` 里换成交易日历。
- 自检**不校验数值合理性**（温度突变、PE 为负），只校验日期。数值层面由 `scripts/check-pe-data.mjs` 负责。
- **落库默认不写**：`run_all.sh` 里 `load_cap.py` / `load_index.py` / `load_payload.py` 都是 dry-run，
  加 `APPLY=1`（或单独加 `--apply`）才真正写库。这是刻意的——补跑常常只是想看「差哪些数据」。
- 自动化里的写库仍走 SQL（MCP 执行），本目录的 loader 是**同一口径的替代实现**，两者不要同时改规则：
  改 `min_pe_10y` 的修正逻辑时，`gen-cap-sql.py` 与 `load_cap.py` 必须一起改。
