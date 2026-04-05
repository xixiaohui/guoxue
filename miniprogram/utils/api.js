/**
 * utils/api.js - 业务 API 层 v8.0（云数据库缓存版）
 *
 * 审核要求：不能实时使用 AI 生成答案
 * 方案：所有 AI 答案先查云数据库（guoxue 集合）缓存
 *       命中 → 直接返回（无 AI 调用）
 *       未命中 → AI 生成 → 写入云数据库 → 返回
 *
 * 职责分工：
 *   - AI 调用    → utils/ai.js
 *   - 配额管理   → 云函数 guoxueAI
 *   - 内容缓存   → utils/db.js（本地+云数据库 guoxue 集合）
 *
 * 内容类型（guoxue 集合 type 字段）：
 *   poem        诗词赏析
 *   idiom       成语解释
 *   history     历史知识
 *   philosopher 诸子百家
 *   classic     典籍内容
 */

const ai = require('./ai');
const db = require('./db');

const QUOTA_FUNC  = 'guoxueAI';
const CACHE_TTL   = 60 * 1000;

// ─── 配额检查 ─────────────────────────────────────────────────
async function consumeQuota() {
  try {
    const res = await wx.cloud.callFunction({
      name: QUOTA_FUNC,
      data: { type: 'checkAndConsume' }
    });
    const d = res.result;
    try { wx.removeStorageSync('_quota_cache'); } catch (_) {}
    if (!d || !d.success) {
      console.warn('[api] consumeQuota cloud error, fallback allow:', d);
      return { allowed: true, reason: 'fallback', remaining: 1 };
    }
    if (d.quota_exceeded) {
      return { allowed: false, reason: 'quota_exceeded', remaining: 0 };
    }
    return {
      allowed:   true,
      reason:    d.isUnlimited ? (d.isVip ? 'vip' : 'ad_bonus') : 'free',
      remaining: d.remaining || 0,
    };
  } catch (e) {
    console.warn('[api] consumeQuota failed, fallback allow:', e.message);
    return { allowed: true, reason: 'fallback', remaining: 1 };
  }
}

async function getQuotaStatus(forceRefresh = false) {
  const CACHE_KEY = '_quota_cache';
  if (!forceRefresh) {
    try {
      const c = wx.getStorageSync(CACHE_KEY);
      if (c && c.ts && Date.now() - c.ts < CACHE_TTL) return c.data;
    } catch (_) {}
  }
  try {
    const res = await wx.cloud.callFunction({
      name: QUOTA_FUNC,
      data: { type: 'getStatus' }
    });
    const d = res.result;
    if (d && d.success) {
      try { wx.setStorageSync(CACHE_KEY, { ts: Date.now(), data: d }); } catch (_) {}
      return d;
    }
  } catch (e) {
    console.warn('[api] getQuotaStatus failed:', e.message);
  }
  return { canUse: true, remaining: 10, isVip: false, hasAdBonus: false, freeLimit: 10 };
}

// ─── 内部：配额检查 + AI 调用（无缓存版，用于翻译等实时场景）─────
async function _invoke(type, messages, needQuota, opts = {}) {
  if (needQuota) {
    const quota = await consumeQuota();
    if (!quota.allowed) {
      const e = new Error('今日免费次数已用完，请观看广告或升级会员');
      e.code = 'QUOTA_EXCEEDED';
      e.remaining = 0;
      throw e;
    }
  }
  return ai.callAI(type, messages, opts);
}

// ─── 内部：云数据库缓存版调用 ─────────────────────────────────
/**
 * 先查云数据库缓存，未命中才调 AI 生成
 * @param {string}   contentType  类型
 * @param {string}   cacheKey     唯一键（不含 type 前缀）
 * @param {Function} buildPrompt  () => string  构建 AI prompt
 * @param {Object}   aiOpts       AI 调用参数
 * @param {string}   aiType       AI 限流 key
 * @param {Object}   meta         { title, ...其他 meta }
 * @param {boolean}  needQuota    是否需要配额（云端无缓存时才需要）
 */
