/**
 * utils/monetize.js - 前端变现逻辑核心模块 v4.0
 *
 * 三层变现闭环：
 *   1. 免费层   每日 10 次 AI 调用（云数据库 user_quota 集合计数）
 *   2. 广告层   超额后弹出激励视频，看完 +1 天无限
 *   3. 付费层   9.9 元/月会员，去广告 + 无限调用 + 语音朗读
 *
 * ★ 架构变更 v4.0：
 *   配额管理统一由 guoxueAI 云函数处理（type: checkAndConsume / getStatus / adBonus）
 *   不再调用独立的 userQuota 云函数
 *   consumeQuota / getQuotaStatus 委托给 utils/api.js 统一管理
 *
 * 激励广告位 ID：adunit-513a37c7d48cdf7f
 */

const api          = require('./api');
const REWARDED_AD_ID = 'adunit-513a37c7d48cdf7f';
const BANNER_AD_ID   = 'adunit-513a37c7d48cdf7f';
const QUOTA_FUNC     = 'guoxueAI';   // 配额云函数（兼容）
const PAYMENT_FUNC   = 'payment';

// ─── 激励广告实例（全局单例）──────────────────────────────────
let _rewardedAd = null;
let _adReady    = false;

// ─── 配额状态（委托 api.js）──────────────────────────────────
const getQuotaStatus = api.getQuotaStatus.bind(api);
const consumeQuota   = api.consumeQuota.bind(api);

/**
 * 预检配额（不消费，仅查询是否可用）
 */
async function checkCanUse() {
  try {
    const s = await getQuotaStatus();
    return s.canUse !== false;
  } catch (_) { return true; }
}

// ─── 激励视频广告 ──────────────────────────────────────────────
/**
 * 预加载激励视频广告（页面 onLoad 时调用，提升首次展示速度）
 */
function preloadRewardedAd() {
  if (_rewardedAd) return;
  if (!wx.createRewardedVideoAd) {
    console.warn('[monetize] wx.createRewardedVideoAd not supported');
    return;
  }
  try {
    _rewardedAd = wx.createRewardedVideoAd({ adUnitId: REWARDED_AD_ID });
    _rewardedAd.onLoad(() => { _adReady = true; });
    _rewardedAd.onError(e => {
      _adReady = false;
      console.warn('[monetize] ad error:', e.errMsg);
    });
    _rewardedAd.load().catch(() => {});
  } catch (e) {
    console.warn('[monetize] createRewardedVideoAd:', e);
  }
}

/**
 * 展示激励视频广告
 * resolve(true)  = 用户完整观看
 * resolve(false) = 关闭/失败
 */
function showRewardedAd() {
  return new Promise(resolve => {
    if (!wx.createRewardedVideoAd) {
      wx.showModal({
        title: '提示', content: '当前版本不支持激励广告，请升级微信版本',
        showCancel: false, confirmText: '知道了',
        success: () => resolve(false)
      });
      return;
    }

    if (!_rewardedAd) {
      _rewardedAd = wx.createRewardedVideoAd({ adUnitId: REWARDED_AD_ID });
    }

    const onClose = res => {
      _adReady = false;
      _rewardedAd.load().then(() => { _adReady = true; }).catch(() => {});
      resolve(!!(res && res.isEnded));
    };
    _rewardedAd.offClose();
    _rewardedAd.onClose(onClose);

    const doShow = () => {
      _rewardedAd.show().catch(e => {
        console.error('[monetize] ad show error:', e);
        wx.showToast({ title: '广告加载中，请稍后再试', icon: 'none', duration: 2000 });
        resolve(false);
      });
    };

    if (_adReady) {
      doShow();
    } else {
      wx.showLoading({ title: '加载广告…', mask: true });
      _rewardedAd.load()
        .then(() => { wx.hideLoading(); _adReady = true; doShow(); })
        .catch(() => { wx.hideLoading(); wx.showToast({ title: '广告暂时不可用', icon: 'none' }); resolve(false); });
    }
  });
}

/**
 * 授予激励广告奖励（+1 天无限）- 直接调用 guoxueAI 云函数
 */
async function grantAdBonus() {
  try { wx.removeStorageSync('_quota_cache'); } catch (_) {}
  const res = await wx.cloud.callFunction({
    name: QUOTA_FUNC,
    data: { type: 'adBonus' }
  });
  const d = res.result;
  if (d && d.success) return d;
  throw new Error((d && d.error) || '奖励发放失败');
}

// ─── 配额超额完整处理流程 ─────────────────────────────────────
/**
 * 处理配额超限弹窗：
 *   选"看广告" → 播放激励广告 → 成功则授予奖励 → resolve(true)
 *   选"成为会员" → 跳转 VIP 页 → resolve(false)
 * @param {{ onContinue?: ()=>void, onCancel?: ()=>void }} options
 * @returns {Promise<boolean>} true=已解锁可继续
 */
