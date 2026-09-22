/**
 * utils/crossword.js - 诗词填字进度存储
 *
 * 两个页面共用同一份进度：
 *   - pages/crossword_puzzle/index 写入（通关后累计）
 *   - pages/chinesepoetry/index 读取（入口卡片展示「已闯 N 关」）
 * 朋友圈单页模式（scene 1154）下本地存储与普通模式不共用，读写均以 try/catch 兜底。
 */

const PROGRESS_KEY = 'crossword_progress';

/** 读取进度：{ cleared: 已通关最高关数, totalStars: 累计星数 } */
function readProgress() {
  try {
    const v = wx.getStorageSync(PROGRESS_KEY);
    if (v && typeof v === 'object') {
      return { cleared: Number(v.cleared) || 0, totalStars: Number(v.totalStars) || 0 };
    }
  } catch (_) {}
  return { cleared: 0, totalStars: 0 };
}

/** 记录一次通关：取「最高关卡」较大值，星数累加 */
function saveCleared(level, stars) {
  const p = readProgress();
  const next = {
    cleared: Math.max(p.cleared, Number(level) || 1),
    totalStars: p.totalStars + (Number(stars) || 0)
  };
  try {
    wx.setStorageSync(PROGRESS_KEY, next);
  } catch (_) {}
  return next;
}

module.exports = { PROGRESS_KEY, readProgress, saveCleared };
