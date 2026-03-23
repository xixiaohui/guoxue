/**
 * 国学AI助手 - 云函数 guoxueAI v3.2
 * 使用最新 wx.cloud.extend.AI streamText 流式 API
 * 模型：hunyuan-turbos-latest
 * 配额：云数据库 user_quota 集合（免费10次/天，VIP/广告奖励无限）
 * 优化：增强错误处理、输入校验、超时保护、日志追踪
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

const FREE_DAILY_LIMIT = 10;          // 每日免费 AI 调用次数
const QUOTA_COLLECTION = 'user_quota';
const MODEL_NAME = 'hunyuan-turbos-latest';
const MAX_INPUT_LENGTH = 2000;         // 单次输入最大字符数
const STREAM_TIMEOUT_MS = 30000;       // 流式响应超时（30s）

// ─── 入口 ────────────────────────────────────────────────
exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();
  const { type } = event;

  // 请求参数基础校验
  if (!type || typeof type !== 'string') {
    return err('缺少请求类型参数');
  }

  // daily / daily_idiom 不计入每日配额（缓存型内容）
  const quotaFree = ['daily', 'daily_idiom'].includes(type);

  console.log(`[guoxueAI] type=${type} openid=${OPENID ? OPENID.slice(0, 8) + '...' : 'none'}`);

  try {
    // ── 配额检查 ──────────────────────────────
    if (!quotaFree && OPENID) {
      const quota = await _checkAndConsumeQuota(OPENID);
      if (!quota.canUse) {
        console.warn(`[guoxueAI] quota exceeded for ${OPENID.slice(0, 8)}`);
        return {
          success: false,
          quota_exceeded: true,
          remaining: 0,
          error: `今日免费次数已用完（每日${FREE_DAILY_LIMIT}次），请观看视频广告或升级会员继续使用`,
          isVip: quota.isVip,
          hasAdBonus: quota.hasAdBonus
        };
      }
    }

    // ── 路由到各业务处理器 ──────────────────────────────
    const startTime = Date.now();
    let result;
    switch (type) {
      case 'chat':        result = await handleChat(event.messages); break;
      case 'translate':   result = await handleTranslate(event.text, event.mode); break;
      case 'daily':       result = await handleDailyClassic(); break;
      case 'daily_idiom': result = await handleDailyIdiom(); break;
      case 'poem':        result = await handlePoemAnalysis(event.text); break;
      case 'idiom':       result = await handleIdiomExplain(event.text); break;
      case 'history':     result = await handleHistory(event.text); break;
      case 'search':      result = await handleSearch(event.text); break;
      default:            return err('未知请求类型: ' + type);
    }
    console.log(`[guoxueAI] ${type} 完成，耗时 ${Date.now() - startTime}ms`);
    return result;
  } catch (e) {
    console.error(`[guoxueAI][${type}] 异常:`, e.message || e);
    return err(friendlyError(e));
  }
};

// ─── 核心：调用 AI 模型（流式收集完整文本）──────────────────────────────────
/**
 * 使用最新 wx.cloud.extend.AI streamText API
 * 收集全部 stream 事件后拼接返回完整字符串
 * @param {Array} messages  消息数组 [{role, content}]
 * @param {Object} opts     可选配置 {temperature, maxTokens, topP}
 * @returns {Promise<string>} 完整回复文本
 */
async function callModel(messages, opts = {}) {
  // 校验消息格式
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error('消息列表不能为空');
  }

  const model = cloud.extend.AI.createModel(MODEL_NAME);

  // 带超时的流式调用
  const streamPromise = model.streamText({
    data: {
      model: MODEL_NAME,
      messages,
      temperature: opts.temperature ?? 0.7,
      max_tokens: opts.maxTokens || 2000,
      top_p: opts.topP ?? 0.9
    }
  });

  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('AI 请求超时，请重试')), STREAM_TIMEOUT_MS)
  );

  const res = await Promise.race([streamPromise, timeoutPromise]);

  let fullText = '';
  let thinkText = '';  // deepseek-r1 思维链（hunyuan 通常无此字段）
  let eventCount = 0;

  for await (const event of res.eventStream) {
    // 流结束标志
    if (event.data === '[DONE]') break;

    let data;
    try {
      data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
    } catch (e) {
      continue; // 跳过非 JSON 行（如心跳包）
    }

    eventCount++;

    // 思维链（reasoning_content，部分模型如 deepseek-r1 返回）
    const think = data?.choices?.[0]?.delta?.reasoning_content;
    if (think) thinkText += think;

    // 正文内容
    const text = data?.choices?.[0]?.delta?.content;
    if (text) fullText += text;

    // finish_reason 检测（可选）
    const finishReason = data?.choices?.[0]?.finish_reason;
    if (finishReason && finishReason !== 'null') {
      break;
    }
  }

  console.log(`[callModel] events=${eventCount} textLen=${fullText.length} thinkLen=${thinkText.length}`);

  if (!fullText && !thinkText) throw new Error('AI 返回内容为空，请稍后重试');
  return fullText || thinkText;
}

// ─── 多轮对话 ────────────────────────────────────────────────
async function handleChat(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return err('消息列表不能为空');
  // 过滤非法消息格式，保留最近12条
  const valid = messages.filter(m => m && typeof m.role === 'string' && typeof m.content === 'string');
  if (valid.length === 0) return err('消息格式不正确');
  const trimmed = valid.slice(-12);
  const reply = await callModel(
    [{ role: 'system', content: SYSTEM_PROMPT }, ...trimmed],
    { temperature: 0.75, maxTokens: 1500 }
  );
  return ok({ reply });
}