async function handleQuotaExceeded(options = {}) {
  const { onContinue, onCancel } = options;

  return new Promise(resolve => {
    wx.showModal({
      title: '✨ 今日免费次数已用完',
      content: '每天免费使用10次\n\n观看短视频广告（约15秒）获得今日无限使用\n或升级会员享永久无限 + 专属功能',
      confirmText:  '看广告继续',
      cancelText:   '升级会员',
      confirmColor: '#8B2500',
      success: async res => {
        if (res.confirm) {
          const watched = await showRewardedAd();
          if (watched) {
            try {
              const bonus = await grantAdBonus();
              wx.showToast({
                title: `🎉 今日无限解锁！有效至 ${bonus.expireText || '明日'}`,
                icon: 'none', duration: 3000
              });
              resolve(true);
              onContinue && onContinue();
            } catch (e) {
              wx.showToast({ title: '奖励发放失败，请重试', icon: 'none' });
              resolve(false);
            }
          } else {
            wx.showToast({ title: '需要完整观看广告才能解锁', icon: 'none', duration: 2000 });
            resolve(false);
            onCancel && onCancel();
          }
        } else {
          wx.navigateTo({ url: '/pages/vip/index' });
          resolve(false);
          onCancel && onCancel();
        }
      }
    });
  });
}

// ─── 会员购买 ──────────────────────────────────────────────────
async function getProducts() {
  try {
    const res = await wx.cloud.callFunction({ name: PAYMENT_FUNC, data: { type: 'getProducts' } });
    return (res.result && res.result.products) ? res.result.products : {};
  } catch (_) { return {}; }
}

async function purchaseVip(productId = 'vip_1month') {
  return new Promise((resolve, reject) => {
    wx.showLoading({ title: '正在生成订单…', mask: true });
    wx.cloud.callFunction({ name: PAYMENT_FUNC, data: { type: 'createOrder', product: productId } })
      .then(async res => {
        wx.hideLoading();
        const d = res.result;
        if (!d || !d.success) { reject(new Error((d && d.error) || '创建订单失败')); return; }

        if (d.demo) {
          wx.showModal({
            title: '提示',
            content: '支付功能需在微信商户平台配置后才能使用。\n当前为演示模式。',
            showCancel: false, confirmText: '好的'
          });
          reject(new Error('演示模式'));
          return;
        }
        if (!d.payment) { reject(new Error('支付参数获取失败')); return; }

        wx.requestPayment({
          ...d.payment,
          success: async () => {
            try {
              await _pollOrderStatus(d.tradeNo);
              try { wx.removeStorageSync('_quota_cache'); } catch (_) {}
              wx.showToast({ title: '🎉 会员开通成功！', icon: 'success', duration: 3000 });
              resolve({ success: true, tradeNo: d.tradeNo, months: d.months });
            } catch (_) {
              wx.showToast({ title: '支付成功，会员将在1分钟内生效', icon: 'none', duration: 3000 });
              resolve({ success: true, pending: true, tradeNo: d.tradeNo });
            }
          },
          fail: e => {
            if (e.errMsg && e.errMsg.includes('cancel')) resolve({ success: false, cancelled: true });
            else reject(new Error(e.errMsg || '支付失败'));
          }
        });
      })
      .catch(e => { wx.hideLoading(); reject(e); });
  });
}

async function _pollOrderStatus(tradeNo, maxRetries = 8) {
  for (let i = 0; i < maxRetries; i++) {
    await new Promise(r => setTimeout(r, 1500));
    const res = await wx.cloud.callFunction({ name: PAYMENT_FUNC, data: { type: 'queryOrder', tradeNo } });
    if (res.result && res.result.paid) return res.result;
  }
  throw new Error('订单查询超时');
}

// ─── 配额徽章文案 ─────────────────────────────────────────────
function getQuotaBadgeText(q) {
  if (!q) return '';
  if (q.isVip)      return '👑 会员';
  if (q.hasAdBonus) return '🎁 今日无限';
  const r = q.remaining;
  if (r === undefined || r === null) return '';
  if (r <= 0) return '❗ 次数已用完';
  return `剩余 ${r} 次`;
}

async function isVip() {
  try { return !!(await getQuotaStatus()).isVip; }
  catch (_) { return false; }
}

// ─── Banner 广告 ─────────────────────────────────────────────
function createBannerAd(adId = BANNER_AD_ID, bottom = 0) {
  if (!wx.createBannerAd) return null;
  try {
    const sys = wx.getSystemInfoSync();
    const ad  = wx.createBannerAd({
      adUnitId: adId,
      style: { left: 0, top: sys.windowHeight - (bottom || 0) - 60, width: sys.windowWidth, height: 60 }
    });
    ad.onError(e => console.warn('[banner]', e.errMsg));
    ad.onLoad(() => ad.show().catch(() => {}));
    return ad;
  } catch (e) { console.warn('[monetize] createBannerAd:', e); return null; }
}

module.exports = {
  // 配额
  getQuotaStatus,
  consumeQuota,
  checkCanUse,
  handleQuotaExceeded,
  getQuotaBadgeText,
  isVip,
  // 广告
  preloadRewardedAd,
  showRewardedAd,
  grantAdBonus,
  createBannerAd,
  // 会员
  getProducts,
  purchaseVip,
  // 常量
  REWARDED_AD_ID,
  BANNER_AD_ID,
};
