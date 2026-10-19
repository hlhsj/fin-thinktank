import { fetchAssetData } from './assets'

/**
 * 素材引用：`asset-id://<素材主键>`。
 *
 * 为什么不用云端对象存储：本站采用自建账号体系（见 services/auth.ts），
 * 没有云服务会话，而云存储的上传与签名下载都强制校验会话 —— 无会话时
 * 一律返回 401 MISSING_CREDENTIALS（已实测）。因此图片与附件改为连同正文
 * 一起存进云数据库的 asset_blobs 表，Markdown 里只留一个轻量的资源引用。
 *
 * 图片在入库前会先压缩（最长边 1600px、JPEG 0.82），避免把几十兆 base64 塞进表里。
 */

export const ASSET_PREFIX = 'asset-id://'

/** 附件大小上限：超过这个体积就不适合用 base64 存表 */
export const MAX_FILE_BYTES = 5 * 1024 * 1024
/** 原始图片超过这个体积才触发压缩 */
const COMPRESS_THRESHOLD = 200 * 1024
const MAX_IMAGE_EDGE = 1600
const JPEG_QUALITY = 0.82

/** data URL 缓存：同一个素材在一屏里出现多次只解析一次 */
const urlCache = new Map<string, string>()
const inflight = new Map<string, Promise<string | null>>()

export function asAssetRef(assetId: number | string) {
  return `${ASSET_PREFIX}${assetId}`
}

export function isAssetRef(src?: string | null): src is string {
  return Boolean(src && src.startsWith(ASSET_PREFIX))
}

export function stripAssetRef(src?: string | null) {
  return isAssetRef(src) ? src.slice(ASSET_PREFIX.length) : src ?? ''
}

/** 数据库中的封面字段可能存完整引用、裸 id，也可能已经是外链 */
export function displaySrc(raw?: string | null): string | null {
  if (!raw) return null
  if (/^https?:\/\//.test(raw)) return raw
  if (isAssetRef(raw)) return raw
  return asAssetRef(raw)
}

/** 把素材引用解析成可直接展示的 data URL */
export function resolveAssetUrl(assetKey: string): Promise<string | null> {
  if (!assetKey) return Promise.resolve(null)
  const hit = urlCache.get(assetKey)
  if (hit) return Promise.resolve(hit)

  const pending = inflight.get(assetKey)
  if (pending) return pending

  const task = (async () => {
    try {
      const id = Number(assetKey)
      if (!Number.isFinite(id)) return null
      const data = await fetchAssetData(id)
      if (!data) return null
      urlCache.set(assetKey, data)
      return data
    } catch {
      return null
    } finally {
      inflight.delete(assetKey)
    }
  })()

  inflight.set(assetKey, task)
  return task
}

export function peekAssetUrl(assetKey: string) {
  return urlCache.get(assetKey) ?? null
}

function readAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('文件读取失败，请重试'))
    reader.readAsDataURL(file)
  })
}

/**
 * 压缩位图：先把画布缩放到最长边 1600，再导出 JPEG。
 * SVG 不压缩（矢量放大无损，转 JPEG 反而更差），也不处理动图帧。
 */
async function compressImage(file: File): Promise<string | null> {
  if (file.type === 'image/svg+xml' || file.type === 'image/gif') return null
  if (typeof createImageBitmap === 'undefined') return null
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(bitmap, 0, 0, width, height)
    bitmap.close?.()
    return canvas.toDataURL('image/jpeg', JPEG_QUALITY)
  } catch {
    return null
  }
}

export interface PreparedAsset {
  dataUrl: string
  contentType: string
  sizeBytes: number
  kind: 'image' | 'file'
}

/** 把本地文件转成可入库的形式 */
export async function prepareAsset(file: File): Promise<PreparedAsset> {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(`「${file.name}」超过 ${MAX_FILE_BYTES / 1024 / 1024}MB，请压缩后再上传`)
  }
  const isImage = file.type.startsWith('image/')
  let dataUrl = await readAsDataUrl(file)
  let contentType = file.type || 'application/octet-stream'

  if (isImage && file.size > COMPRESS_THRESHOLD) {
    const compressed = await compressImage(file)
    if (compressed && compressed.length < dataUrl.length) {
      dataUrl = compressed
      contentType = 'image/jpeg'
    }
  }

  // base64 大约比原始二进制大 1/3，这里按 data URL 长度回写入库体积
  const base64Length = dataUrl.includes(',') ? dataUrl.length - dataUrl.indexOf(',') - 1 : dataUrl.length
  return {
    dataUrl,
    contentType,
    sizeBytes: Math.round(base64Length * 0.75),
    kind: isImage ? 'image' : 'file',
  }
}
