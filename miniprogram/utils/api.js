// utils/api.js - 统一云函数调用封装，生产级错误处理

const CLOUD_FUNC = 'guoxueAI';
const MAX_RETRIES = 2;
const TIMEOUT = 30000; // 30s

/**
 * 核心调用方法：带超时、重试、统一错误处理
 */
function callAI(type, data = {}, retries = 0) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('请求超时，请检查网络后重试'));
    }, TIMEOUT);

    wx.cloud.callFunction({
      name: CLOUD_FUNC,
      data: { type, ...data }
    }).then(res => {
      clearTimeout(timer);
      const result = res.result;
      if (!result) {
        reject(new Error('服务响应异常'));
        return;
      }
      if (!result.success) {
        reject(new Error(result.error || '服务暂时不可用'));
        return;
      }
      resolve(result);
    }).catch(err => {
      clearTimeout(timer);
      // 云函数未部署或网络异常时重试
      if (retries < MAX_RETRIES && isRetryableError(err)) {
        setTimeout(() => {
          callAI(type, data, retries + 1).then(resolve).catch(reject);
        }, 1000 * (retries + 1));
      } else {
        reject(normalizeError(err));
      }
    });
  });
}

function isRetryableError(err) {
  const msg = (err.errMsg || err.message || '').toLowerCase();
  return msg.includes('network') || msg.includes('timeout') || msg.includes('failed');
}

function normalizeError(err) {
  const msg = err.errMsg || err.message || '';
  if (msg.includes('FunctionName')) return new Error('AI服务尚未就绪，请稍后再试');
  if (msg.includes('Environment')) return new Error('云环境配置错误，请联系开发者');
  if (msg.includes('network') || msg.includes('fail')) return new Error('网络连接失败，请检查网络');
  return new Error(msg || '未知错误，请重试');
}

/**
 * 显示统一 Toast 错误
 */
function showError(msg) {
  wx.showToast({ title: msg || '操作失败', icon: 'none', duration: 2500 });
}

// ─── 具体 API 方法 ────────────────────────────────────────

/**
 * AI多轮对话
 * @param {Array} messages [{role:'user'|'assistant', content:'...'}]
 */
function chat(messages) {
  return callAI('chat', { messages });
}

/**
 * 古文翻译
 * @param {string} text 输入文本
 * @param {string} mode 'ancient_to_modern' | 'modern_to_ancient'
 */
function translate(text, mode) {
  return callAI('translate', { text, mode });
}

/**
 * 每日经典（带本地日期缓存，同一天不重复请求）
 */
function getDailyClassic(forceRefresh = false) {
  const today = _todayKey();
  if (!forceRefresh) {
    try {
      const cached = wx.getStorageSync('daily_' + today);
      if (cached) return Promise.resolve({ success: true, daily: cached, fromCache: true });
    } catch (e) {}
  }
  return callAI('daily').then(res => {
    try { wx.setStorageSync('daily_' + today, res.daily); } catch (e) {}
    return res;
  });
}

/**
 * 诗词深度赏析
 * @param {string} text 诗词原文
 */
function analyzePoem(text) {
  return callAI('poem', { text });
}

/**
 * 成语解释
 * @param {string} word 成语
 */
function explainIdiom(word) {
  return callAI('idiom', { text: word });
}

/**
 * 历史知识
 * @param {string} query 查询内容
 */
function queryHistory(query) {
  return callAI('history', { text: query });
}

/**
 * 生成今日成语（AI随机出题）
 */
function getDailyIdiom(forceRefresh = false) {
  const today = _todayKey();
  const key = 'daily_idiom_' + today;
  if (!forceRefresh) {
    try {
      const cached = wx.getStorageSync(key);
      if (cached) return Promise.resolve({ success: true, idiom: cached, fromCache: true });
    } catch (e) {}
  }
  return callAI('daily_idiom').then(res => {
    try { wx.setStorageSync(key, res.idiom); } catch (e) {}
    return res;
  });
}

function _todayKey() {
  const d = new Date();
  return `${d.getFullYear()}${d.getMonth() + 1}${d.getDate()}`;
}

module.exports = {
  chat,
  translate,
  getDailyClassic,
  analyzePoem,
  explainIdiom,
  queryHistory,
  getDailyIdiom,
  showError,
  callAI
};
