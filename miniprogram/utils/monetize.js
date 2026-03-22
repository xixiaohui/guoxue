/**
 * utils/monetize.js - 前端变现逻辑核心模块
 *
 * 封装三层变现闭环：
 *   1. 免费层   每日 5 次 AI 调用（云数据库计数）
 *   2. 广告层   超额后弹出激励视频，看完 +1 天无限
 *   3. 付费层   9.9 元/月会员，去广告 + 无限调用 + 语音朗读
 *
 * 激励广告位 ID：adunit-513a37c7d48cdf7f
 */

const REWARDED_AD_ID = 'adunit-513a37c7d48cdf7f';
const QUOTA_FUNC     = 'userQuota';
const PAYMENT_FUNC   = 'payment';

// ─── 本地缓存键（减少云函数调用次数） ──────────────────────────
const CACHE_KEY  = 'quota_cache';
const CACHE_TTL  = 60 * 1000; // 1 分钟

// ─── 激励广告实例（全局单例）──────────────────────────
let _rewardedAd  = null;
let _adReady     = false;

// ─── 获取配额状态（带本地缓存）──────────────────────────
async function getQuotaStatus(forceRefresh = false) {
  if (!forceRefresh) {
    try {
      const cache = wx.getStorageSync(CACHE_KEY);
      if (cache && cache.ts && (Date.now() - cache.ts) < CACHE_TTL) {
        return cache.data;
      }
    } catch (e) {}
  }

  return new Promise((resolve, reject) => {
    wx.cloud.callFunction({
      name: QUOTA_FUNC,
      data: { type: 'getStatus' }
    }).then(res => {
      const data = res.result;
      if (data && data.success) {
        // 写入本地缓存
        try {
          wx.setStorageSync(CACHE_KEY, { ts: Date.now(), data });
        } catch (e) {}
        resolve(data);
      } else {
        reject(new Error(data && data.error || '获取配额失败'));
      }
    }).catch(err => {
      reject(err);
    });
  });
}

/**
 * 消费一次配额（AI 调用前调用）
 * 返回：{ allowed: bool, reason: string, quotaData: {...} }
 *   reason: 'free' | 'vip' | 'ad_bonus' | 'quota_exceeded'
 */
async function consumeQuota() {
  return new Promise((resolve, reject) => {
    wx.cloud.callFunction({
      name: QUOTA_FUNC,
      data: { type: 'consume' }
    }).then(res => {
      const data = res.result;
      // 使缓存失效
      try { wx.removeStorageSync(CACHE_KEY); } catch (e) {}

      if (!data || !data.success) {
        reject(new Error(data && data.error || '配额服务异常'));
        return;
      }

      if (data.quota_exceeded) {
        resolve({ allowed: false, reason: 'quota_exceeded', quotaData: data });
      } else {
        resolve({
          allowed: true,
          reason: data.isUnlimited ? (data.isVip ? 'vip' : 'ad_bonus') : 'free',
          quotaData: data
        });
      }
    }).catch(err => {
      // 网络异常时降级允许（本地模式）
      console.warn('[monetize] consumeQuota failed, fallback allow:', err);
      resolve({ allowed: true, reason: 'fallback', quotaData: {} });
    });
  });
}

/**
 * 预检配额（不消费，仅查询是否可用）
 * 用于按钮禁用判断等非消费场景
 */
async function checkCanUse() {
  try {
    const status = await getQuotaStatus();
    return status.canUse !== false;
  } catch (e) {
    return true; // 降级
  }
}

// ─── 激励视频广告 ──────────────────────────────────────────────
/**
 * 预加载激励视频广告（页面 onLoad 时调用，非必须但提升体验）
 */
function preloadRewardedAd() {
  if (_rewardedAd) return;
  if (!wx.createRewardedVideoAd) {
    console.warn('[monetize] wx.createRewardedVideoAd not supported');
    return;
  }
  try {
    _rewardedAd = wx.createRewardedVideoAd({ adUnitId: REWARDED_AD_ID });
    _rewardedAd.onLoad(() => {
      _adReady = true;
      console.log('[monetize] rewarded ad loaded');
    });
    _rewardedAd.onError(err => {
      _adReady = false;
      console.warn('[monetize] rewarded ad error:', err.errMsg);
    });
    _rewardedAd.onClose(res => {
      // 回调通过 showRewardedAd 内部处理
    });
    // 预加载
    _rewardedAd.load().catch(e => console.warn('[monetize] ad load:', e));
  } catch (e) {
    console.warn('[monetize] createRewardedVideoAd error:', e);
  }
}

/**
 * 展示激励视频广告
 * 返回 Promise：resolve(true) 表示用户看完，resolve(false) 表示关闭/失败
 */
