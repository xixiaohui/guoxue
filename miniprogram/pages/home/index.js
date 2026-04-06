const api = require('../../utils/api');
const { FALLBACK_DAILY_LIST, TAB_PAGES, STORAGE_KEYS } = require('../../utils/constants');
// const monetize = require('../../utils/monetize');
const shareUtil = require('../../utils/share');

// 从 fallback 中取下一条，尽量避免短时间重复
function _getNextFallback(currentQuote) {
  const list = FALLBACK_DAILY_LIST || [];
  const total = list.length;

  if (total === 0) return {
    quote: '知之者不如好之者，好之者不如乐之者。',
    author: '《论语》',
    translation: '懂得它的人，不如喜爱它的人；喜爱它的人，不如以它为乐的人。',
    analysis: '',
    insight: '真正的成长，来自发自内心的热爱。'
  };

  if (total === 1) return list[0];

  let shownIdxs = [];
  try {
    shownIdxs = wx.getStorageSync(STORAGE_KEYS.DAILY_HISTORY) || [];
  } catch (_) {}

  const windowSize = Math.max(1, Math.floor(total / 2));
  const recentIdxs = new Set(shownIdxs.slice(-windowSize));

  const currentIdx = list.findIndex(item => item.quote === currentQuote);
  if (currentIdx >= 0) recentIdxs.add(currentIdx);

  const candidates = [];
  for (let i = 0; i < total; i++) {
    if (!recentIdxs.has(i)) candidates.push(i);
  }

  const pool = candidates.length > 0
    ? candidates
    : list.map((_, i) => i).filter(i => i !== currentIdx);

  const chosenIdx = pool[Math.floor(Math.random() * pool.length)];

  shownIdxs.push(chosenIdx);
  if (shownIdxs.length > total) shownIdxs = shownIdxs.slice(-total);

  try {
    wx.setStorageSync(STORAGE_KEYS.DAILY_HISTORY, shownIdxs);
  } catch (_) {}

  return list[chosenIdx];
}

