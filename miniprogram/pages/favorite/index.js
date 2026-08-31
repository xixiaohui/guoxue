const storage = require('../../utils/storage');
const user = require('../../utils/user');
const poemCache = require('../../utils/poemCache');
const settings = require('../../utils/settings');
const landing = require('../../utils/landing');

Page({
  data: {
    poems: [],
    loading: true,
    isLogin: false,
    isSinglePage: false, // 朋友圈单页模式：本地存储隔离、禁止跳转
  },

  async onShow() {
    settings.applyToPage(this);
    this.setData({ isSinglePage: landing.isSinglePage() });
    this.setData({ isLogin: user.isLogin() });
    await this._loadFavorites();
  },

  /** 单页模式下交互类能力被禁用，统一给出引导提示 */
  _tipUnavailable() {
    wx.showToast({ title: '请打开小程序体验此功能', icon: 'none' });
  },

  async _loadFavorites() {
    this.setData({ loading: true });
    let list = storage.getFavoritePoems();
    if (this.data.isLogin) {
      try {
        const cloudList = await user.pullFavoritesFromCloud(user.getOpenid());
        if (cloudList && cloudList.length) list = cloudList;
      } catch (e) { console.warn('[Favorite] pull cloud failed:', e); }
    }
    this.setData({ poems: list, loading: false });
  },

  goDetail(e) {
    if (this.data.isSinglePage) { this._tipUnavailable(); return; }
    const poem = e.currentTarget.dataset.poem;
    if (!poem) return;
    // 缓存完整正文，避免详情页因 URL 长度限制展示截断内容
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

  toggleFavorite(e) {
    if (this.data.isSinglePage) { this._tipUnavailable(); return; }
    const poem = e.currentTarget.dataset.poem;
    if (!poem) return;
    const isFav = storage.toggleFavoritePoem(poem);
    if (!isFav) {
      const key = storage.getPoemKey(poem);
      this.setData({ poems: this.data.poems.filter(p => storage.getPoemKey(p) !== key) });
    }
    wx.showToast({ title: isFav ? '已收藏' : '已取消收藏', icon: 'success', duration: 1200 });
    // 已登录用户即时同步云端
    if (this.data.isLogin) {
      user.syncFavoritesToCloud(user.getOpenid());
    }
  },

  goPoetry() {
    if (this.data.isSinglePage) { this._tipUnavailable(); return; }
    wx.switchTab({ url: '/pages/chinesepoetry/index' });
  },

  clearAll() {
    if (this.data.isSinglePage) { this._tipUnavailable(); return; }
    if (!this.data.poems.length) {
      wx.showToast({ title: '暂无收藏', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '清空收藏',
      content: '确定清空全部收藏？此操作不可恢复',
      confirmColor: '#8B2500',
      success: (res) => {
        if (res.confirm) {
          try {
            wx.setStorageSync('fav_poems', []);
            this.setData({ poems: [] });
            wx.showToast({ title: '已清空', icon: 'success' });
            // 已登录用户即时同步云端（清空云端收藏）
            if (this.data.isLogin) {
              user.syncFavoritesToCloud(user.getOpenid());
            }
      } catch (e) {
        wx.showToast({ title: '操作失败', icon: 'none' });
      }
    }
  },

  // ── 分享（与收藏的第一首诗词对应）─────────
  /** 分享标题：我收藏的诗词《X》—— 作者 */
  _poemShareTitle(p) {
    return '我收藏的诗词《' + (p.title || '无题') + '》—— ' + (p.author || '中华诗词');
  },

  /** 分享落地路径（携带完整 seed，确保朋友圈单页模式可渲染正文） */
  _poemSharePath(p, from) {
    const qs = [
      'kind=poem',
      'id=' + encodeURIComponent(p.id || ''),
      'title=' + encodeURIComponent(p.title || ''),
      'author=' + encodeURIComponent(p.author || ''),
      'dynasty=' + encodeURIComponent(p.dynasty || ''),
      'type=' + encodeURIComponent(p.type || ''),
      'content=' + encodeURIComponent((p.content || p.preview || '').slice(0, 300))
    ];
    if (from) qs.push('from=' + from);
    return '/pages/chinesepoetry_detail/index?' + qs.join('&');
  },

  onShareAppMessage() {
    const p = (this.data.poems || [])[0];
    if (!p) {
      return {
        title: '我的收藏 · 国文之学',
        path: '/pages/favorite/index'
      };
    }
    return {
      title: this._poemShareTitle(p),
      path: this._poemSharePath(p)
    };
  },

  onShareTimeline() {
    const p = (this.data.poems || [])[0];
    if (!p) {
      return {
        title: '我的收藏 · 国文之学',
        query: 'from=timeline'
      };
    }
    const path = this._poemSharePath(p, 'timeline');
    const qIndex = path.indexOf('?');
    return {
      title: this._poemShareTitle(p),
      query: qIndex >= 0 ? path.slice(qIndex + 1) : 'from=timeline'
    };
  }
});
  }
});
