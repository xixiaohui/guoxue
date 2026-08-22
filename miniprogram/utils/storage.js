// utils/storage.js - 本地数据持久化管理（收藏夹、历史记录、用户偏好）

const KEYS = {
  FAVORITES_POEM: 'fav_poems',
  FAVORITES_IDIOM: 'fav_idioms',
  TRANSLATE_HISTORY: 'trans_history',
  CHAT_HISTORY: 'chat_history',
  USER_PREFS: 'user_prefs',
  VIEWED_POEMS: 'viewed_poems'
};

const MAX_HISTORY = 20;
const MAX_FAVORITES = 100;

// ─── 收藏夹 ────────────────────────────────────────

/**
 * 生成诗词的稳定标识：
 * 优先真实 id；其次 title|author；title 为空时退化为正文前 20 字|author。
 * （诗词 API 存在大量 title 为空的记录，必须兜底，否则收藏/点赞无法去重）
 * ⚠️ 忽略 normalizePoem 生成的 "title|author" 兜底 id：
 *    title 为空时它会退化成 "|作者"，不同诗词会撞 key，必须回退到正文前缀匹配。
 */
function getPoemKey(poem) {
  const p = poem || {};
  const title = (p.title || '').trim();
  const author = (p.author || '').trim();
  const fakeId = title + '|' + author;
  const hasRealId = p.id != null && p.id !== '' && String(p.id) !== fakeId;
  if (hasRealId) return 'id:' + p.id;
  if (title) return 't:' + title + '|a:' + author;
  const content = (p.content || p.preview || '').replace(/\s+/g, '').slice(0, 20);
  if (content) return 'c:' + content + '|a:' + author;
  return 'x:' + title + '|a:' + author;
}

function getFavoritePoems() {
  return _get(KEYS.FAVORITES_POEM, []);
}

function toggleFavoritePoem(poem) {
  const list = getFavoritePoems();
  const key = getPoemKey(poem);
  const idx = list.findIndex(p => getPoemKey(p) === key);
  if (idx >= 0) {
    list.splice(idx, 1);
    _set(KEYS.FAVORITES_POEM, list);
    return false; // 已取消收藏
  } else {
    list.unshift({ ...poem, savedAt: Date.now() });
    _set(KEYS.FAVORITES_POEM, list.slice(0, MAX_FAVORITES));
    return true; // 已收藏
  }
}

/** 兼容两种调用：isPoemFavorited(poem) 或 isPoemFavorited(title, author) */
function isPoemFavorited(poem, author) {
  const p = typeof poem === 'object' ? poem : { title: poem, author };
  const key = getPoemKey(p);
  return getFavoritePoems().some(f => getPoemKey(f) === key);
}

function getFavoriteIdioms() {
  return _get(KEYS.FAVORITES_IDIOM, []);
}

function toggleFavoriteIdiom(idiom) {
  const list = getFavoriteIdioms();
  const idx = list.findIndex(i => i.word === idiom.word);
  if (idx >= 0) {
    list.splice(idx, 1);
    _set(KEYS.FAVORITES_IDIOM, list);
    return false;
  } else {
    list.unshift({ ...idiom, savedAt: Date.now() });
    _set(KEYS.FAVORITES_IDIOM, list.slice(0, MAX_FAVORITES));
    return true;
  }
}

function isIdiomFavorited(word) {
  return getFavoriteIdioms().some(i => i.word === word);
}

// ─── 翻译历史 ────────────────────────────────────────

function addTranslateHistory(item) {
  const list = getTranslateHistory();
  // 去重（相同原文的最近一条）
  const filtered = list.filter(h => h.input !== item.input || h.mode !== item.mode);
  filtered.unshift({ ...item, id: Date.now(), time: _formatTime() });
  _set(KEYS.TRANSLATE_HISTORY, filtered.slice(0, MAX_HISTORY));
}

function getTranslateHistory() {
  return _get(KEYS.TRANSLATE_HISTORY, []);
}

function clearTranslateHistory() {
  _set(KEYS.TRANSLATE_HISTORY, []);
}

// ─── 聊天历史（保留最近N条会话摘要） ────────────────────────────────────────

function saveChatSession(messages) {
  if (!messages || messages.length < 2) return;
  const history = getChatHistory();
  const session = {
    id: Date.now(),
    time: _formatTime(),
    preview: messages[0]?.content?.substring(0, 40) || '',
    count: messages.length,
    messages: messages.slice(-20) // 只保留最近20条
  };
  history.unshift(session);
  _set(KEYS.CHAT_HISTORY, history.slice(0, 10)); // 最多10个会话
}

function getChatHistory() {
  return _get(KEYS.CHAT_HISTORY, []);
}

function clearChatHistory() {
  _set(KEYS.CHAT_HISTORY, []);
}

// ─── 用户偏好 ────────────────────────────────────────

function getUserPrefs() {
  return _get(KEYS.USER_PREFS, {
    favoriteTopics: [],
    fontSize: 'normal', // 'small' | 'normal' | 'large'
    darkMode: false
  });
}

function setUserPref(key, value) {
  const prefs = getUserPrefs();
  prefs[key] = value;
  _set(KEYS.USER_PREFS, prefs);
}

// ─── 内部工具 ────────────────────────────────────────

function _get(key, defaultValue) {
  try {
    const val = wx.getStorageSync(key);
    return val !== '' && val !== null && val !== undefined ? val : defaultValue;
  } catch (e) {
    return defaultValue;
  }
}

function _set(key, value) {
  try {
    wx.setStorageSync(key, value);
  } catch (e) {
    console.warn('[Storage] write failed:', key, e);
  }
}

function _formatTime() {
  const d = new Date();
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

module.exports = {
  getPoemKey,
  getFavoritePoems,
  toggleFavoritePoem,
  isPoemFavorited,
  getFavoriteIdioms,
  toggleFavoriteIdiom,
  isIdiomFavorited,
  addTranslateHistory,
  getTranslateHistory,
  clearTranslateHistory,
  saveChatSession,
  getChatHistory,
  clearChatHistory,
  getUserPrefs,
  setUserPref
};
