import { AlertTriangle } from 'lucide-react'
import { cn } from '../lib/utils'

/**
 * 程序化估值失真风险提示。
 *
 * 为什么单独做一个组件而不是只写在页脚免责声明里：
 * 估值结论带有精确到分的价位（公平价、理论安全边际），这种「精度感」本身会误导人；
 * 而页脚的免责声明是通用措辞，读者滑到底部才看到。风险提示必须放在
 * **读者看到数字之前**，且只针对本模块。
 *
 * 用金色而非红色：这是「需要对数字保持警惕」的方法论提醒，不是「系统出错」。
 */
export function ValuationRiskNotice({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'mb-4 flex gap-2.5 rounded-xl border border-gold/35 bg-gold/10 px-4 py-3',
        className,
      )}
    >
      <AlertTriangle size={16} className="mt-0.5 shrink-0 text-gold" />
      <div className="text-[12.5px] leading-relaxed">
        <p className="font-medium text-gold-soft">程序化估值有失真风险</p>
        <p className="mt-0.5 text-mist-500">
          模型基于公开财报与人工标定参数运行，无法识别财务造假、突发事件、行业逻辑变化与政策冲击；
          同一家公司在不同参数下可能得出相差数倍的结论。页面上的价位精确到分，但精度不等于准确度——
          请把它当作学习估值方法论的教具，而不是交易依据。
        </p>
      </div>
    </div>
  )
}
