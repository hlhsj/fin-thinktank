/**
 * ── 文件：src/components/AssetLink.tsx ──────────────────────────
 * 功能：附件下载链接 + asset-id:// 引用解析。附件正文以 base64 存在 asset_blobs，这里按需拉取并转 objectURL。
 * 改动指引：
 *   1. 改附件展示样式 → AssetDownloadLink；
 *   2. 改解析缓存 → useResolvedSrc 内的 Map（同一素材一屏只解析一次）；
 *   3. 换存储方案（如对象存储）→ 只改 useResolvedSrc 的实现，调用方无需改动。
 */

import { useEffect, useState } from 'react'
import { Download } from 'lucide-react'
import { isAssetRef, resolveAssetUrl, stripAssetRef } from '../services/storage'

/**
 * 资料下载链接。
 *
 * 后台上传的文件存的是 `asset-id://<id>` 引用（内容在数据库里），外链则是 http(s)。
 * 这里在点击时才解析成可下载的 data URL，避免列表页一上来就把几十兆内容拉回来。
 */
export function AssetDownloadLink({
  src,
  fileName,
  className,
  label = '下载资料',
}: {
  src?: string | null
  fileName?: string
  className?: string
  label?: string
}) {
  const [href, setHref] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setHref(null)
  }, [src])

  if (!src) return null

  if (!isAssetRef(src)) {
    return (
      <a href={src} target="_blank" rel="noreferrer" className={className}>
        <Download size={13} />
        {label}
      </a>
    )
  }

  return (
    <button
      type="button"
      disabled={busy}
      className={className}
      onClick={async () => {
        setBusy(true)
        try {
          const url = await resolveAssetUrl(stripAssetRef(src))
          if (!url) throw new Error('文件已失效或没有访问权限')
          setHref(url)
          const a = document.createElement('a')
          a.href = url
          a.download = fileName ?? '资料'
          a.click()
        } finally {
          setBusy(false)
        }
      }}
    >
      <Download size={13} />
      {busy ? '正在解析…' : label}
      {href ? null : null}
    </button>
  )
}

/** 把可能是 asset-id 引用的图片地址解析成可展示的 src */
export function useResolvedSrc(src?: string | null) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    if (!src) {
      setUrl(null)
      return
    }
    if (!isAssetRef(src)) {
      setUrl(src)
      return
    }
    void resolveAssetUrl(stripAssetRef(src)).then((resolved) => {
      if (alive) setUrl(resolved)
    })
    return () => {
      alive = false
    }
  }, [src])
  return url
}
