import { call } from './api'
import type { AssetRow } from '../lib/types'

/** 列表用的列：**绝对不要**把 data 列拉回来，那是几十兆的 base64 */
const LIST_COLUMNS = 'id, owner_id, file_name, content_type, size_bytes, kind, created_at'

/** v2：资产读写经 BFF（后端校验会话并把 owner_id 绑到当前用户） */
export async function listAssets(ownerId: string): Promise<AssetRow[]> {
  return call<AssetRow[]>('listAssets', { ownerId })
}

export type NewAsset = {
  file_name: string
  content_type: string
  size_bytes: number
  kind: 'image' | 'file'
  /** base64 / data URL 形式的完整内容 */
  data: string
}

export async function saveAsset(ownerId: string, row: NewAsset): Promise<AssetRow> {
  const created = await call<AssetRow | null>('saveAsset', { ownerId, row })
  if (!created) throw new Error('素材保存失败，请稍后重试')
  return created
}

/** 取回某个素材的内容（data URL） */
export async function fetchAssetData(id: number): Promise<string | null> {
  return call<string | null>('fetchAssetData', { id })
}

export async function removeAssetRecord(id: number, ownerId: string) {
  await call('removeAssetRecord', { id, ownerId })
}

export { LIST_COLUMNS }
