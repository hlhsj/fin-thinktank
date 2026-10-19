import { cloud } from '../lib/cloud'
import type { AssetRow } from '../lib/types'

/** 列表用的列：**绝对不要**把 data 列拉回来，那是几十兆的 base64 */
const LIST_COLUMNS = 'id, owner_id, file_name, content_type, size_bytes, kind, created_at'

/** 自建账号体系下 owner_id 不会自动填充，全部读写都显式带 ownerId */
export async function listAssets(ownerId: string): Promise<AssetRow[]> {
  const { data, error } = await cloud.database
    .from('asset_blobs')
    .select(LIST_COLUMNS)
    .eq('owner_id', ownerId)
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) throw error
  return (data ?? []) as unknown as AssetRow[]
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
  const { data, error } = await cloud.database
    .from('asset_blobs')
    .insert({ ...row, owner_id: ownerId })
    .select(LIST_COLUMNS)
  if (error) throw error
  const created = Array.isArray(data) ? data[0] : null
  if (!created) throw new Error('素材保存失败，请稍后重试')
  return created as unknown as AssetRow
}

/** 取回某个素材的内容（data URL） */
export async function fetchAssetData(id: number): Promise<string | null> {
  const { data, error } = await cloud.database
    .from('asset_blobs')
    .select('data')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  const row = data as unknown as { data?: string } | null
  return row?.data ?? null
}

export async function removeAssetRecord(id: number, ownerId: string) {
  const { data, error } = await cloud.database
    .from('asset_blobs')
    .delete()
    .eq('id', id)
    .eq('owner_id', ownerId)
    .select('id')
  if (error) throw error
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error('删除未生效，该素材可能不属于当前账号')
  }
}
