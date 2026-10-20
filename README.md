# 金融智库 · 金融学习平台

面向个人投资者的金融学习平台前端：把知识库、案例复盘、企业研究、A 股行情看板、量化情绪指标（温度计）与会员权益体系整合进一个站点。

- **技术栈**：React 19 · TypeScript 5.9 · Vite 7 · Tailwind CSS v4 · ECharts 6 · React Router 7
- **数据层**：WorkBuddy Cloud SDK（PostgREST 兼容的托管云数据库 + 自建账号体系）
- **形态**：纯前端 SPA（HashRouter），无自建 Node 服务端

> ⚠️ **本仓库是纯代码展示版**：不含任何用户数据、行情数据、课程/研报内容，也不含任何真实环境凭据。
> 克隆后只能得到可运行的界面骨架，业务数据需接入你自己的云服务（见「云服务与数据模型」）。

---

## 一、功能模块

| 模块 | 说明 | 实现要点 |
| --- | --- | --- |
| 知识库 | 文章列表 / 详情、章节树、Markdown 渲染、素材附件 | `react-markdown` + `remark-gfm` + `rehype-highlight`；图片与附件以 base64 存表、按需转 objectURL |
| 案例复盘 | 复盘文档列表与详情、视频嵌入（B 站 / mp4） | 统一 `ContentGuard` 做复制/右键拦截，白名单区域放行 |
| 企业研究表 | 企业清单、市值 / PE / 财务指标 | 表格虚拟化渲染 + 期间筛选 |
| A 股市场数据 | 4 大指数平均 PE、33 地域 + 30 行业 PE、历史 PE-TTM 分位 | ECharts 折线/柱状，统一 hover 十字线；分位按当日值在历史 min/max 区间取相对位置 |
| A 股温度计 | 7 因子等权合成 0–100 情绪读数，按 20/40/60/80 分区着色 | 7 个因子各有详情页（Tab 切换），含历史曲线回溯 |
| 估值实验室 | 输入代码 / 名称批量估值（单次最多 10 只），输出结论、价格区间、四维评分与趋势判断 | 计算全部在后端完成（Python 服务 `/api/*`），前端只负责输入与渲染；判定文案由「操作导向」转为「估值导向」，避免交易指令式表述 |
| 学习计划 | 周计划条目、完成状态、打卡统计 | 乐观更新 + 本地缓存 |
| 作业 | 高级学员作业列表与提交 | 提交内容与账号绑定 |
| 会员与续费 | 学员 / 高级学员两档权益，下单 + 收款码 + 人工对账 | 前端只做展示与引导，时长上限与份数规则服务端二次校验 |
| 留言板 | 学员留言、管理员回复与置顶 | 分页 + 置顶排序 |
| 个人中心 | 权益到期时间、改绑手机号 | 手机号脱敏展示 |
| 管理后台 | 内容 CRUD、用户权益发放/收回、订单、密码重置、留言管理 | 分面板 Tab，统一 `SessionAuth` 鉴权 |
| 主题切换 | 全站日 / 夜双主题 | CSS 变量 + `data-theme`，`localStorage` 持久化并在首屏前内联恢复，避免闪白 |

页面全部按路由懒加载，并用手写 `manualChunks` 把 `echarts` / `react` / `markdown` / `cloud` 拆成独立 chunk，首屏不下载图表库。

---

## 二、目录结构

```
.
├── index.html                 # 入口，含首屏主题恢复脚本与兜底背景
├── vite.config.ts             # 构建配置（base './' + 手动分包）
├── tsconfig.json
├── public/
│   └── wechat-pay-qr.svg      # 收款码占位图（部署时替换）
└── src/
    ├── App.tsx                # 路由表 + 权限门（会员 / 高级会员 / 管理员）
    ├── main.tsx
    ├── index.css              # Tailwind v4 主题变量（日夜双套）
    ├── components/            # 布局、卡片、Markdown、内容保护、错误边界等
    ├── context/               # Auth / Theme / Toast
    ├── lib/
    │   ├── cloud.ts           # 云服务客户端（全局单例）
    │   ├── config.ts          # 环境变量读取
    │   ├── database.types.ts  # 30 张表的 Schema 类型
    │   ├── types.ts           # 行类型定义
    │   ├── thermo.ts          # 温度计因子元数据与分区
    │   └── utils.ts           # 日期、格式化、错误文案
    ├── pages/                 # 22 个页面
    └── services/              # 按领域拆分的云库读写（内容 / 账号 / 素材 / 缓存）
```

---

## 三、快速开始

要求：Node.js ≥ 20。

```bash
# 1. 安装依赖（用 lockfile 保证可复现）
npm ci

# 2. 配置云服务（不配置也能启动，但所有数据请求都会失败）
cp .env.example .env.local
# 编辑 .env.local，填入你自己的 endpoint / publishableKey

# 3. 开发
npm run dev        # http://localhost:5173

# 4. 类型检查与构建
npm run typecheck
npm run build
npm run preview    # http://localhost:4173
```

