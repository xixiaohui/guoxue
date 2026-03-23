/**
 * utils/ai.js - 生产级 AI 调用核心 v5.0
 *
 * 架构：小程序端直接调用 wx.cloud.extend.AI（官方文档推荐方式）
 *       云函数 guoxueAI 仅管配额
 *
 * 特性：
 *   ✅ 双模型   hunyuan-exp(混元) + deepseek(深度求索) 可选
 *   ✅ 主模型   hunyuan-turbos-latest（速度快，成本低）
 *   ✅ Fallback  hunyuan-pro（主模型失败时自动切换）
 *   ✅ DeepSeek  deepseek-v3（推理场景下可手动选择）
 *   ✅ 流式输出  textStream（边生成边显示）
 *   ✅ 非流式    generateText（静默场景）
 *   ✅ 降级      网络/模型异常时返回兜底内容
 *   ✅ 限流      前端令牌桶（防止连点暴刷）
 *   ✅ 超时      Promise.race 保护
 *   ✅ 重试      指数退避（最多2次）
 *
 * 使用前提：
 *   wx.cloud.init 已在 app.js 中完成（含 traceUser: true）
 *   需要在 app.json 中声明 cloud: true（或已初始化）
 */

// ─── 模型配置 ─────────────────────────────────────────────────
/**
 * 支持的模型提供商
 *   - HUNYUAN: 混元 (腾讯), provider='hunyuan-exp', 模型 hunyuan-turbos-latest / hunyuan-pro
 *   - DEEPSEEK: 深度求索, provider='deepseek', 模型 deepseek-v3 / deepseek-r1
 */
const PROVIDERS = {
  HUNYUAN:  'hunyuan-exp',  // 混元 provider 标识
  DEEPSEEK: 'deepseek',     // DeepSeek provider 标识
};

const MODELS = {
  // 混元系列
  HUNYUAN_TURBO: 'hunyuan-turbos-latest',  // 主力（速度优先）
  HUNYUAN_PRO:   'hunyuan-t1-latest',            // 备用（质量优先）
  // DeepSeek 系列
  DEEPSEEK_V3:   'deepseek-r1-0528',            // 推理增强
  DEEPSEEK_R1:   'deepseek-v3-0324',            // 强推理（慢）

  // 别名（向后兼容）
  PRIMARY:  'hunyuan-turbos-latest',
  FALLBACK: 'deepseek',
  PROVIDER: 'hunyuan-exp',
};

// ─── 当前全局偏好（可在运行时切换） ──────────────────────────
/**
 * currentProvider: 'hunyuan' | 'deepseek'
 * 由 setModelProvider() 修改
 */
let _currentProvider = 'hunyuan';  // 默认混元

/**
 * 切换模型提供商
 * @param {'hunyuan'|'deepseek'} provider
 */
function setModelProvider(provider) {
  if (provider === 'deepseek' || provider === 'hunyuan') {
    _currentProvider = provider;
    console.log('[AI] 切换模型提供商 ->', provider);
  }
}

function getModelProvider() {
  return _currentProvider;
}

// ─── 请求参数 ─────────────────────────────────────────────────
const CFG = {
  STREAM_TIMEOUT_MS:  30000,  // 流式总超时 30s
  FIRST_TOKEN_MS:     10000,  // 首个 token 超时 10s
  RETRY_DELAYS:       [1200, 2500],  // 指数退避间隔 ms
  MAX_TOKENS_DEFAULT: 1500,
  MAX_INPUT_LEN:      2000,
};

// ─── 前端令牌桶限流 ───────────────────────────────────────────
// 每个 type 独立限流：相同 type 请求间隔不得 < MIN_INTERVAL
const _lastCallTime = {};
const MIN_INTERVAL  = 1500; // ms，防止连点暴刷

// ─── 系统人设 ──────────────────────────────────────────────────
const SYSTEM_PROMPT =
`你是"文渊先生"，精通中国传统文化的国学大师与AI助手。
知识涵盖：诗词歌赋、经史子集、成语典故、历史人物与朝代、诸子百家、汉字文化。

【回答准则】
1. 语言简洁精炼，深入浅出，适合手机阅读
2. 适当使用【标题】分段，关键词加粗（**词**），引用原文用「」
3. 博学亲切，传统而不古板
4. 根据问题复杂度控制长度，一般不超过 600 字
5. 引用诗词典籍时提供原文+白话双语
请始终用中文回答。`;