async function _invokeWithCache(contentType, cacheKey, buildPrompt, aiOpts, aiType, meta, needQuota = true) {
  // 1. 查缓存（本地 + 云端）
  const cached = await db.getContent(contentType, cacheKey);
  if (cached.found) {
    console.log(`[api] cache hit: ${contentType}/${cacheKey} from ${cached.source}`);
    return cached.data;
  }

  // 2. 未命中：需要 AI 生成，先检查配额
  if (needQuota) {
    const quota = await consumeQuota();
    if (!quota.allowed) {
      const e = new Error('今日免费次数已用完，请观看广告或升级会员');
      e.code = 'QUOTA_EXCEEDED';
      e.remaining = 0;
      throw e;
    }
  }

  // 3. AI 生成
  const prompt = buildPrompt();
  const msgs = [{ role: 'system', content: ai.SYSTEM_PROMPT }, { role: 'user', content: prompt }];
  const rawText = await ai.callAI(aiType, msgs, aiOpts);

  // 4. 解析段落
  const sections = _parseSections(rawText);
  const data = {
    title:    meta.title || cacheKey,
    content:  rawText,
    sections,
    meta:     { ...meta, generatedAt: Date.now() }
  };

  // 5. 写云数据库（异步，不阻塞返回）
  db.saveContent(contentType, cacheKey, data).catch(e =>
    console.warn('[api] saveContent failed:', e.message)
  );

  return data;
}

// ─── 业务 API ─────────────────────────────────────────────────

/**
 * 多轮对话（流式）—— 翻译页专用，仍走实时 AI
 */
async function chatStream(messages, onChunk, onDone, onError) {
  if (!Array.isArray(messages) || messages.length === 0) {
    onError && onError(new Error('消息列表不能为空'));
    return;
  }
  const quota = await consumeQuota();
  if (!quota.allowed) {
    const e = new Error('今日免费次数已用完，请观看广告或升级会员');
    e.code = 'QUOTA_EXCEEDED';
    onError && onError(e);
    return;
  }
  const valid   = messages.filter(m => m && typeof m.role === 'string' && typeof m.content === 'string');
  const trimmed = valid.slice(-12);
  const msgs    = [{ role: 'system', content: ai.SYSTEM_PROMPT }, ...trimmed];
  await ai.callAIStream('chat', msgs, onChunk, onDone, onError, { temperature: 0.75, maxTokens: 1500 });
}

async function chat(messages) {
  if (!Array.isArray(messages) || messages.length === 0) throw new Error('消息列表不能为空');
  const valid   = messages.filter(m => m && typeof m.role === 'string' && typeof m.content === 'string');
  const trimmed = valid.slice(-12);
  const msgs    = [{ role: 'system', content: ai.SYSTEM_PROMPT }, ...trimmed];
  const reply   = await _invoke('chat', msgs, true, { temperature: 0.75, maxTokens: 1500 });
  return { success: true, reply };
}

/**
 * 古文翻译（实时，每次不同，不缓存）
 */
async function translate(text, mode) {
  if (!text?.trim()) throw new Error('请输入需要翻译的文本');
  if (text.length > ai.CFG.MAX_INPUT_LEN) throw new Error(`内容过长，请控制在${ai.CFG.MAX_INPUT_LEN}字以内`);

  const isAncient = mode !== 'modern_to_ancient';
  const prompt = isAncient
    ? `请将下列文言文翻译成现代白话文，并进行注释。\n\n【原文】\n${text}\n\n请严格按以下结构输出：\n【译文】\n（现代白话文翻译）\n\n【注释】\n（逐一解释关键字词或典故）\n\n【背景】\n（简述作品或句子的历史文化背景，2-3句）`
    : `请将下列现代白话文改写成古雅的文言文风格。\n\n【原文】\n${text}\n\n请严格按以下结构输出：\n【文言文】\n（文言文改写版本）\n\n【用词说明】\n（解释所用的关键文言词汇及语法）`;

  const msgs   = [{ role: 'system', content: ai.SYSTEM_PROMPT }, { role: 'user', content: prompt }];
  const result = await _invoke('translate', msgs, true, { temperature: 0.4, maxTokens: 1500 });
  return { success: true, result };
}

/**
 * 每日经典（本地缓存）
 */
