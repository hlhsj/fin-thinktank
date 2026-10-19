/**
 * ── 文件：src/lib/echarts.ts ────────────────────────────────────
 * 功能：ECharts 按需注册（只有折线图 + 必要组件 + SVG 渲染器），控制图表包体积。
 * 改动指引：
 *   1. 新增图表类型（柱状、饼图、散点）→ 从 echarts/charts 引入并加入 echarts.use([...])，
 *      否则运行时要么报错要么静默不渲染；
 *   2. 需要新组件（DataZoom、VisualMap、Title）→ 同样在 echarts/components 里注册；
 *   3. 换 Canvas 渲染 → 替换 SVGRenderer（导出图片与主题表现会随之变化）。
 */

/**
 * ECharts 按需引入（统一入口）。
 *
 * 为什么不用 `import * as echarts from 'echarts'`：
 * 整包引入会产出约 1.1MB（gzip 377KB）的 chunk，而本项目只画折线图，
 * 按需注册后体积可大幅下降。
 *
 * ⚠️ 新增图表类型/组件时**必须在此处注册**，否则运行时会报错或静默失效。
 * 已核实各页面用到的特性：
 *   - LineChart          所有图表（温度曲线、PE 走势、因子走势、智库指数）
 *   - GridComponent      坐标系
 *   - TooltipComponent   悬停提示
 *   - AxisPointerComponent 十字准线 —— 注意它**不会**随 TooltipComponent 自动安装，必须显式注册
 *   - LegendComponent    MarketPage 四指数图的图例
 *   - MarkLineComponent  BoardPeChart / FactorChart 的参考线
 *   - MarkAreaComponent  FactorChart 的温度区间底色
 *   - SVGRenderer        全站统一用 SVG 渲染器（截图/缩放/主题表现更可控）
 */
import * as echarts from 'echarts/core'
import { LineChart } from 'echarts/charts'
import {
  AxisPointerComponent,
  GridComponent,
  LegendComponent,
  MarkAreaComponent,
  MarkLineComponent,
  TooltipComponent,
} from 'echarts/components'
import { SVGRenderer } from 'echarts/renderers'

echarts.use([
  LineChart,
  GridComponent,
  TooltipComponent,
  AxisPointerComponent,
  LegendComponent,
  MarkLineComponent,
  MarkAreaComponent,
  SVGRenderer,
])

export { echarts }
/** 仅类型（编译期擦除，不引入运行时体积） */
export type { EChartsOption } from 'echarts'
