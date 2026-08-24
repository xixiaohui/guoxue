// pages/my_read_history/index.js - 我的阅读历史
// 数据源：详情页 _recordView 写入的本地 storage 'viewed_poems'
const poemCache = require('../../utils/poemCache');
const settings = require('../../utils/settings');

Page({
  data: {
    poems: [],
    loading: true,
    fontFamilyClass: ''
  },

  onShow() {
    settings.applyToPage(this);
    this._loadHistory();
  },

  _loadHistory() {
    let list = [];
    try {
      list = wx.getStorageSync('viewed_poems') || [];
    } catch (_) {}
    list.forEach((p) => { p.timeText = this._formatTime(p.time); });
    this.setData({ poems: list, loading: false });
  },

  /** 阅读时间：今天/昨天显示具体时分，更早显示月日，跨年补年份 */
  _formatTime(t) {
    if (!t) return '';
    const d = new Date(t);
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const dayMs = 86400000;
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const hm = pad(d.getHours()) + ':' + pad(d.getMinutes());
    if (t >= startOfToday) return '今天 ' + hm;
    if (t >= startOfToday - dayMs) return '昨天 ' + hm;
    if (d.getFullYear() === now.getFullYear()) {
      return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + hm;
    }
    return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日';
  },

  goDetail(e) {
    const poem = e.currentTarget.dataset.poem;
    if (!poem) return;
    // 缓存完整数据，避免详情页因 URL 长度限制展示截断内容
    poemCache.cachePoem(poem);
    const qs = [
      'kind=poem',
      'id=' + encodeURIComponent(poem.id || ''),
      'title=' + encodeURIComponent(poem.title || ''),
      'author=' + encodeURIComponent(poem.author || ''),
      'dynasty=' + encodeURIComponent(poem.dynasty || ''),
      'type=' + encodeURIComponent(poem.type || ''),
      'content=' + encodeURIComponent(poem.content || '')
    ];
    wx.navigateTo({ url: '/pages/chinesepoetry_detail/index?' + qs.join('&') });
  },

  clearAll() {
    if (!this.data.poems.length) {
      wx.showToast({ title: '暂无阅读记录', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '清空阅读历史',
      content: '确定清空全部阅读历史？此操作不可恢复',
      confirmColor: '#8B2500',
      success: (res) => {
        if (res.confirm) {
          try {
            wx.setStorageSync('viewed_poems', []);
            this.setData({ poems: [] });
            wx.showToast({ title: '已清空', icon: 'success' });
          } catch (e) {
            wx.showToast({ title: '操作失败', icon: 'none' });
          }
        }
      }
    });
  },

  goPoetry() {
    wx.switchTab({ url: '/pages/chinesepoetry/index' });
  },

  // ── 分享 ──────────────────────────────
  onShareAppMessage() {
    return {
      title: '我的阅读历史 · 国文之学',
      path: '/pages/my_read_history/index'
    };
  },

  onShareTimeline() {
    return {
      title: '我的阅读历史 · 国文之学',
      query: 'from=timeline'
    };
  }
});
