/**
 * utils/db.js - 云数据库访问层 v2.0
 *
 * 架构：
 *   1. 先查本地缓存（wx.getStorageSync）
 *   2. 命中 → 直接返回，用户无感知
 *   3. 未命中 → 调用云函数 guoxueDB 查云端数据库（集合 guoxue）
 *   4. 云端有数据 → 写本地缓存后返回
 *   5. 云端无数据 → 触发 AI 生成 → 写云端 + 本地缓存 → 返回
 *
 * 本地缓存 TTL：
 *   - 诗词赏析/成语/历史/诸子：7天（内容稳定）
 *   - 每日经典：当天（日期变化时自动失效）
 *
 * 集合字段规范（guoxue）：
 *   type     : 'poem'|'idiom'|'history'|'philosopher'|'classic'
 *   key      : `${type}_${uniqueKey}`  (e.g. "poem_静夜思_李白")
 *   title    : 标题
 *   content  : AI 生成的完整文本
 *   sections : [{label, content}] 解析后的段落
 *   meta     : { author, dynasty, ... }
 */

const DB_FUNC  = 'guoxueDB';          // 云函数名
const LOCAL_TTL = 7 * 24 * 3600 * 1000; // 7天

// ─── 主查询入口 ───────────────────────────────────────────────
/**
 * 从缓存（本地→云端）读取内容，未命中则由调用方提供生成函数
 * @param {string}   contentType  类型: poem|idiom|history|philosopher
 * @param {string}   key          业务唯一键（不含 type 前缀）
 * @param {Function} [generator]  () => Promise<{content, sections, meta}> 生成函数
 * @returns {Promise<{found:boolean, data:object, fromCache:boolean}>}
 */
async function getContent(contentType, key, generator) {
  const localKey = `db_${contentType}_${key}`;

  // 1. 本地缓存
  try {
    const cached = wx.getStorageSync(localKey);
    if (cached && cached.data && (Date.now() - cached.ts < LOCAL_TTL)) {
      return { found: true, data: cached.data, fromCache: true, source: 'local' };
    }
  } catch (_) {}

  // 2. 云端数据库
  try {
    const res = await wx.cloud.callFunction({
      name: DB_FUNC,
      data: { type: 'get', contentType, key }
    });
    if (res.result && res.result.found) {
      const data = res.result.data;
      // 写本地缓存
      _saveLocal(localKey, data);
      return { found: true, data, fromCache: false, source: 'cloud' };
    }
  } catch (e) {
    console.warn('[db] cloud get failed:', e.message);
  }

  // 3. 未命中 → 调用生成函数
  if (typeof generator === 'function') {
    try {
      const generated = await generator();
      if (generated && generated.content) {
        // 异步写云端（不阻塞返回）
        _saveCloud(contentType, key, generated).catch(e =>
          console.warn('[db] saveCloud failed:', e.message)
        );
        // 写本地缓存
        _saveLocal(localKey, generated);
        return { found: true, data: generated, fromCache: false, source: 'generated' };
      }
    } catch (e) {
      console.warn('[db] generator failed:', e.message);
      throw e;
    }
  }

  return { found: false };
}

// ─── 批量查询（用于预加载） ───────────────────────────────────
/**
 * @param {string}   contentType
 * @param {string[]} keys
 * @returns {Promise<Object>}  { [key]: data }
 */
async function batchGet(contentType, keys) {
  const result = {};

  // 先查本地缓存
  const missing = [];
  for (const key of keys) {
    const localKey = `db_${contentType}_${key}`;
    try {
      const cached = wx.getStorageSync(localKey);
      if (cached && cached.data && (Date.now() - cached.ts < LOCAL_TTL)) {
        result[key] = cached.data;
        continue;
      }
    } catch (_) {}
    missing.push(key);
  }

  if (missing.length === 0) return result;

  // 批量查云端
  try {
    const checks = missing.map(key => ({
      type: 'get', contentType, key
    }));
    // 并发查询（限 5 个同时）
    const batches = _chunk(checks, 5);
    for (const batch of batches) {
      const promises = batch.map(q =>
        wx.cloud.callFunction({ name: DB_FUNC, data: q })
          .then(r => ({ key: q.key, result: r.result }))
          .catch(() => ({ key: q.key, result: null }))
      );
      const batchResults = await Promise.all(promises);
      for (const { key, result: r } of batchResults) {
        if (r && r.found) {
          result[key] = r.data;
          _saveLocal(`db_${contentType}_${key}`, r.data);
        }
      }
    }
  } catch (e) {
    console.warn('[db] batchGet cloud failed:', e.message);
  }

  return result;
}

// ─── 主动写入（AI生成后保存） ──────────────────────────────────
/**
 * @param {string} contentType
 * @param {string} key
 * @param {Object} data  { title, content, sections, meta }
 */
async function saveContent(contentType, key, data) {
  const localKey = `db_${contentType}_${key}`;
  _saveLocal(localKey, data);
  return _saveCloud(contentType, key, data);
}

// ─── 搜索 ────────────────────────────────────────────────────
async function searchContent(keyword, contentType, limit = 10) {
  try {
    const res = await wx.cloud.callFunction({
      name: DB_FUNC,
      data: { type: 'search', keyword, contentType, limit }
    });
    if (res.result && res.result.success) {
      return res.result.list || [];
    }
  } catch (e) {
    console.warn('[db] search failed:', e.message);
  }
  return [];
}

// ─── 列出某类型 ──────────────────────────────────────────────
async function listContent(contentType, limit = 20) {
  try {
    const res = await wx.cloud.callFunction({
      name: DB_FUNC,
      data: { type: 'list', contentType, limit }
    });
    if (res.result && res.result.success) {
      return res.result.list || [];
    }
  } catch (e) {
    console.warn('[db] list failed:', e.message);
  }
  return [];
}

// ─── 清除本地缓存（某类型） ────────────────────────────────────
function clearLocalCache(contentType) {
  try {
    const keys = wx.getStorageInfoSync().keys || [];
    const prefix = `db_${contentType}_`;
    keys.filter(k => k.startsWith(prefix)).forEach(k => {
      try { wx.removeStorageSync(k); } catch (_) {}
    });
  } catch (_) {}
}

// ─── 内部工具 ─────────────────────────────────────────────────
function _saveLocal(localKey, data) {
  try {
    wx.setStorageSync(localKey, { ts: Date.now(), data });
  } catch (_) {}
}

async function _saveCloud(contentType, key, data) {
  return wx.cloud.callFunction({
    name: DB_FUNC,
    data: {
      type:        'set',
      contentType,
      key,
      title:       data.title   || key,
      content:     data.content || '',
      sections:    data.sections || [],
      meta:        data.meta    || {}
    }
  });
}

function _chunk(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

// ─── 导出 ────────────────────────────────────────────────────
module.exports = {
  getContent,
  batchGet,
  saveContent,
  searchContent,
  listContent,
  clearLocalCache,
};