async function getDailyClassic(forceRefresh = false, seed) {
  const today = _todayKey();
  const cacheKey = 'daily_' + today;

  if (!forceRefresh && !seed) {
    try {
      const cached = wx.getStorageSync(cacheKey);
      if (cached) return { success: true, daily: cached, fromCache: true };
    } catch (_) {}
  }

  const seedHint = seed ? `（请推荐与上次不同的，随机种子：${seed % 1000}）` : '';
  const prompt = `今天是${_todayCN()}，请推荐一条适合今天的经典名句${seedHint}（诗词、典籍、名言皆可，尽量多样化）。
请严格按以下JSON格式返回（不要有多余文字）：
{"quote":"经典原文","author":"作者·朝代·出处","translation":"白话文解释（30字内）","analysis":"意境赏析（60字内）","insight":"今日启示（30字内）"}`;

  const msgs = [{ role: 'system', content: ai.SYSTEM_PROMPT }, { role: 'user', content: prompt }];
  const temperature = seed ? 0.95 : 0.85;
  const raw  = await ai.callAI('daily', msgs, { temperature, maxTokens: 500 });
  let daily;
  try {
    const jsonStr = raw.match(/\{[\s\S]*?\}/)?.[0] || raw;
    daily = JSON.parse(jsonStr);
  } catch (_) {
    daily = { quote: raw.slice(0, 200), author: '', translation: '', analysis: '', insight: '' };
  }
  if (!seed) {
    try { wx.setStorageSync(cacheKey, daily); } catch (_) {}
  }
  return { success: true, daily };
}

/**
 * 每日成语（本地缓存）
 */
async function getDailyIdiom(forceRefresh = false) {
  const today = _todayKey();
  const cacheKey = 'daily_idiom_' + today;
  if (!forceRefresh) {
    try {
      const cached = wx.getStorageSync(cacheKey);
      if (cached) return { success: true, idiom: cached, fromCache: true };
    } catch (_) {}
  }

  const prompt = `今天是${_todayCN()}，请随机推荐一个有趣的四字成语。
请严格按以下JSON格式返回（不要有多余文字）：
{"word":"成语","pinyin":"pīn yīn","brief":"一句话释义（20字内）","origin":"出处典籍","story":"典故故事（80字内）","example":"现代用法例句","antonym":"反义词","synonym":"近义词"}`;

  const msgs = [{ role: 'system', content: ai.SYSTEM_PROMPT }, { role: 'user', content: prompt }];
  const raw  = await ai.callAI('daily_idiom', msgs, { temperature: 0.9, maxTokens: 600 });
  let idiom;
  try {
    const jsonStr = raw.match(/\{[\s\S]*?\}/)?.[0] || raw;
    idiom = JSON.parse(jsonStr);
  } catch (_) {
    idiom = { word: '一鸣惊人', pinyin: 'yī míng jīng rén', brief: '突然做出惊人成绩', origin: '《史记》', story: '', example: '', antonym: '', synonym: '' };
  }
  try { wx.setStorageSync(cacheKey, idiom); } catch (_) {}
  return { success: true, idiom };
}

/**
 * 诗词赏析 ✅ 走云数据库缓存
 * @param {string} text   诗词文本或"标题-作者"
 * @param {Object} [opts] { title, author, dynasty } 附加信息
 */
async function analyzePoem(text, opts = {}) {
  if (!text?.trim()) throw new Error('请输入诗词内容');
  if (text.length > ai.CFG.MAX_INPUT_LEN) throw new Error('诗词内容过长');

  // 生成稳定 key（去除空白/换行，取前60字）
  const cacheKey = _normalizeKey(text, 60);
  const meta = { title: opts.title || cacheKey, author: opts.author || '', dynasty: opts.dynasty || '' };

  const data = await _invokeWithCache(
    'poem',
    cacheKey,
    () => `请对以下诗词进行专业赏析：\n\n${text}\n\n请按以下结构输出（每部分100字内）：\n【作品信息】\n（朝代、作者、创作背景）\n\n【逐句注释】\n（关键字词及语法）\n\n【意境赏析】\n（意象、情感、艺术手法）\n\n【文学地位】\n（在文学史上的价值）`,
    { temperature: 0.6, maxTokens: 1800 },
    'poem',
    meta,
    true
  );
  return { success: true, analysis: data.content, sections: data.sections };
}

/**
 * 成语解释 ✅ 走云数据库缓存
 */
async function explainIdiom(word) {
  const w = (word || '').trim();
  if (!w) throw new Error('请输入成语');
  if (w.length > 20) throw new Error('成语过长，请检查输入');

  const data = await _invokeWithCache(
    'idiom',
    w,
    () => `请详细解释成语「${w}」。\n\n请按以下结构输出：\n【成语释义】（20字内）\n\n【出处典故】\n\n【原文引用】\n\n【用法示例】\n例句1：\n例句2：\n\n【近义词】\n【反义词】`,
    { temperature: 0.4, maxTokens: 1200 },
    'idiom',
    { title: w },
    true
  );
  return { success: true, explanation: data.content, sections: data.sections };
}