环境变量说明：

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `VITE_CLOUD_ENDPOINT` | 是 | 应用发布域名，承载 `/.cloud/**` 接口 |
| `VITE_CLOUD_OAUTH_RELAY` | 否 | OAuth 中继地址，由云服务控制台下发，不可自行拼接 |
| `VITE_CLOUD_PUBLISHABLE_KEY` | 是 | 客户端 key，可出现在前端产物中，但绑定了域名与额度，**不要提交真实值** |
| `VITE_ADMIN_WECHAT` | 否 | 续费页展示的管理员微信号，缺省为占位串 |

> `publishableKey` 本身不携带权限（服务端按 Origin 校验并配合行级策略），但它指向你名下的应用与配额，
> 因此仍然只放在本地 `.env.local`，仓库里只有 `.env.example`。

---

## 四、云服务与数据模型

前端只依赖一个客户端实例（`src/lib/cloud.ts`），通过 `Database` 泛型获得表级类型提示。共 30 张表，按域划分：

| 域 | 表 |
| --- | --- |
| 内容 | `kb_articles`、`doc_chapter`、`glossary`、`review`、`case_video`、`course_video`、`assets`、`asset_blobs`、`master_material` |
| 学习 | `study_plans`、`plan_items`、`favorites`、`master_homework`、`homework_submit` |
| 行情 | `market_data`、`market_extreme`、`pe_index`、`pe_industry`、`pe_industry_daily`、`pe_extreme`、`thinktank_index`、`company_research`、`market_temp`、`market_temp_history`、`stock_valuation` |
| 账号与交易 | `phone_change`、`orders`、`trade_position`、`trade_history` |

> `app_users`（手机号、bcrypt 密码哈希、权益到期时间）不在客户端可见表内：它开启了 RLS 且不建任何读策略，
> 客户端角色拿不到任何一行，注册 / 登录 / 发放权益全部走 `SECURITY DEFINER` 的 RPC 函数。
| 互动 | `messages` |

几个设计取舍：

1. **自建手机号 + bcrypt 账号**：云服务的 Auth 依赖短信验证码通道，因此账号体系落在自建表与 `SECURITY DEFINER` 函数里，
   前端只保存会话令牌。代价是数据隔离从「平台级」降级为「应用层」，所有写操作必须在服务端函数里校验 `uid`。
2. **附件不进对象存储**：无云会话时对象存储的签名下载一律 401，因此图片与附件压缩后以 base64 存进 `asset_blobs`，
   正文里只留 `asset-id://<id>` 轻量引用，渲染时按需转 objectURL。
3. **读多写少**：列表页走 `useCachedResource`（内存缓存 + 失效时间），避免每次切 Tab 都重新拉全表。

---

## 五、数据管道（不随本仓库分发）

线上数据由独立于本仓库的离线管道维护，形态是 **Shell 取数 → Node 计算 → REST 入库**，由定时任务驱动：

```
行情源(HTTP)  ──curl──▶  原始快照(本地)  ──node──▶  归一化 + 指标计算  ──▶  云库 upsert
```

之所以不把管道代码放进仓库：它绑定了具体数据源的接口与授权方式，且包含线上域名与项目 key；
公开分发既涉及第三方数据源的使用条款，也没有复用价值。**本仓库只保留与数据无关的前端消费逻辑**。

---

## 六、合规与数据说明

本仓库在导出时做了以下处理，可逐项核对：

| 项目 | 状态 |
| --- | --- |
| 用户数据（手机号、密码哈希、订单、留言、作业） | ❌ 不含，全部留在私有数据库 |
| 行情与财务数据（K 线、PE、融资融券、企业财务） | ❌ 不含，`scripts/output` 等导出目录已在 `.gitignore` 中 |
| 课程 / 研报 / 复盘正文 | ❌ 不含，均为数据库内容 |
| 真实环境凭据（endpoint、publishableKey、appId） | ❌ 不含，改由 `.env.local` 注入 |
| 个人联系方式（微信号、手机号） | ❌ 不含，改为 `VITE_ADMIN_WECHAT` 环境变量 |
| 收款二维码 | ⚠️ 仅为占位 SVG，部署时自行替换 |
| 第三方数据源抓取代码 | ❌ 不含（见上一节） |

换句话说：**这是一个「能跑起来但没有任何内容」的壳**。要变成可用产品，需要自建云服务、导入自有数据、配置收款方式。

> 免责声明：本项目仅用于技术学习与个人研究，页面上展示的任何行情统计都不构成投资建议。

---

## 七、前端实现中的几个坑（供参考）

1. **Tailwind v4 与主题变量**：ECharts 无法直接消费 CSS 变量，绘制前需 `getComputedStyle` 解析成具体色值，主题切换时重绘。
2. **日夜主题覆盖**：白天主题的覆盖块必须是 unlayered 规则，否则会被 `@layer` 里的工具类压过。
3. **iframe 预览环境**：`window.confirm/alert` 会被静默拦截（返回 `false`），所有确认交互改为应用内对话框。
4. **HashRouter + 相对 base**：发布在反向代理子路径下时，`base: './'` 与 hash 路由组合最稳，静态资源不需要绝对路径。
5. **表格与列表的移动端适配**：宽表用容器横向滚动而非压缩列宽，避免数字换行。