function showRewardedAd() {
  return new Promise((resolve) => {
    if (!_rewardedAd) {
      if (!wx.createRewardedVideoAd) {
        _showAdUnsupported(resolve);
        return;
      }
      _rewardedAd = wx.createRewardedVideoAd({ adUnitId: REWARDED_AD_ID });
    }

    // 注册关闭回调
    const onClose = (res) => {
      _adReady = false;
      // 重新加载以备下次使用
      _rewardedAd.load().then(() => { _adReady = true; }).catch(() => {});
      if (res && res.isEnded) {
        resolve(true);  // 完整观看
      } else {
        resolve(false); // 提前关闭
      }
    };
    _rewardedAd.offClose();
    _rewardedAd.onClose(onClose);

    const doShow = () => {
      _rewardedAd.show().then(() => {
        // 广告正在展示中，等待 onClose 回调
      }).catch(err => {
        console.error('[monetize] ad show error:', err);
        wx.showToast({ title: '广告加载中，请稍后再试', icon: 'none', duration: 2000 });
        resolve(false);
      });
    };

    if (_adReady) {
      doShow();
    } else {
      wx.showLoading({ title: '加载广告中…', mask: true });
      _rewardedAd.load().then(() => {
        wx.hideLoading();
        _adReady = true;
        doShow();
      }).catch(e => {
        wx.hideLoading();
        console.error('[monetize] ad load error:', e);
        wx.showToast({ title: '广告暂时不可用', icon: 'none', duration: 2000 });
        resolve(false);
      });
    }
  });
}

// 降级：广告不支持时展示提示
function _showAdUnsupported(resolve) {
  wx.showModal({
    title: '提示',
    content: '当前版本不支持激励广告，建议升级微信版本',
    showCancel: false,
    confirmText: '知道了',
    success: () => resolve(false)
  });
}

/**
 * 授予激励广告奖励（+1 天无限）
 */
async function grantAdBonus() {
  return new Promise((resolve, reject) => {
    wx.cloud.callFunction({
      name: QUOTA_FUNC,
      data: { type: 'adBonus' }
    }).then(res => {
      try { wx.removeStorageSync(CACHE_KEY); } catch (e) {}
      const data = res.result;
      if (data && data.success) {
        resolve(data);
      } else {
        reject(new Error(data && data.error || '奖励发放失败'));
      }
    }).catch(err => {
      reject(err);
    });
  });
}

// ─── 配额超额时完整处理流程 ──────────────────────────────────────────────
/**
 * 处理配额超限
 * 1. 弹出配额超限弹窗（含广告和付费选项）
 * 2. 用户选择"看广告" → 播放激励广告 → 成功则授予奖励
 * 3. 用户选择"成为会员" → 跳转付费页
 * 4. 返回 Promise：resolve(true) 表示已获得权限可继续
 */
async function handleQuotaExceeded(options = {}) {
  const { onContinue, onCancel } = options;

  return new Promise((resolve) => {
    wx.showModal({
      title: '✨ 今日免费次数已用完',
      content: '每天免费使用5次\n\n观看短视频广告（约15秒）获得今日无限使用\n或升级会员享永久无限 + 专属功能',
      confirmText: '看广告继续',
      cancelText: '升级会员',
      confirmColor: '#8B2500',
      success: async (res) => {
        if (res.confirm) {
          // 用户选择看广告
          const watched = await showRewardedAd();
          if (watched) {
            // 看完了，发放奖励
            try {
              const bonus = await grantAdBonus();
              wx.showToast({
                title: `🎉 今日无限解锁！有效至 ${bonus.expireText || '明日'}`,
                icon: 'none',
                duration: 3000
              });
              resolve(true);
              onContinue && onContinue();
            } catch (e) {
              wx.showToast({ title: '奖励发放失败，请重试', icon: 'none' });
              resolve(false);
            }
          } else {
            // 没看完
            wx.showToast({ title: '需要完整观看广告才能解锁', icon: 'none', duration: 2000 });
            resolve(false);
            onCancel && onCancel();
          }
        } else if (res.cancel) {
          // 用户选择升级会员
          wx.navigateTo({ url: '/pages/vip/index' });
          resolve(false);
          onCancel && onCancel();
        }
      }
    });
  });
}

// ─── 会员购买 ──────────────────────────────────────────────
/**
 * 获取商品列表
 */
async function getProducts() {
  return new Promise((resolve, reject) => {
    wx.cloud.callFunction({
      name: PAYMENT_FUNC,
      data: { type: 'getProducts' }
    }).then(res => {
      const data = res.result;
      resolve(data && data.products ? data.products : {});
    }).catch(err => {
      reject(err);
    });
  });
}

