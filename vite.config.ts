import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  // 发布后用反向代理域名访问，静态资源必须用相对路径
  base: './',
  plugins: [react(), tailwindcss()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    // 反向代理域名需要显式放行，否则 Vite 会拦截请求
    allowedHosts: true,
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    allowedHosts: true,
  },
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        // ⚠️ 必须用函数形式：对象写法（echarts: ['echarts']）会把整包入口当作 chunk 入口，
        // 强制把全量 echarts（含未按需引入的部分）打进 chunk。函数形式才能做到真正按需分包。
        manualChunks(id) {
          if (id.includes('node_modules/echarts') || id.includes('node_modules/zrender')) return 'echarts'
          if (/node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/.test(id)) {
            return 'react'
          }
          if (/node_modules[\\/](react-markdown|remark-|rehype-|highlight\.js|mdast|micromark|unified|unist)/.test(id)) {
            return 'markdown'
          }
          if (id.includes('node_modules/@tencent-ai/workbuddy-cloud-sdk')) return 'cloud'
          return undefined
        },
      },
    },
  },
})