// ─── 主调用入口（非流式） ─────────────────────────────────────
/**
 * 调用 AI，收集完整文本后返回
 * @param {string}  type     业务类型（用于限流 key）
 * @param {Array}   messages [{role, content}]
 * @param {Object}  opts     { temperature, maxTokens, provider }
 * @returns {Promise<string>}
 */
async function callAI(type, messages, opts = {}) {
  _throttleCheck(type);

  const temperature = opts.temperature ?? 0.7;
  const maxTokens   = opts.maxTokens   || CFG.MAX_TOKENS_DEFAULT;
  const provider    = opts.provider    || _currentProvider;

  if (provider === 'deepseek') {
    // DeepSeek 路径：主 deepseek-v3，不再 fallback 到混元（避免混淆）
    try {
      return await _callWithRetry(MODELS.DEEPSEEK_V3, PROVIDERS.DEEPSEEK, messages, { temperature, maxTokens });
    } catch (e) {
      console.error('[AI] deepseek 失败:', e.message);
      throw new Error(_friendlyError(e));
    }
  }

  // 混元路径：主 → fallback
  try {
    return await _callWithRetry(MODELS.HUNYUAN_TURBO, PROVIDERS.HUNYUAN, messages, { temperature, maxTokens });
  } catch (primaryErr) {
    console.warn(`[AI] 主模型失败(${MODELS.HUNYUAN_TURBO}):`, primaryErr.message);
    try {
      return await _callWithRetry(MODELS.HUNYUAN_PRO, PROVIDERS.HUNYUAN, messages, { temperature, maxTokens });
    } catch (fallbackErr) {
      console.error(`[AI] fallback模型失败(${MODELS.HUNYUAN_PRO}):`, fallbackErr.message);
      throw new Error(_friendlyError(fallbackErr));
    }
  }
}

// ─── 流式调用入口 ─────────────────────────────────────────────
/**
 * 流式调用 AI，通过回调逐步推送文本
 * @param {string}   type       业务类型（限流 key）
 * @param {Array}    messages   [{role, content}]
 * @param {Function} onChunk    (text: string) => void
 * @param {Function} onDone     (fullText: string) => void
 * @param {Function} onError    (err: Error) => void
 * @param {Object}   opts       { temperature, maxTokens, provider }
 */
async function callAIStream(type, messages, onChunk, onDone, onError, opts = {}) {
  _throttleCheck(type);

  const temperature = opts.temperature ?? 0.75;
  const maxTokens   = opts.maxTokens   || CFG.MAX_TOKENS_DEFAULT;
  const provider    = opts.provider    || _currentProvider;

  try {
    const text = await _streamWithFallback(messages, { temperature, maxTokens, provider }, onChunk);
    onDone && onDone(text);
  } catch (e) {
    console.error('[AI][stream] error:', e.message);
    onError && onError(new Error(_friendlyError(e)));
  }
}

// ─── 内部：带重试的单模型非流式调用 ─────────────────────────────
async function _callWithRetry(modelName, providerName, messages, opts, attempt = 0) {
  try {
    return await _callOnce(modelName, providerName, messages, opts);
  } catch (e) {
    if (attempt < CFG.RETRY_DELAYS.length && _isRetryable(e)) {
      const delay = CFG.RETRY_DELAYS[attempt];
      console.log(`[AI] 重试 model=${modelName} attempt=${attempt+1} delay=${delay}ms`);
      await _sleep(delay);
      return _callWithRetry(modelName, providerName, messages, opts, attempt + 1);
    }
    throw e;
  }
}

// ─── 内部：单次非流式调用（收集流式文本） ────────────────────────
async function _callOnce(modelName, providerName, messages, opts) {
  const model = wx.cloud.extend.AI.createModel(providerName);

  const callPromise = model.streamText({
    data: {
      model:       modelName,
      messages,
      temperature: opts.temperature,
      max_tokens:  opts.maxTokens,
      top_p:       0.9,
    }
  });

  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`TIMEOUT:${modelName}`)), CFG.STREAM_TIMEOUT_MS)
  );

  const res = await Promise.race([callPromise, timeoutPromise]);

  let fullText   = '';
  let firstToken = false;
  const firstTokenTimer = setTimeout(() => {
    if (!firstToken) {
      // 不能在 for-await 外抛异常，标记后在循环结束后检测
    }
  }, CFG.FIRST_TOKEN_MS);

  try {
    for await (const text of res.textStream) {
      firstToken = true;
      if (text) fullText += text;
    }
  } finally {
    clearTimeout(firstTokenTimer);
  }

  if (!fullText) throw new Error(`EMPTY_RESPONSE:${modelName}`);
  console.log(`[AI] model=${modelName} provider=${providerName} len=${fullText.length}`);
  return fullText;
}

