/**
 * 国学AI助手 - 云函数 guoxueAI
 * 使用最新 wx.cloud.extend.AI streamText 流式 API
 * 模型：hunyuan-turbos-latest
 * 配额：云数据库 user_quota 集合（免费5次/天，VIP/广告奖励无限）
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

// ─── 系统人设 ────────────────────────────────────────────────
const SYSTEM_PROMPT = `你是"文渊先生"，一位精通中国传统文化的国学大师与AI助手。
你的知识涵盖：诗词歌赋、经史子集、成语典故、历史人物与朝代、诸子百家、汉字文化。

【回答准则】
1. 语言：简洁精炼，深入浅出，适合手机阅读
2. 格式：适当使用【标题】分段，关键词加粗（**词**），引用原文用「」
3. 态度：博学而亲切，传统而不古板
4. 长度：根据问题复杂度控制，一般不超过600字
5. 原文：引用诗词典籍时，提供原文+白话双语

请始终用中文回答。`;

const FREE_DAILY_LIMIT = 5;
const QUOTA_COLLECTION = 'user_quota';
const MODEL_NAME = 'hunyuan-turbos-latest';

// ─── 入口 ────────────────────────────────────────────────
exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();
  const { type } = event;

  // daily / daily_idiom 不计入每日配额（缓存型内容）
  const quotaFree = ['daily', 'daily_idiom'].includes(type);

  try {
    // ── 配额检查 ──────────────────────────────
    if (!quotaFree && OPENID) {
      const quota = await _checkAndConsumeQuota(OPENID);
      if (!quota.canUse) {
        return {
          success: false,
          quota_exceeded: true,
          remaining: 0,
          error: '今日免费次数已用完，请观看视频广告或升级会员继续使用',
          isVip: quota.isVip,
          hasAdBonus: quota.hasAdBonus
        };
      }
    }

    // ── 路由到各业务处理器 ──────────────────────────────
    switch (type) {
      case 'chat':        return await handleChat(event.messages);
      case 'translate':   return await handleTranslate(event.text, event.mode);
      case 'daily':       return await handleDailyClassic();
      case 'daily_idiom': return await handleDailyIdiom();
      case 'poem':        return await handlePoemAnalysis(event.text);
      case 'idiom':       return await handleIdiomExplain(event.text);
      case 'history':     return await handleHistory(event.text);
      case 'search':      return await handleSearch(event.text);
      default:            return err('未知请求类型: ' + type);
    }
  } catch (e) {
    console.error(`[guoxueAI][${type}]`, e);
    return err(friendlyError(e));
  }
};

// ─── 核心：调用 AI 模型（流式收集完整文本）──────────────────────────────────
/**
 * 使用最新 wx.cloud.extend.AI streamText API
 * 收集全部 stream 事件后拼接返回完整字符串
 */
async function callModel(messages, opts = {}) {
  const model = cloud.extend.AI.createModel(MODEL_NAME);

  const res = await model.streamText({
    data: {
      model: MODEL_NAME,
      messages,
      temperature: opts.temperature ?? 0.7,
      max_tokens: opts.maxTokens || 2000,
      top_p: opts.topP ?? 0.9
    }
  });

  let fullText = '';
  let thinkText = '';  // deepseek-r1 思维链（hunyuan 通常无此字段）

  for await (const event of res.eventStream) {
    // 流结束标志
    if (event.data === '[DONE]') break;

    let data;
    try {
      data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
    } catch (e) {
      continue; // 跳过非 JSON 行
    }

    // 思维链（reasoning_content，部分模型返回）
    const think = data?.choices?.[0]?.delta?.reasoning_content;
    if (think) thinkText += think;

    // 正文内容
    const text = data?.choices?.[0]?.delta?.content;
    if (text) fullText += text;
  }

  if (!fullText && !thinkText) throw new Error('AI 返回内容为空');
  return fullText || thinkText;
}

// ─── 多轮对话 ────────────────────────────────────────────────
async function handleChat(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return err('消息列表不能为空');
  const trimmed = messages.slice(-12);
  const reply = await callModel(
    [{ role: 'system', content: SYSTEM_PROMPT }, ...trimmed],
    { temperature: 0.75, maxTokens: 1500 }
  );
  return ok({ reply });
}