---

## 八、已知限制

- 未接入云服务时，登录、列表、图表均为空态或报错——这是预期行为，不是 bug。
- AI 助教页目前是占位 UI，未接入模型。
- 估值实验室依赖外部 Python 后端（`/api/search`、`/api/valuate`），本仓库**不含后端实现**；未部署时页面会提示接口不可用，这是预期行为。
- 付费流程是「下单 → 扫码 → 人工核对开通」，没有接支付网关回调。

---

## 九、二次开发：改哪里

`src/` 下每个文件头部都有一段「功能 / 数据 / 改动指引 / 注意」注释块，改代码前先看文件头能少走很多弯路。常见需求速查：

| 我想改… | 文件 | 关键位置 |
| --- | --- | --- |
| 品牌名、Logo 字母、页脚 | `src/lib/site.ts` | `SITE` |
| 配色、字体、涨跌色 | `src/index.css` | `:root` 与 `[data-theme='light']` 两套变量 |
| 侧边栏菜单 | `src/components/AppShell.tsx` | `MEMBER_NAV` / `MASTER_NAV` |
| 新增页面 | `src/App.tsx` + `AppShell.tsx` | 路由表 + 菜单（两处都要改） |
| 套餐价格、权益文案 | `src/lib/site.ts` | `PLANS`（成交价另由服务端价格表决定） |
| 收款码、管理员微信 | `public/wechat-pay-qr.svg`、`.env.local` | `VITE_ADMIN_WECHAT` |
| 温度计分区阈值、因子说明 | `src/lib/thermo.ts` | `ZONES` / `FACTOR_META` |
| 估值结论文案 / 配色 | `src/lib/valuation.ts` | `verdictLabel` / `verdictTone` |
| 估值接口地址 / 超时 | `src/services/valuateLive.ts` | `getJson` 的 url、`TIMEOUT_MS` |
| 估值结果展示结构 | `src/components/ValuationResultView.tsx` | `DIM_LABELS` / `TREND_LABELS` / `RangeRuler` |
| 指数与板块配色 | `src/pages/MarketPage.tsx` | `INDEX_META` / `CHART_PALETTE` |
| 表格列 | `src/pages/CompanyResearchPage.tsx`、`MarketPage.tsx` | 表头与 tbody 需同步修改 |
| 后台页签 | `src/pages/AdminPage.tsx` | `Tab` 类型 + `TABS` + 渲染分支 |
| 后台内容表单 | `src/components/AdminContent.tsx` | 六个 `XxxPanel` |
| 数据表加字段 | `src/lib/types.ts` | 对应 `XxxRow` |
| 新增接口 / 查询 | `src/services/content.ts` | 参考 `listReviews` 三件套 |
| 账号与权益逻辑 | `src/services/auth.ts` + `src/context/AuthContext.tsx` | RPC 封装 / 权益判定 |
| 缓存时长 | `src/services/cache.ts` | `DEFAULT_TTL` |
| 图表能力（新增图表类型） | `src/lib/echarts.ts` | `echarts.use([...])` 必须注册 |

> 全局约定：天数按 30 天/月折算；涨红跌绿；所有确认交互走 `useConfirm()`；所有图表颜色经 `resolveCssVar()` 解析。

---

## 十、发版流程

版本号写在 `package.json`，每次发版同步更新 `CHANGELOG.md`，然后推标签即可，GitHub Actions 会自动完成「类型检查 → 构建 → 创建 Release」：

```bash
# 1. 改版本号与更新日志
#    package.json  version: 1.2.0
#    CHANGELOG.md  新增 "## v1.2.0 — YYYY-MM-DD" 段落

# 2. 提交
git add -A && git commit -m "feat: xxx（v1.2.0）"

# 3. 打标签并推送（标签格式必须是 v 开头，如 v1.2.0）
git tag -a v1.2.0 -m "v1.2.0 — 一句话说明"
git push origin main
git push origin v1.2.0
```

工作流 `.github/workflows/release.yml` 的行为：

- 触发：推送 `v*` 标签，或在 Actions 页面手动运行（可指定任意已有标签，用于补建/修正发行说明）
- 门禁：`npm ci` → `npm run typecheck` → `npm run build`，任一步失败都不发版
- 发行说明：自动截取 `CHANGELOG.md` 中对应版本的段落作为 Release 正文
- 附件：GitHub 自动附带该标签的源码 zip / tar.gz

> 手动补建：Actions → Release → Run workflow → 填标签（如 `v1.1.0`）。若该版本 Release 已存在，会改为更新其发行说明。

---

## 十一、许可

本仓库未附加开源许可，仅用于代码展示与交流。如需引用、二次分发或商用，请先联系作者获得书面许可。
