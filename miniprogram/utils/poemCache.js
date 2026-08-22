// utils/poemCache.js - 诗词详情数据缓存
// 列表页/搜索页/收藏页跳转详情前，将完整诗词数据存入缓存；
// 详情页优先从缓存读取，规避小程序页面 URL 长度限制导致的正文截断。
// 缓存仅驻留内存（进程内），体积小，无需持久化。
const storage = require('./storage');

let _memory = {};

/** 跳转详情前调用：缓存完整诗词数据 */
function cachePoem(poem) {
  const p = poem || {};
  if (!p.title && !p.content && !p.preview) return null;
  const key = storage.getPoemKey(p);
  if (!key) return null;
  _memory[key] = Object.assign({}, p);
  return p;
}

/** 详情页调用：按引用信息读取缓存的完整诗词（未命中返回 null） */
function getCachedPoem(ref) {
  const key = storage.getPoemKey(ref);
  if (!key) return null;
  return _memory[key] || null;
}

function clearCache() {
  _memory = {};
}

module.exports = {
  cachePoem,
  getCachedPoem,
  clearCache,
};