Page({
  data: {
    dailyLoading: true,
    daily: {
      quote: '',
      author: '',
      translation: '',
      analysis: '',
      insight: ''
    },
    refreshing: false,

    hotTopics: [
      { text: '李白 · 将进酒赏析', page: 'classics' },
      { text: '道德经核心思想', page: 'philosophers' },
      { text: '一鸣惊人的典故', page: 'idiom' },
      { text: '贞观之治始末', page: 'history' },
      { text: '论语十大名句', page: 'classics' },
      { text: '苏轼的人生智慧', page: 'classics' },
      { text: '孙子兵法精髓', page: 'philosophers' },
    ],

    funcs: [
      { id: 'classics',     name: '诗词典籍',  desc: '经典赏析鉴读', char: '詩', bg: 'linear-gradient(135deg,#9B6FD5,#6A3DA8)', page: '/pages/classics/index',     isTab: true  },
      { id: 'idiom',        name: '成语故事',  desc: '典故溯源解析', char: '成', bg: 'linear-gradient(135deg,#F0B840,#C48A10)', page: '/pages/idiom/index',         isTab: false },
      { id: 'history',      name: '历史探秘',  desc: '朝代人物探究', char: '史', bg: 'linear-gradient(135deg,#5BC8F5,#1A7ED5)', page: '/pages/history/index',      isTab: true  },
      { id: 'philosophers', name: '诸子百家',  desc: '百家争鸣精华', char: '道', bg: 'linear-gradient(135deg,#FF8FA3,#C03060)', page: '/pages/philosophers/index',  isTab: true  }
    ],

    categories: [
      { id: 1, name: '诗词歌赋', desc: '唐诗宋词，韵律之美', icon: '📜', bg: 'linear-gradient(135deg,#FF9A5C,#E05820)', page: '/pages/classics/index', isTab: true },
      { id: 2, name: '经史子集', desc: '四部典籍，学问源流', icon: '📚', bg: 'linear-gradient(135deg,#52C878,#1A8040)', page: '/pages/classics/index', isTab: true },
      { id: 3, name: '成语典故', desc: '字里乾坤，故事传承', icon: '🏮', bg: 'linear-gradient(135deg,#F7C948,#C48A10)', page: '/pages/idiom/index', isTab: false },
      { id: 4, name: '历史文化', desc: '朝代更迭，人文风华', icon: '🏯', bg: 'linear-gradient(135deg,#9B8FD5,#5A3DA8)', page: '/pages/history/index', isTab: true }
    ],

    showPoster: false,
    posterLoading: false,
    posterPath: '',

    showAd: false,
    adUnitId: 'adunit-67efd80bac46e2ad'
  },

  onLoad() {
    this._posterToken = 0;
    this._posterTimer = null;
    this._lastLoadedDay = this._todayKey();

    this.setData({
      showAd: this._canShowAd()
    });

    this._loadDaily();

    // if (monetize && typeof monetize.preloadRewardedAd === 'function') {
    //   monetize.preloadRewardedAd();
    // }
  },

  onShow() {
    const today = this._todayKey();
    if (this._lastLoadedDay && this._lastLoadedDay !== today) {
      this._loadDaily(true);
    }
  },

  onHide() {
    this._clearPosterTask();
  },

  onUnload() {
    this._clearPosterTask();
  },

  noop() {},

  _canShowAd() {
    try {
      const info = wx.getSystemInfoSync();
      return info.platform !== 'devtools';
    } catch (_) {
      return true;
    }
  },

  _clearPosterTask() {
    this._posterToken = 0;
    if (this._posterTimer) {
      clearTimeout(this._posterTimer);
      this._posterTimer = null;
    }
  },

  onPullDownRefresh() {
    this._loadDaily(true).finally(() => {
      wx.stopPullDownRefresh();
    });
  },

  async _loadDaily(forceRefresh = false) {
    this.setData({ dailyLoading: true });
    this._lastLoadedDay = this._todayKey();

    if (!forceRefresh) {
      const todayKey = 'daily_' + this._todayKey();
      try {
        const cached = wx.getStorageSync(todayKey);
        if (cached && cached.quote) {
          this.setData({ daily: cached, dailyLoading: false });
          return;
        }
      } catch (_) {}
    }

    try {
      const res = await api.getDailyClassic(forceRefresh);
      const d = res && res.daily;

      const dailyData = (typeof d === 'object' && d !== null && d.quote)
        ? d
        : this._parseFallback(String(d || ''));

      this.setData({
        daily: dailyData,
        dailyLoading: false
      });

      try {
        const todayKey = 'daily_' + this._todayKey();
        wx.setStorageSync(todayKey, dailyData);
      } catch (_) {}

    } catch (e) {
      console.error('[Home] daily failed:', e);
      this.setData({
        daily: this._getRandomFallback(),
        dailyLoading: false
      });
    }
  },

  _parseFallback(text) {
    if (!text) return this._getRandomFallback();

    const extract = (label) => {
      const m = text.match(new RegExp(`【${label}】\\s*([\\s\\S]*?)(?=【|$)`));
      return m ? m[1].trim() : '';
    };

    const quote = extract('今日经典') || text.substring(0, 80);
    if (!quote) return this._getRandomFallback();

    return {
      quote,
      author: extract('作者朝代') || '',
      translation: extract('白话赏析') || extract('译文') || '',
      analysis: extract('意境赏析') || extract('赏析') || '',
      insight: extract('今日启示') || ''
    };
  },

  _getRandomFallback() {
    const list = FALLBACK_DAILY_LIST || [];
    if (!list.length) {
      return {
        quote: '知之者不如好之者，好之者不如乐之者。',
        author: '《论语》',
        translation: '懂得它的人，不如喜爱它的人；喜爱它的人，不如以它为乐的人。',
        analysis: '',
        insight: '真正的成长，来自发自内心的热爱。'
      };
    }
    return list[Math.floor(Math.random() * list.length)];
  },

  _todayKey() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}${m}${day}`;
  },

  async refreshDaily() {
    if (this.data.refreshing || this.data.dailyLoading) return;

    this.setData({ refreshing: true });

    const currentQuote = this.data.daily && this.data.daily.quote;
    const next = _getNextFallback(currentQuote) || this._getRandomFallback();

    setTimeout(() => {
      this.setData({ dailyLoading: true });

      setTimeout(() => {
        this.setData({
          daily: next,
          dailyLoading: false,
          refreshing: false
        });
      }, 240);
    }, 80);

    this._refreshFromAIAsync(next);
  },

  async _refreshFromAIAsync() {
    try {
      const seed = Date.now();
      const res = await api.getDailyClassic(true, seed);
      const d = res && res.daily;

      if (
        d &&
        typeof d === 'object' &&
        d.quote &&
        d.quote !== (this.data.daily && this.data.daily.quote) &&
        !this.data.dailyLoading
      ) {
        this.setData({ daily: d });
      }
    } catch (_) {
      // 静默失败
    }
  },

  goFunc(e) {
    const func = e.currentTarget.dataset.func;
    if (!func) return;

    if (func.isTab) {
      wx.switchTab({ url: func.page });
    } else {
      wx.navigateTo({ url: func.page });
    }
  },

  goHotTopic(e) {
    const page = e.currentTarget.dataset.page;

    const pageMap = {
      classics: '/pages/classics/index',
      translate: '/pages/translate/index',
      idiom: '/pages/idiom/index',
      history: '/pages/history/index',
      philosophers: '/pages/philosophers/index'
    };

    const url = pageMap[page] || '/pages/classics/index';
    const isTab = TAB_PAGES.includes(url);

    if (isTab) {
      wx.switchTab({ url });
    } else {
      wx.navigateTo({ url });
    }
  },

  goCategory(e) {
    const cat = e.currentTarget.dataset.cat;
    if (!cat) return;

    if (cat.isTab) {
      wx.switchTab({ url: cat.page });
    } else {
      wx.navigateTo({ url: cat.page });
    }
  },

  goDiscussDaily() {
    wx.navigateTo({ url: '/pages/translate/index' });
  },

  goTranslate() {
    wx.navigateTo({ url: '/pages/translate/index' });
  },

  goVip() {
    wx.navigateTo({ url: '/pages/vip/index' });
  },

  onShareAppMessage() {
    const daily = this.data.daily;
    return shareUtil.buildShareMsg({
      title: daily && daily.quote
        ? `「${daily.quote}」—— ${daily.author || '国学精华'}`
        : '国学助手 · 传承千年智慧',
      path: '/pages/home/index'
    });
  },

  onShareTimeline() {
    const daily = this.data.daily;
    return {
      title: daily && daily.quote
        ? `「${daily.quote}」—— ${daily.author || '国学精华'}`
        : '国学助手 · 传承千年智慧，探索文化精髓',
      query: 'from=timeline'
    };
  },

  showShareMenu() {
    wx.showActionSheet({
      itemList: ['发送给好友', '分享到朋友圈', '生成精美海报'],
      success: (res) => {
        if (res.tapIndex === 0) {
          wx.showShareMenu({
            withShareTicket: true,
            menus: ['shareAppMessage']
          });
          wx.showToast({
            title: '请点击右上角转发',
            icon: 'none',
            duration: 2000
          });
        } else if (res.tapIndex === 1) {
          wx.showShareMenu({
            withShareTicket: true,
            menus: ['shareTimeline']
          });
          wx.showToast({
            title: '请点击右上角分享到朋友圈',
            icon: 'none',
            duration: 2000
          });
        } else if (res.tapIndex === 2) {
          this.openPoster();
        }
      }
    });
  },

  openPoster() {
    if (this.data.posterLoading || this.data.showPoster) return;

    this._clearPosterTask();

    const token = Date.now();
    this._posterToken = token;

    this.setData({
      showPoster: true,
      posterPath: '',
      posterLoading: true
    }, () => {
      this._posterTimer = setTimeout(() => {
        if (!this.data.showPoster || this._posterToken !== token) return;
        this._drawPoster(token);
      }, 120);
    });
  },

  closePoster() {
    this._clearPosterTask();
    this.setData({
      showPoster: false,
      posterPath: '',
      posterLoading: false
    });
  },

  async _drawPoster(token) {
    const daily = this.data.daily || {};

    try {
      const path = await shareUtil.generatePoster(this, {
        quote: daily.quote || '',
        author: daily.author || '',
        translation: daily.translation || '',
        insight: daily.insight || '',
        canvasId: 'posterCanvas'
      });

      if (!this.data.showPoster || this._posterToken !== token) return;

      this.setData({
        posterPath: path,
        posterLoading: false
      });
    } catch (e) {
      console.error('[Home] drawPoster error:', e);

      if (this._posterToken !== token) return;

      this.setData({ posterLoading: false });
      wx.showToast({
        title: '海报生成失败，请重试',
        icon: 'none'
      });
    }
  },

  async savePoster() {
    const path = this.data.posterPath;
    if (!path) {
      wx.showToast({
        title: '海报尚未生成',
        icon: 'none'
      });
      return;
    }

    try {
      await shareUtil.savePosterToAlbum(path);
    } catch (e) {
      console.error('[Home] savePoster error:', e);
    }
  },

  previewPoster() {
    const path = this.data.posterPath;
    if (!path) return;
    wx.previewImage({
      urls: [path],
      current: path
    });
  },

  adLoad() {
    console.log('[Home] Banner 广告加载成功');
  },

  adError(err) {
    console.warn('[Home] Banner 广告加载失败', err);
    this.setData({ showAd: false });
  },

  adClose() {
    console.log('[Home] Banner 广告关闭');
  }
});
