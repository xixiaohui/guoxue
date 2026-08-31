/**
 * utils/landing.js - 分享落地页适配工具（朋友圈「单页模式」）
 *
 * 从朋友圈分享链接点进小程序时，微信并不会真正打开小程序，而是以「单页模式」渲染目标页面：
 *   - 场景值 scene = 1154
 *   - 页面无登录态（wx.login / 云开发需开启未登录访问）、本地存储与普通模式不共用
 *   - 不允许任何页面跳转（navigateTo / redirectTo / switchTab / reLaunch / navigateBack）
 *   - button open-type、剪贴板、保存到相册、广告、open-data、导航栏自定义等能力被禁用
 *   - 顶部导航栏固定，标题取页面 JSON 配置的 navigationBarTitleText，wx.setNavigationBarTitle 无效
 *
 * 因此落地页必须满足：仅凭 URL query + 网络请求即可渲染主要内容，且不依赖被禁用的能力。
 */

// 朋友圈单页模式场景值
const SCENE_SINGLE_PAGE = 1154;

let _isSinglePage = null;

/** 读取本次进入小程序的场景值（优先 getEnterOptionsSync，覆盖后台唤起场景） */
function getScene() {
  try {
    if (typeof wx.getEnterOptionsSync === 'function') {
      return (wx.getEnterOptionsSync() || {}).scene || 0;
    }
  } catch (_) {}
  try {
    if (typeof wx.getLaunchOptionsSync === 'function') {
      return (wx.getLaunchOptionsSync() || {}).scene || 0;
    }
  } catch (_) {}
  return 0;
}

/**
 * 当前是否处于朋友圈单页模式（结果缓存）
 * @returns {boolean}
 */
function isSinglePage() {
  if (_isSinglePage === null) {
    _isSinglePage = Number(getScene()) === SCENE_SINGLE_PAGE;
  }
  return _isSinglePage;
}

/**
 * 安全读取 URL 参数。
 * 小程序框架已对 query 做过一次 decodeURIComponent，重复解码遇到非法转义（如 %）会抛
 * URIError 并直接中断 onLoad 导致白屏；此处解码失败时回退原字符串。
 * @param {*} value
 * @returns {string}
 */
function safeDecode(value) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') return String(value);
  try {
    return decodeURIComponent(value);
  } catch (_) {
    return value;
  }
}

/**
 * 安全设置导航栏标题：单页模式下该接口无效，忽略失败以免中断页面逻辑
 * @param {string} title
 */
function setNavTitle(title) {
  const t = String(title || '').slice(0, 24);
  if (!t) return;
  try {
    wx.setNavigationBarTitle({ title: t });
  } catch (_) {}
}

module.exports = {
  SCENE_SINGLE_PAGE,
  getScene,
  isSinglePage,
  safeDecode,
  setNavTitle
};
