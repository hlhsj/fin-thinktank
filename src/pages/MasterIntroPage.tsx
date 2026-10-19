import { Link } from 'react-router-dom'
import { ArrowLeft, Crown, Sparkles, Users } from 'lucide-react'
import { Card, Disclaimer, PageHeader } from '../components/PageHeader'
import { SITE } from '../lib/site'

const MODULES = [
  {
    no: '01',
    title: '顶级投研能力',
    desc: '像研究员一样思考：财报跟踪、行业研究框架，从读得懂得写到写得出。',
  },
  {
    no: '02',
    title: '深度投研资料',
    desc: '独立进阶库，随课程持续扩充，讲义、研报、模板工具一并给到。',
  },
  {
    no: '03',
    title: '市场敏感度培养',
    desc: '每周小班直播，连麦陪跑，训练消息辨析与情绪感知。',
  },
  {
    no: '04',
    title: '个人数据网站搭建',
    desc: '从零搭建个人数据阵地，把判断沉淀成可查询的资产。',
  },
]

const ABILITIES = ['研究力', '资料库', '市场感', '数据力']

export function MasterIntroPage() {
  return (
    <div className="min-h-screen bg-ink-950">
      <header className="border-b border-ink-700">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="serif flex h-9 w-9 items-center justify-center rounded-xl border border-gold/40 bg-gradient-to-br from-gold/25 to-transparent text-[17px] text-gold-soft">
              {SITE.logoMark}
            </span>
            <span className="serif text-[15px] text-mist-100">
              {SITE.name} · {SITE.subName}
            </span>
          </Link>
          <Link to="/" className="text-[12.5px] text-mist-500 transition hover:text-mist-200">
            返回登录
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-10">
        <PageHeader
          eyebrow="Advanced Program"
          title="投研高级学员"
          desc="小班陪跑制，首批两人即开班。目标不是「听完课」，而是练出属于自己的研究体系。"
        />

        <Card className="mb-6 border-gold/25 bg-gradient-to-br from-gold/8 to-transparent">
          <p className="flex items-center gap-2 text-[13px] text-gold-soft">
            <Crown size={15} />
            小班陪跑 · 首批两人即开班
          </p>
          <p className="mt-2 text-[13.5px] leading-relaxed text-mist-400">
            每周日连麦陪跑，上午讲课 + 下午陪跑，全程记录可回看。作业逐份批改，
            结营材料统一归档。
          </p>
        </Card>

        <section className="mb-8">
          <h2 className="mb-3 text-[15px] text-mist-200">四大能力维度</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {ABILITIES.map((item) => (
              <div
                key={item}
                className="rounded-xl border border-ink-700 bg-ink-900 p-4 text-center text-[14px] text-mist-100"
              >
                {item}
              </div>
            ))}
          </div>
        </section>

        <section className="mb-8">
          <h2 className="mb-3 text-[15px] text-mist-200">五大训练模块</h2>
          <div className="space-y-3">
            {MODULES.map((m) => (
              <Card key={m.no}>
                <div className="flex gap-4">
                  <span className="serif text-[22px] leading-none text-gold-soft">{m.no}</span>
                  <div>
                    <p className="text-[14.5px] text-mist-100">{m.title}</p>
                    <p className="mt-1 text-[12.5px] leading-relaxed text-mist-600">{m.desc}</p>
                  </div>
                </div>
              </Card>
            ))}
            <Card className="border-purple-500/25 bg-purple-500/[0.05]">
              <div className="flex gap-4">
                <span className="serif text-[22px] leading-none text-purple-200">05</span>
                <div>
                  <p className="text-[14.5px] text-mist-100">作业与结营</p>
                  <p className="mt-1 text-[12.5px] leading-relaxed text-mist-600">
                    每次课后作业由讲师发布并批改，结营材料在专区提交。
                  </p>
                </div>
              </div>
            </Card>
          </div>
        </section>

        <div className="flex flex-wrap gap-3">
          <Link to="/pay" className="btn btn-primary">
            <Sparkles size={15} />
            申请开通
          </Link>
          <Link to="/" className="btn btn-ghost">
            <Users size={15} />
            先看看学员权益
          </Link>
          <Link to="/" className="btn btn-ghost">
            <ArrowLeft size={15} />
            回到登录
          </Link>
        </div>

        <Disclaimer text="本页仅介绍课程能力维度与训练方式，不构成投资建议。" />
      </main>

      <footer className="border-t border-ink-700 py-5 text-center text-[11.5px] text-mist-700">
        {SITE.fullName}
      </footer>
    </div>
  )
}