/**
 * 发起购买订单
 * @param {string} productId 商品ID：vip_1month | vip_3month | vip_12month
 */
async function purchaseVip(productId = 'vip_1month') {
  return new Promise((resolve, reject) => {
    wx.showLoading({ title: '正在生成订单…', mask: true });
    wx.cloud.callFunction({
      name: PAYMENT_FUNC,
      data: { type: 'createOrder', product: productId }
    }).then(async (res) => {
      wx.hideLoading();
      const data = res.result;
      if (!data || !data.success) {
        reject(new Error(data && data.error || '创建订单失败'));
        return;
      }

      if (data.demo) {
        // 演示模式（未配置商户号）
        wx.showModal({
          title: '提示',
          content: '支付功能需在微信商户平台配置后才能使用。\n\n当前为演示模式，会员功能敬请期待。',
          showCancel: false,
          confirmText: '好的'
        });
        reject(new Error('演示模式'));
        return;
      }

      if (!data.payment) {
        reject(new Error('支付参数获取失败'));
        return;
      }

      // 调起微信支付
      wx.requestPayment({
        ...data.payment,
        success: async () => {
          // 轮询订单状态确认支付成功
          try {
            await _pollOrderStatus(data.tradeNo, 8);
            try { wx.removeStorageSync(CACHE_KEY); } catch (e) {}
            wx.showToast({ title: '🎉 会员开通成功！', icon: 'success', duration: 3000 });
            resolve({ success: true, tradeNo: data.tradeNo, months: data.months });
          } catch (e) {
            // 轮询超时但支付成功，提示稍后生效
            wx.showToast({ title: '支付成功，会员将在1分钟内生效', icon: 'none', duration: 3000 });
            resolve({ success: true, pending: true, tradeNo: data.tradeNo });
          }
        },
        fail: (err) => {
          if (err.errMsg && err.errMsg.includes('cancel')) {
            resolve({ success: false, cancelled: true });
          } else {
            reject(new Error(err.errMsg || '支付失败'));
          }
        }
      });
    }).catch(err => {
      wx.hideLoading();
      reject(err);
    });
  });
}

// 轮询订单状态（最多 maxRetries 次，每次间隔 1.5s）
async function _pollOrderStatus(tradeNo, maxRetries = 8) {
  for (let i = 0; i < maxRetries; i++) {
    await _sleep(1500);
    const res = await wx.cloud.callFunction({
      name: PAYMENT_FUNC,
      data: { type: 'queryOrder', tradeNo }
    });
    if (res.result && res.result.paid) return res.result;
  }
  throw new Error('订单查询超时');
}

function _sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── 展示配额悬浮提示条 ──────────────────────────────────────────────
/**
 * 根据配额状态生成提示文案
 */
function getQuotaBadgeText(quotaStatus) {
  if (!quotaStatus) return '';
  if (quotaStatus.isVip) return '👑 会员';
  if (quotaStatus.hasAdBonus) return '🎁 今日无限';
  const r = quotaStatus.remaining;
  if (r === undefined || r === null) return '';
  if (r <= 0) return '❗ 次数已用完';
  return `剩余 ${r} 次`;
}

/**
 * 检测是否为 VIP（本地缓存优先）
 */
async function isVip() {
  try {
    const status = await getQuotaStatus();
    return !!(status && status.isVip);
  } catch (e) {
    return false;
  }
}

// ─── Banner/原生广告辅助 ──────────────────────────────────────────────
const BANNER_AD_ID  = 'adunit-513a37c7d48cdf7f'; // 使用同一广告单元（实际应申请 Banner 广告位）

/**
 * 创建并显示 Banner 广告
 * @param {string} adId  广告单元 ID（可自定义）
 * @param {number} bottom 距底部距离（rpx 转 px）
 */
function createBannerAd(adId = BANNER_AD_ID, bottom = 0) {
  if (!wx.createBannerAd) return null;
  try {
    const sysInfo = wx.getSystemInfoSync();
    const rpxRatio = sysInfo.windowWidth / 750;
    const bannerAd = wx.createBannerAd({
      adUnitId: adId,
      style: {
        left: 0,
        top: sysInfo.windowHeight - (bottom || 0) - 60,
        width: sysInfo.windowWidth,
        height: 60
      }
    });
    bannerAd.onError(err => console.warn('[banner]', err.errMsg));
    bannerAd.onLoad(() => bannerAd.show().catch(() => {}));
    return bannerAd;
  } catch (e) {
    console.warn('[monetize] createBannerAd error:', e);
    return null;
  }
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
  BANNER_AD_ID
};
