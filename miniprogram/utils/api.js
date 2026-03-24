/**
 * utils/api.js - 业务 API 层（生产级）
 *
 * 职责分工：
 *   - AI 调用  → utils/ai.js（wx.cloud.extend.AI，小程序端直调）
 *   - 配额管理 → 云函数 guoxueAI（checkAndConsume / getStatus / adBonus）
 *   - 缓存     → 每日内容本地缓存，同日不重复请求
 *
 * 每个业务函数流程：
 *   1. 输入校验
 *   2. 配额检查（非每日缓存类型）
 *   3. 构建 prompt → 调用 ai.callAI
 *   4. 解析结果 → 返回结构化数据
 */

const ai = require('./ai');

const QUOTA_FUNC  = 'guoxueAI';    // 云函数名（仅管配额）
const CACHE_TTL   = 60 * 1000;    // 配额本地缓存 1 分钟

// ─── 配额检查（带本地缓存） ───────────────────────────────────
/**
 * 消费一次配额
 * @returns {{ allowed:boolean, reason:string, remaining:number }}
 */
async function consumeQuota() {
  try {
    const res = await wx.cloud.callFunction({
      name: QUOTA_FUNC,
      data: { type: 'checkAndConsume' }
    });
    const d = res.result;
    // 使本地状态缓存失效
    try { wx.removeStorageSync('_quota_cache'); } catch (_) {}

    if (!d || !d.success) {
      // 云函数异常 → 降级放行（不影响用户体验）
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

/**
 * 查询配额状态（带本地缓存，仅用于展示，不消费）
 */
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
  // 降级返回：假装有足够配额
  return { canUse: true, remaining: 10, isVip: false, hasAdBonus: false, freeLimit: 10 };
}

// ─── 公共调用包装（配额 + AI + 错误统一处理） ─────────────────
/**
 * @param {string}   type       业务类型（用于限流 key）
 * @param {Array}    messages   AI 消息数组
 * @param {boolean}  needQuota  是否需要消耗配额（每日内容不需要）
 * @param {Object}   opts       { temperature, maxTokens }
 * @returns {Promise<string>}   AI 回复文本
 */
async function _invoke(type, messages, needQuota, opts = {}) {
  // 配额检查
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

// ─── 业务 API ─────────────────────────────────────────────────

/**
 * 多轮对话（流式）
 * @param {Array}    messages  [{role, content}]
 * @param {Function} onChunk   (text) => void
 * @param {Function} onDone    (fullText) => void
 * @param {Function} onError   (err) => void
 */
async function chatStream(messages, onChunk, onDone, onError) {
  if (!Array.isArray(messages) || messages.length === 0) {
    onError && onError(new Error('消息列表不能为空'));
    return;
  }
  // 配额检查（非流式方式：先检查再流式，避免流了一半发现超额）
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

/**
 * 多轮对话（非流式，兼容旧代码）
 */
async function chat(messages) {
  if (!Array.isArray(messages) || messages.length === 0) throw new Error('消息列表不能为空');
  const valid   = messages.filter(m => m && typeof m.role === 'string' && typeof m.content === 'string');
  const trimmed = valid.slice(-12);
  const msgs    = [{ role: 'system', content: ai.SYSTEM_PROMPT }, ...trimmed];
  const reply   = await _invoke('chat', msgs, true, { temperature: 0.75, maxTokens: 1500 });
  return { success: true, reply };
}

/**
 * 古文翻译
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
 * 每日经典（同日缓存，不消耗配额）
 * @param {boolean} forceRefresh  是否强制刷新（忽略缓存）
 * @param {number}  [seed]        换一条时传入随机种子，使 AI 返回不同内容
 */
async function getDailyClassic(forceRefresh = false, seed) {
  const today = _todayKey();
  const cacheKey = 'daily_' + today;

  // 仅在非强制刷新、且无 seed（即首次加载）时读缓存
  if (!forceRefresh && !seed) {
    try {
      const cached = wx.getStorageSync(cacheKey);
      if (cached) return { success: true, daily: cached, fromCache: true };
    } catch (_) {}
  }

  // 换一条时，通过随机 seed 让 AI 推荐不同名句，避免每次返回相同内容
  const seedHint = seed
    ? `（请推荐与上次不同的，随机种子：${seed % 1000}）`
    : '';
  const prompt = `今天是${_todayCN()}，请推荐一条适合今天的经典名句${seedHint}（诗词、典籍、名言皆可，尽量多样化）。
请严格按以下JSON格式返回（不要有多余文字）：
{"quote":"经典原文","author":"作者·朝代·出处","translation":"白话文解释（30字内）","analysis":"意境赏析（60字内）","insight":"今日启示（30字内）"}`;

  const msgs = [{ role: 'system', content: ai.SYSTEM_PROMPT }, { role: 'user', content: prompt }];
  // 每日内容不消耗配额；换一条时提高 temperature 增加多样性
  const temperature = seed ? 0.95 : 0.85;
  const raw  = await ai.callAI('daily', msgs, { temperature, maxTokens: 500 });
  let daily;
  try {
    const jsonStr = raw.match(/\{[\s\S]*?\}/)?.[0] || raw;
    daily = JSON.parse(jsonStr);
  } catch (_) {
    daily = { quote: raw.slice(0, 200), author: '', translation: '', analysis: '', insight: '' };
  }
  // 首次加载时写缓存；换一条时不覆盖当日缓存（保留今日内容）
  if (!seed) {
    try { wx.setStorageSync(cacheKey, daily); } catch (_) {}
  }
  return { success: true, daily };
}

/**
 * 每日成语（同日缓存，不消耗配额）
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
 * 诗词赏析
 */
async function analyzePoem(text) {
  if (!text?.trim()) throw new Error('请输入诗词内容');
  if (text.length > ai.CFG.MAX_INPUT_LEN) throw new Error('诗词内容过长');

  const prompt = `请对以下诗词进行专业赏析：\n\n${text}\n\n请按以下结构输出（每部分100字内）：\n【作品信息】\n（朝代、作者、创作背景）\n\n【逐句注释】\n（关键字词及语法）\n\n【意境赏析】\n（意象、情感、艺术手法）\n\n【文学地位】\n（在文学史上的价值）`;
  const msgs     = [{ role: 'system', content: ai.SYSTEM_PROMPT }, { role: 'user', content: prompt }];
  const analysis = await _invoke('poem', msgs, true, { temperature: 0.6, maxTokens: 1800 });
  return { success: true, analysis };
}

/**
 * 成语解释
 */
async function explainIdiom(word) {
  const w = (word || '').trim();
  if (!w) throw new Error('请输入成语');
  if (w.length > 20) throw new Error('成语过长，请检查输入');

  const prompt = `请详细解释成语「${w}」。\n\n请按以下结构输出：\n【成语释义】（20字内）\n\n【出处典故】\n\n【原文引用】\n\n【用法示例】\n例句1：\n例句2：\n\n【近义词】\n【反义词】`;
  const msgs        = [{ role: 'system', content: ai.SYSTEM_PROMPT }, { role: 'user', content: prompt }];
  const explanation = await _invoke('idiom', msgs, true, { temperature: 0.4, maxTokens: 1200 });
  return { success: true, explanation };
}

/**
 * 历史知识
 */
async function queryHistory(query) {
  if (!query?.trim()) throw new Error('请输入查询内容');
  if (query.length > 200) throw new Error('查询内容过长，请精简后重试');

  const prompt = `请介绍关于「${query}」的历史知识。\n\n请按以下结构输出（每部分120字内）：\n【历史概述】\n【重要内容】\n【深远影响】\n【文化印记】`;
  const msgs    = [{ role: 'system', content: ai.SYSTEM_PROMPT }, { role: 'user', content: prompt }];
  const content = await _invoke('history', msgs, true, { temperature: 0.5, maxTokens: 1800 });
  return { success: true, content };
}

/**
 * 智能搜索
 */
async function searchClassics(text) {
  if (!text?.trim()) throw new Error('请输入搜索内容');
  if (text.length > 200) throw new Error('搜索内容过长');

  const msgs  = [
    { role: 'system', content: ai.SYSTEM_PROMPT },
    { role: 'user',   content: `请从国学角度介绍：${text}` }
  ];
  const reply = await _invoke('search', msgs, true, { temperature: 0.65, maxTokens: 1500 });
  return { success: true, reply };
}

// ─── Toast 错误提示 ───────────────────────────────────────────
function showError(msg) {
  wx.showToast({ title: msg || '操作失败', icon: 'none', duration: 2500 });
}

// ─── 内部工具 ─────────────────────────────────────────────────
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
  searchClassics,
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