// ─── 古文翻译 ────────────────────────────────────────────────
async function handleTranslate(text, mode) {
  if (!text?.trim()) return err('请输入需要翻译的文本');
  if (text.length > MAX_INPUT_LENGTH) return err(`输入内容过长，请控制在${MAX_INPUT_LENGTH}字以内`);
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
  if (text.length > MAX_INPUT_LENGTH) return err(`诗词内容过长，请控制在${MAX_INPUT_LENGTH}字以内`);
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
  // 成语通常2-8字，过长的输入拦截
  const trimWord = word.trim();
  if (trimWord.length > 20) return err('成语输入过长，请检查后重试');
  const prompt = `请详细解释成语「${trimWord}」。\n\n请按以下结构输出：\n【成语释义】\n（简明释义，20字以内）\n\n【出处典故】\n（来源文献及历史故事）\n\n【原文引用】\n（出处原文，如无则说明）\n\n【用法示例】\n例句1：（现代语境例句）\n例句2：（另一语境例句）\n\n【近义词】（列出2-3个）\n【反义词】（列出2-3个）`;

  const explanation = await callModel(
    [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: prompt }],
    { temperature: 0.4, maxTokens: 1200 }
  );
  return ok({ explanation });
}

// ─── 历史知识 ────────────────────────────────────────────────
async function handleHistory(query) {
  if (!query?.trim()) return err('请输入查询内容');
  if (query.length > 200) return err('查询内容过长，请精简后重试');
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
  if (text.length > 200) return err('搜索内容过长，请精简后重试');
  const reply = await callModel(
    [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: `请从国学角度介绍：${text}` }],
    { temperature: 0.65, maxTokens: 1500 }
  );
  return ok({ reply });
}

// ─── 配额检查并消费 ────────────────────────────────────────────────
/**
 * 检查并消费一次配额
 * - VIP 或激励广告用户：直接放行，仅记录总次数
 * - 普通用户：按自然日计数，超限拒绝
 * - 数据库操作失败：降级放行，避免影响用户
 */
async function _checkAndConsumeQuota(openid) {
  try {
    const now = Date.now();
    const today = _today();

    let doc;
    try {
      const res = await db.collection(QUOTA_COLLECTION).doc(openid).get();
      doc = res.data;
    } catch (e) {
      // 文档不存在，创建新用户记录
      doc = {
        _id: openid, openid,
        date: today, used: 0,
        vip_expire: 0, ad_bonus_expire: 0,
        total_used: 0, created_at: now, updated_at: now
      };
      try {
        await db.collection(QUOTA_COLLECTION).add({ data: doc });
      } catch (addErr) {
        // add 失败（并发创建）忽略，继续流程
        console.warn('[quota] add doc conflict:', addErr.message);
      }
    }

    const isVip = (doc.vip_expire || 0) > now;
    const hasAdBonus = (doc.ad_bonus_expire || 0) > now;

    // 会员/激励广告不限量，仅更新总次数
    if (isVip || hasAdBonus) {
      db.collection(QUOTA_COLLECTION).doc(openid).update({
        data: { total_used: _.inc(1), updated_at: now }
      }).catch(e => console.warn('[quota] update total_used failed:', e.message));
      return { canUse: true, isVip, hasAdBonus, remaining: 999 };
    }

    // 跨日重置（自然日维度）
    const used = (doc.date === today) ? (doc.used || 0) : 0;
    if (used >= FREE_DAILY_LIMIT) {
      console.log(`[quota] exceeded: openid=${openid.slice(0,8)} used=${used} limit=${FREE_DAILY_LIMIT}`);
      return { canUse: false, isVip: false, hasAdBonus: false, remaining: 0 };
    }

    // 原子更新使用次数
    await db.collection(QUOTA_COLLECTION).doc(openid).update({
      data: {
        date: today,
        used: used + 1,
        total_used: _.inc(1),
        updated_at: now
      }
    });

    const remaining = FREE_DAILY_LIMIT - used - 1;
    console.log(`[quota] consumed: openid=${openid.slice(0,8)} used=${used+1} remaining=${remaining}`);
    return { canUse: true, isVip: false, hasAdBonus: false, remaining };
  } catch (e) {
    // 配额检查失败降级放行，不影响用户体验
    console.warn('[quota] check failed, fallback allow:', e.message);
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
  const msg = (e?.message || String(e)).toLowerCase();
  if (msg.includes('timeout') || msg.includes('超时'))        return '请求超时，请检查网络后重试';
  if (msg.includes('token') || msg.includes('过长'))          return '输入内容过长，请缩短后重试';
  if (msg.includes('quota') || msg.includes('limit'))         return 'AI调用次数达到上限，请稍后再试';
  if (msg.includes('createmodel') || msg.includes(' ai '))    return 'AI模型暂时不可用，请稍后再试';
  if (msg.includes('network') || msg.includes('net::'))       return '网络异常，请检查网络连接后重试';
  if (msg.includes('为空') || msg.includes('empty'))          return 'AI返回内容为空，请稍后重试';
  return 'AI服务暂时繁忙，请稍后重试';
}