/**
 * 历史知识 ✅ 走云数据库缓存
 */
async function queryHistory(query) {
  if (!query?.trim()) throw new Error('请输入查询内容');
  if (query.length > 200) throw new Error('查询内容过长，请精简后重试');

  const cacheKey = _normalizeKey(query, 80);
  const data = await _invokeWithCache(
    'history',
    cacheKey,
    () => `请介绍关于「${query}」的历史知识。\n\n请按以下结构输出（每部分120字内）：\n【历史概述】\n【重要内容】\n【深远影响】\n【文化印记】`,
    { temperature: 0.5, maxTokens: 1800 },
    'history',
    { title: query },
    true
  );
  return { success: true, content: data.content, sections: data.sections };
}

/**
 * 诸子百家学派解析 ✅ 走云数据库缓存
 */
async function analyzePhilosopher(school, query) {
  const q = query || `${school}的核心思想、代表人物、著作和历史影响`;
  const cacheKey = _normalizeKey(q, 80);

  const data = await _invokeWithCache(
    'philosopher',
    cacheKey,
    () => `请详细介绍${q}。\n\n请按以下结构输出（每部分120字内）：\n【核心思想】\n【代表人物】\n【主要著作】\n【历史影响】\n【现代价值】`,
    { temperature: 0.5, maxTokens: 1800 },
    'philosopher',
    { title: school || q, school },
    true
  );
  return { success: true, content: data.content, sections: data.sections };
}

/**
 * 智能搜索 ✅ 走云数据库缓存
 */
async function searchClassics(text) {
  if (!text?.trim()) throw new Error('请输入搜索内容');
  if (text.length > 200) throw new Error('搜索内容过长');

  const cacheKey = _normalizeKey(text, 80);
  const data = await _invokeWithCache(
    'classic',
    cacheKey,
    () => `请从国学角度介绍：${text}`,
    { temperature: 0.65, maxTokens: 1500 },
    'search',
    { title: text },
    true
  );
  return { success: true, reply: data.content, sections: data.sections };
}

/**
 * 搜索云数据库中已有的内容（不触发 AI）
 */
async function searchCached(keyword, contentType) {
  return db.searchContent(keyword, contentType, 10);
}

// ─── Toast 错误提示 ───────────────────────────────────────────
function showError(msg) {
  wx.showToast({ title: msg || '操作失败', icon: 'none', duration: 2500 });
}

// ─── 内部工具 ─────────────────────────────────────────────────
function _parseSections(text) {
  if (!text) return [];
  const sections = [];
  const re = /【([^】]+)】\s*([\s\S]*?)(?=【|$)/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const content = m[2].trim();
    if (content) sections.push({ label: m[1], content });
  }
  if (sections.length === 0 && text.trim()) {
    sections.push({ label: '详细解析', content: text.trim() });
  }
  return sections;
}

function _normalizeKey(text, maxLen) {
  return (text || '').replace(/[\s\n\r]/g, '').slice(0, maxLen);
}

function _todayKey() {
  const d = new Date();
  return `${d.getFullYear()}${d.getMonth()+1}${d.getDate()}`;
}
function _todayCN() {
  const d = new Date();
  return `${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日`;
}

// ─── 导出 ─────────────────────────────────────────────────────
module.exports = {
  // 配额
  consumeQuota,
  getQuotaStatus,
  // 业务
  chat,
  chatStream,
  translate,
  getDailyClassic,
  getDailyIdiom,
  analyzePoem,
  explainIdiom,
  queryHistory,
  analyzePhilosopher,
  searchClassics,
  searchCached,
  // 兼容旧名称
  callAI: (type, data) => {
    const map = {
      chat:        () => chat(data.messages),
      translate:   () => translate(data.text, data.mode),
      daily:       () => getDailyClassic(),
      daily_idiom: () => getDailyIdiom(),
      poem:        () => analyzePoem(data.text),
      idiom:       () => explainIdiom(data.text),
      history:     () => queryHistory(data.text),
      search:      () => searchClassics(data.text),
    };
    return (map[type] || (() => Promise.reject(new Error('未知类型: ' + type))))();
  },
  showError,
};
