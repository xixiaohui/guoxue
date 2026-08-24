// utils/seo.js - 微信搜一搜 SEO 统一封装（基础库 2.2.2+ 支持 wx.setPageInfo）
//
// 用法：
//   const seo = require('../../utils/seo');
//   seo.reportPageInfo({
//     title: '古诗词大全',                     // 页面标题（搜一搜展示，≤30 字符）
//     navTitle: '古诗词大全',                   // 导航栏标题（可选，默认同 title，≤24 字符）
//     keywords: seo.buildKeywords(['古诗词', '唐诗', '宋词']), // 关键词 ≤30 字符
//     description: '摘要文本'                   // ≤60 字符
//   });

/**
 * 上报页面信息：设置导航栏标题 + wx.setPageInfo（供搜一搜收录与结果展示）
 */
function reportPageInfo({ title, keywords, description, navTitle }) {
  const nav = (navTitle || title || '').slice(0, 24);
  try {
    wx.setNavigationBarTitle({ title: nav });
  } catch (_) {}
  if (!wx.setPageInfo) return;
  try {
    wx.setPageInfo({
      title: nav,
      keywords: (keywords || '').slice(0, 30),
      description: (description || '').slice(0, 60)
    });
  } catch (_) {}
}

/**
 * 拼接关键词：按传入顺序去重，逐词加入直至超过 30 字符上限
 * （避免直接 slice 截断到半个词，保证排在前的核心关键词完整）
 */
function buildKeywords(parts) {
  const picked = [];
  let total = 0;
  (parts || []).forEach((p) => {
    if (!p || picked.indexOf(p) >= 0) return;
    const cost = total === 0 ? p.length : p.length + 1; // +1 为逗号
    if (total + cost > 30) return;
    picked.push(p);
    total += cost;
  });
  return picked.join(',');
}

module.exports = { reportPageInfo, buildKeywords };