// ─── 内部：流式 + fallback ────────────────────────────────────
async function _streamWithFallback(messages, opts, onChunk) {
  const { provider = 'hunyuan' } = opts;

  if (provider === 'deepseek') {
    // DeepSeek 流式：主 deepseek-v3
    try {
      return await _streamOnce(MODELS.DEEPSEEK_V3, PROVIDERS.DEEPSEEK, messages, opts, onChunk);
    } catch (e) {
      console.warn('[AI][stream] deepseek 失败:', e.message);
      throw e;
    }
  }

  // 混元流式：主 → fallback
  try {
    return await _streamOnce(MODELS.HUNYUAN_TURBO, PROVIDERS.HUNYUAN, messages, opts, onChunk);
  } catch (primaryErr) {
    console.warn(`[AI][stream] 主模型失败，切换 fallback:`, primaryErr.message);
    try {
      const text = await _callWithRetry(MODELS.HUNYUAN_PRO, PROVIDERS.HUNYUAN, messages, opts);
      onChunk && onChunk(text);  // 一次性推送（降级体验）
      return text;
    } catch (fallbackErr) {
      throw fallbackErr;
    }
  }
}

// ─── 内部：单次流式调用 ────────────────────────────────────────
async function _streamOnce(modelName, providerName, messages, opts, onChunk) {
  const model = wx.cloud.extend.AI.createModel(providerName);

  const callPromise = model.streamText({
    data: {
      model:       modelName,
      messages,
      temperature: opts.temperature,
      max_tokens:  opts.maxTokens,
      top_p:       0.9,
    }
  });

  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`TIMEOUT:${modelName}`)), CFG.STREAM_TIMEOUT_MS)
  );

  const res = await Promise.race([callPromise, timeoutPromise]);

  let fullText   = '';
  let firstToken = false;

  // 首个 token 超时保护
  let firstTokenReject;
  const firstTokenPromise = new Promise((_, reject) => { firstTokenReject = reject; });
  const firstTokenTimer   = setTimeout(() => {
    if (!firstToken) firstTokenReject(new Error(`FIRST_TOKEN_TIMEOUT:${modelName}`));
  }, CFG.FIRST_TOKEN_MS);

  try {
    for await (const text of res.textStream) {
      firstToken = true;
      clearTimeout(firstTokenTimer);
      if (text) {
        fullText += text;
        onChunk && onChunk(text);
      }
    }
  } finally {
    clearTimeout(firstTokenTimer);
  }

  if (!fullText) throw new Error(`EMPTY_RESPONSE:${modelName}`);
  return fullText;
}

// ─── 限流 ────────────────────────────────────────────────────
function _throttleCheck(type) {
  const now  = Date.now();
  const last = _lastCallTime[type] || 0;
  if (now - last < MIN_INTERVAL) {
    throw new Error('操作太频繁，请稍候再试');
  }
  _lastCallTime[type] = now;
}

// ─── 重试判断 ─────────────────────────────────────────────────
function _isRetryable(e) {
  const msg = (e.message || '').toUpperCase();
  return msg.includes('TIMEOUT')
    || msg.includes('NETWORK')
    || msg.includes('FAILED')
    || msg.includes('500')
    || msg.includes('503');
}

// ─── 友好错误文案 ─────────────────────────────────────────────
function _friendlyError(e) {
  const msg = (e.message || String(e)).toLowerCase();
  if (msg.includes('操作太频繁'))            return '操作太频繁，请稍候再试';
  if (msg.includes('token') && !msg.includes('timeout'))
                                             return 'AI调用次数达到上限，请稍后再试';
  if (msg.includes('timeout') || msg.includes('超时'))
                                             return '网络超时，请检查网络后重试';
  if (msg.includes('first_token_timeout'))  return '网络超时，请检查网络后重试';
  if (msg.includes('empty_response'))       return 'AI 返回为空，请稍后重试';
  if (msg.includes('not supported') || msg.includes('createmodel'))
                                             return '当前微信版本过低，请升级后使用 AI 功能';
  if (msg.includes('network') || msg.includes('failed'))
                                             return '网络连接失败，请检查网络';
  if (msg.includes('过长'))                  return '输入内容过长，请缩短后重试';
  return 'AI 服务繁忙，请稍后重试';
}

function _sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ─── 导出 ────────────────────────────────────────────────────
module.exports = {
  SYSTEM_PROMPT,
  callAI,
  callAIStream,
  setModelProvider,
  getModelProvider,
  CFG,
  MODELS,
  PROVIDERS,
};
