// utils/settings.js - 全局设置管理（字体、主题）

const KEY = 'app_settings';

const DEFAULTS = {
  fontSize: 'normal',   // small | normal | large
  theme: 'classic',     // classic | dark | green
  fontFamily: 'default' // default | song | kai | fangsong | hei | xingkai
};

// 正文字体 → 根节点工具类（app.wxss 中定义对应字体族）
const FONT_FAMILY_CLASS = {
  default: '',
  song: 'ff-song',
  kai: 'ff-kai',
  fangsong: 'ff-fangsong',
  hei: 'ff-hei',
  xingkai: 'ff-xingkai'
};

function _get() {
  try {
    const v = wx.getStorageSync(KEY);
    return v && typeof v === 'object' ? v : {};
  } catch (e) { return {}; }
}

function _set(v) {
  try { wx.setStorageSync(KEY, v); } catch (e) {}
}

function getSettings() {
  return { ...DEFAULTS, ..._get() };
}

function setSetting(key, value) {
  const s = getSettings();
  s[key] = value;
  _set(s);
  const app = getApp();
  if (app && app.globalData) app.globalData.settings = s;
  if (key === 'theme' && app && app.applyTheme) app.applyTheme();
}

function applySettings() {
  const app = getApp();
  if (!app) return;
  const s = getSettings();
  app.globalData.settings = s;
  if (app.applyTheme) app.applyTheme();
}

/** 当前正文字体对应的根节点工具类 */
function getFontFamilyClass() {
  const s = getSettings();
  return FONT_FAMILY_CLASS[s.fontFamily] || FONT_FAMILY_CLASS.default;
}

/**
 * 将主题/字号/正文字体一次性应用到页面（页面 onShow 调用一次即可）。
 * 需要页面根节点绑定 class="{{themeClass}} {{fontSizeClass}} {{fontFamilyClass}}"
 */
function applyToPage(page) {
  if (!page || typeof page.setData !== 'function') return;
  const s = getSettings();
  const themeClass = s.theme === 'dark' ? 'theme-dark' : s.theme === 'green' ? 'theme-green' : '';
  const fontSizeClass = s.fontSize === 'small' ? 'fs-small' : s.fontSize === 'large' ? 'fs-large' : 'fs-normal';
  const fontFamilyClass = getFontFamilyClass();
  page.setData({ themeClass, fontSizeClass, fontFamilyClass });
}

module.exports = {
  getSettings,
  setSetting,
  applySettings,
  getFontFamilyClass,
  applyToPage,
};