// ─── 古文翻译 ────────────────────────────────────────────────
async function handleTranslate(text, mode) {
  if (!text?.trim()) return err('请输入需要翻译的文本');
  const isAncient = mode !== 'modern_to_ancient';
  const prompt = isAncient
    ? `请将下列文言文翻译成现代白话文，并进行注释。\n\n【原文】\n${text}\n\n请严格按以下结构输出：\n【译文】\n（现代白话文翻译）\n\n【注释】\n（逐一解释关键字词或典故）\n\n【背景】\n（简述作品或句子的历史文化背景，2-3句）`
    : `请将下列现代白话文改写成古雅的文言文风格。\n\n【原文】\n${text}\n\n请严格按以下结构输出：\n【文言文】\n（文言文改写版本）\n\n【用词说明】\n（解释所用的关键文言词汇及语法）`;

  const result = await callModel(
    [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: prompt }],
    { temperature: 0.4, maxTokens: 1500 }
  );
  return ok({ result });
}

// ─── 每日经典 ────────────────────────────────────────────────
async function handleDailyClassic() {
  const today = _formatDate(new Date());
  const prompt = `今天是${today}，请推荐一条适合今天的经典名句（诗词、典籍、名言皆可）。\n\n请严格按以下JSON格式返回（不要有多余文字）：\n{\n  "quote": "经典原文（完整句子）",\n  "author": "作者 · 朝代 · 出处",\n  "translation": "白话文解释（30字以内）",\n  "analysis": "意境赏析（60字以内）",\n  "insight": "今日启示（30字以内）"\n}`;

  const raw = await callModel(
    [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: prompt }],
    { temperature: 0.85, maxTokens: 500 }
  );

  let daily;
  try {
    const jsonStr = raw.match(/\{[\s\S]*\}/)?.[0] || raw;
    daily = JSON.parse(jsonStr);
  } catch (e) {
    daily = { quote: raw.substring(0, 200), author: '', translation: '', analysis: '', insight: '' };
  }
  return ok({ daily });
}

// ─── 每日成语 ────────────────────────────────────────────────
async function handleDailyIdiom() {
  const today = _formatDate(new Date());
  const prompt = `今天是${today}，请随机推荐一个有趣的四字成语。\n\n请严格按以下JSON格式返回（不要有多余文字）：\n{\n  "word": "成语",\n  "pinyin": "pīn yīn",\n  "brief": "一句话释义（20字以内）",\n  "origin": "出处典籍或历史故事名称",\n  "story": "典故故事（80字以内）",\n  "example": "一个现代用法例句",\n  "antonym": "反义词（1-2个）",\n  "synonym": "近义词（1-2个）"\n}`;

  const raw = await callModel(
    [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: prompt }],
    { temperature: 0.9, maxTokens: 600 }
  );

  let idiom;
  try {
    const jsonStr = raw.match(/\{[\s\S]*\}/)?.[0] || raw;
    idiom = JSON.parse(jsonStr);
  } catch (e) {
    idiom = {
      word: '一鸣惊人', pinyin: 'yī míng jīng rén',
      brief: '平时没有表现，突然做出惊人成绩',
      origin: '《史记》', story: '', example: '', antonym: '', synonym: ''
    };
  }
  return ok({ idiom });
}

// ─── 诗词赏析 ────────────────────────────────────────────────
async function handlePoemAnalysis(text) {
  if (!text?.trim()) return err('请输入诗词内容');
  const prompt = `请对以下诗词进行专业赏析：\n\n${text}\n\n请按以下结构输出（每部分控制在100字以内）：\n【作品信息】\n（朝代、作者、创作背景）\n\n【逐句注释】\n（关键字词解释，古汉语语法说明）\n\n【意境赏析】\n（分析意象、情感基调、艺术手法）\n\n【文学地位】\n（在中国文学史上的价值与影响）`;

  const analysis = await callModel(
    [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: prompt }],
    { temperature: 0.6, maxTokens: 1800 }
  );
  return ok({ analysis });
}

