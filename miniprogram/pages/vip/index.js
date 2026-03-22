// pages/vip/index.js - 会员中心页
const monetize = require('../../utils/monetize');

Page({
  data: {
    quotaStatus: null,
    loading: true,
    products: [],
    purchasing: false,
    selectedProduct: 'vip_1month',
    benefits: [
      { icon: '♾️', title: '无限AI对话', desc: '不限次数，随时问答' },
      { icon: '🚫', title: '去除广告', desc: '纯净体验，无干扰' },
      { icon: '🔊', title: '专属语音朗读', desc: '聆听国学之美' },
      { icon: '⚡', title: '优先响应', desc: '更快的AI回复速度' },
      { icon: '📚', title: '收藏无上限', desc: '保存所有喜爱内容' },
      { icon: '💎', title: '专属会员标识', desc: '彰显您的品味' }
    ],
    productList: [
      { id: 'vip_1month', name: '月度会员', price: '9.9', unit: '元/月', desc: '按月订阅', tag: '' },
      { id: 'vip_3month', name: '季度会员', price: '24.9', unit: '元/季', desc: '8.3元/月', tag: '优惠' },
      { id: 'vip_12month', name: '年度会员', price: '79', unit: '元/年', desc: '6.6元/月', tag: '最划算' }
    ]
  },

  onLoad() {
    this._loadStatus();
    monetize.preloadRewardedAd();
  },

  onShow() {
    this._loadStatus();
  },

  async _loadStatus() {
    this.setData({ loading: true });
    try {
      const status = await monetize.getQuotaStatus(true);
      this.setData({ quotaStatus: status, loading: false });
    } catch (e) {
      this.setData({ loading: false });
    }
  },

  selectProduct(e) {
    const id = e.currentTarget.dataset.id;
    this.setData({ selectedProduct: id });
  },

  async purchaseVip() {
    const { selectedProduct, purchasing } = this.data;
    if (purchasing) return;
    this.setData({ purchasing: true });
    try {
      const result = await monetize.purchaseVip(selectedProduct);
      if (result.success) {
        await this._loadStatus();
        if (!result.cancelled) {
          wx.showModal({
            title: '🎉 开通成功',
            content: '会员权益已立即生效！享受无限AI国学问答吧~',
            showCancel: false,
            confirmText: '开始体验',
            success: () => {
              wx.switchTab({ url: '/pages/chat/index' });
            }
          });
        }
      }
    } catch (e) {
      wx.showToast({ title: e.message || '购买失败，请重试', icon: 'none', duration: 2500 });
    } finally {
      this.setData({ purchasing: false });
    }
  },

  async watchAd() {
    try {
      const watched = await monetize.showRewardedAd();
      if (watched) {
        const bonus = await monetize.grantAdBonus();
        await this._loadStatus();
        wx.showModal({
          title: '🎁 解锁成功',
          content: `今日无限次调用已解锁！\n有效期至 ${bonus.expireText || '明日'}`,
          showCancel: false,
          confirmText: '去体验',
          success: () => wx.switchTab({ url: '/pages/chat/index' })
        });
      } else {
        wx.showToast({ title: '需要完整观看广告', icon: 'none' });
      }
    } catch (e) {
      wx.showToast({ title: '广告加载失败，请稍后再试', icon: 'none' });
    }
  },

  goBack() {
    wx.navigateBack({ delta: 1 });
  }
});
