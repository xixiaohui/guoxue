/**
 * 云函数 guoxueDB v1.0
 * 统一管理 guoxue 集合的 CRUD 操作
 *
 * 集合：guoxue
 * 字段：
 *   _id          string   自动生成
 *   type         string   内容类型: poem|idiom|history|philosopher|classic|daily
 *   key          string   唯一键（用于查询缓存），如 "成语_卧薪尝胆"
 *   title        string   标题/名称
 *   content      string   主体内容（AI生成，格式化文本）
 *   sections     array    解析后的段落 [{label,content}]
 *   meta         object   额外元数据（作者、朝代等）
 *   created_at   number   创建时间戳
 *   updated_at   number   更新时间戳
 *   hit_count    number   被查询次数
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const COLLECTION = 'guoxue';

exports.main = async (event, context) => {
  const { type } = event;
  if (!type) return _err('缺少操作类型');

  try {
    switch (type) {
      case 'get':       return await getContent(event);
      case 'set':       return await setContent(event);
      case 'list':      return await listContent(event);
      case 'search':    return await searchContent(event);
      case 'batchSet':  return await batchSetContent(event);
      case 'delete':    return await deleteContent(event);
      case 'preload':   return await preloadContent(event);
      default:          return _err('未知操作类型: ' + type);
    }
  } catch (e) {
    console.error('[guoxueDB] error:', e);
    return _err(e.message || '云数据库操作失败');
  }
};

// ─── 查询单条缓存 ─────────────────────────────────────────────
async function getContent(event) {
  const { contentType, key } = event;
  if (!contentType || !key) return _err('缺少 contentType 或 key');

  const cacheKey = `${contentType}_${key}`;
  const res = await db.collection(COLLECTION)
    .where({ type: contentType, key: cacheKey })
    .limit(1)
    .get();

  if (res.data && res.data.length > 0) {
    const doc = res.data[0];
    // 异步增加命中计数（不等待）
    db.collection(COLLECTION).doc(doc._id).update({
      data: { hit_count: _.inc(1), updated_at: Date.now() }
    }).catch(() => {});
    return _ok({ found: true, data: doc });
  }
  return _ok({ found: false });
}

// ─── 保存/更新缓存 ────────────────────────────────────────────
async function setContent(event) {
  const { contentType, key, title, content, sections, meta } = event;
  if (!contentType || !key) return _err('缺少 contentType 或 key');

  const cacheKey = `${contentType}_${key}`;
  const now = Date.now();

  // 检查是否已存在
  const existing = await db.collection(COLLECTION)
    .where({ type: contentType, key: cacheKey })
    .limit(1)
    .get();

  if (existing.data && existing.data.length > 0) {
    // 更新
    await db.collection(COLLECTION).doc(existing.data[0]._id).update({
      data: {
        title:      title || existing.data[0].title,
        content:    content || '',
        sections:   sections || [],
        meta:       meta || {},
        updated_at: now
      }
    });
    return _ok({ action: 'updated', id: existing.data[0]._id });
  } else {
    // 新增
    const res = await db.collection(COLLECTION).add({
      data: {
        type:       contentType,
        key:        cacheKey,
        title:      title || key,
        content:    content || '',
        sections:   sections || [],
        meta:       meta || {},
        hit_count:  0,
        created_at: now,
        updated_at: now
      }
    });
    return _ok({ action: 'created', id: res._id });
  }
}

// ─── 批量写入 ─────────────────────────────────────────────────
async function batchSetContent(event) {
  const { items } = event;
  if (!Array.isArray(items) || items.length === 0) return _err('items 不能为空');

  const results = [];
  for (const item of items) {
    try {
      const r = await setContent(item);
      results.push({ key: item.key, success: true, action: r.result?.action });
    } catch (e) {
      results.push({ key: item.key, success: false, error: e.message });
    }
  }
  return _ok({ results, total: items.length, success: results.filter(r => r.success).length });
}

// ─── 列出某类型内容 ───────────────────────────────────────────
async function listContent(event) {
  const { contentType, limit = 20, skip = 0 } = event;
  if (!contentType) return _err('缺少 contentType');

  const res = await db.collection(COLLECTION)
    .where({ type: contentType })
    .orderBy('hit_count', 'desc')
    .orderBy('updated_at', 'desc')
    .skip(skip)
    .limit(Math.min(limit, 50))
    .get();

  return _ok({ list: res.data || [], total: res.data?.length || 0 });
}

// ─── 全文搜索（按 title / key 模糊匹配） ─────────────────────
async function searchContent(event) {
  const { keyword, contentType, limit = 10 } = event;
  if (!keyword) return _err('缺少 keyword');

  const db_reg = db.RegExp({ regexp: keyword, options: 'i' });
  let query = { $or: [{ title: db_reg }, { key: db_reg }] };
  if (contentType) query.type = contentType;

  const res = await db.collection(COLLECTION)
    .where(query)
    .limit(Math.min(limit, 20))
    .get();

  return _ok({ list: res.data || [], total: res.data?.length || 0 });
}

// ─── 删除（管理用） ───────────────────────────────────────────
async function deleteContent(event) {
  const { contentType, key } = event;
  if (!contentType || !key) return _err('缺少参数');

  const cacheKey = `${contentType}_${key}`;
  const existing = await db.collection(COLLECTION)
    .where({ type: contentType, key: cacheKey })
    .limit(1)
    .get();

  if (existing.data && existing.data.length > 0) {
    await db.collection(COLLECTION).doc(existing.data[0]._id).remove();
    return _ok({ deleted: true });
  }
  return _ok({ deleted: false, msg: '记录不存在' });
}

// ─── 预加载：批量检查哪些 key 还没缓存 ───────────────────────
async function preloadContent(event) {
  const { contentType, keys } = event;
  if (!contentType || !Array.isArray(keys)) return _err('缺少参数');

  const cacheKeys = keys.map(k => `${contentType}_${k}`);
  const res = await db.collection(COLLECTION)
    .where({ type: contentType, key: _.in(cacheKeys) })
    .field({ key: true })
    .get();

  const cachedKeys = new Set((res.data || []).map(d => d.key));
  const missing = keys.filter(k => !cachedKeys.has(`${contentType}_${k}`));

  return _ok({ missing, cached: keys.filter(k => cachedKeys.has(`${contentType}_${k}`)) });
}

// ─── 工具 ────────────────────────────────────────────────────
function _ok(data)    { return { success: true,  ...data }; }
function _err(msg)    { return { success: false, error: msg }; }