// ─── 成语解释 ────────────────────────────────────────────────
async function handleIdiomExplain(word) {
  if (!word?.trim()) return err('请输入成语');
  const prompt = `请详细解释成语「${word}」。\n\n请按以下结构输出：\n【成语释义】\n（简明释义，20字以内）\n\n【出处典故】\n（来源文献及历史故事）\n\n【原文引用】\n（出处原文，如无则说明）\n\n【用法示例】\n例句1：（现代语境例句）\n例句2：（另一语境例句）\n\n【近义词】（列出2-3个）\n【反义词】（列出2-3个）`;

  const explanation = await callModel(
    [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: prompt }],
    { temperature: 0.4, maxTokens: 1200 }
  );
  return ok({ explanation });
}

// ─── 历史知识 ────────────────────────────────────────────────
async function handleHistory(query) {
  if (!query?.trim()) return err('请输入查询内容');
  const prompt = `请介绍关于「${query}」的历史知识。\n\n请按以下结构输出（每部分控制在120字以内）：\n【历史概述】\n（时间、地点、主要人物简介）\n\n【重要内容】\n（详细历史事件、过程或人物生平）\n\n【深远影响】\n（对后世政治、文化、社会的影响）\n\n【文化印记】\n（相关诗词、典故、成语或艺术作品）`;

  const content = await callModel(
    [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: prompt }],
    { temperature: 0.5, maxTokens: 1800 }
  );
  return ok({ content });
}

// ─── 智能搜索 ────────────────────────────────────────────────
async function handleSearch(text) {
  if (!text?.trim()) return err('请输入搜索内容');
  const reply = await callModel(
    [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: `请从国学角度介绍：${text}` }],
    { temperature: 0.65, maxTokens: 1500 }
  );
  return ok({ reply });
}

// ─── 配额检查并消费 ────────────────────────────────────────────────
async function _checkAndConsumeQuota(openid) {
  try {
    const now = Date.now();
    const today = _today();

    let doc;
    try {
      const res = await db.collection(QUOTA_COLLECTION).doc(openid).get();
      doc = res.data;
    } catch (e) {
      doc = {
        _id: openid, openid,
        date: today, used: 0,
        vip_expire: 0, ad_bonus_expire: 0,
        total_used: 0, created_at: now, updated_at: now
      };
      await db.collection(QUOTA_COLLECTION).add({ data: doc });
    }

    const isVip = (doc.vip_expire || 0) > now;
    const hasAdBonus = (doc.ad_bonus_expire || 0) > now;

    // 会员/激励广告不限量
    if (isVip || hasAdBonus) {
      await db.collection(QUOTA_COLLECTION).doc(openid).update({
        data: { total_used: _.inc(1), updated_at: now }
      });
      return { canUse: true, isVip, hasAdBonus, remaining: 999 };
    }

    // 跨日重置
    const used = (doc.date === today) ? (doc.used || 0) : 0;
    if (used >= FREE_DAILY_LIMIT) {
      return { canUse: false, isVip: false, hasAdBonus: false, remaining: 0 };
    }

    await db.collection(QUOTA_COLLECTION).doc(openid).update({
      data: { date: today, used: used + 1, total_used: _.inc(1), updated_at: now }
    });

    return { canUse: true, isVip: false, hasAdBonus: false, remaining: FREE_DAILY_LIMIT - used - 1 };
  } catch (e) {
    console.warn('[quota] check failed, allowing request:', e.message);
    // 配额检查失败降级放行，不影响用户
    return { canUse: true, isVip: false, hasAdBonus: false, remaining: 1 };
  }
}

// ─── 工具函数 ────────────────────────────────────────────────
function ok(data)  { return { success: true,  ...data }; }
function err(msg)  { return { success: false, error: msg }; }

function _formatDate(d) {
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

function _today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function friendlyError(e) {
  const msg = e?.message || String(e);
  if (msg.includes('quota') || msg.includes('limit'))  return 'AI调用次数达到上限，请稍后再试';
  if (msg.includes('timeout'))                          return '请求超时，请检查网络后重试';
  if (msg.includes('token'))                            return '输入内容过长，请缩短后重试';
  if (msg.includes('createModel') || msg.includes('AI')) return 'AI模型暂时不可用，请稍后再试';
  return 'AI服务暂时繁忙，请稍后重试';
}
