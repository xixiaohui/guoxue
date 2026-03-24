// pages/home/index.js - 生产级首页 v6.0（五大模块，无AI问答）
const api = require('../../utils/api');
const { FALLBACK_DAILY_LIST, TAB_PAGES } = require('../../utils/constants');
const monetize = require('../../utils/monetize');

Page({
  data: {
    // 每日经典
    dailyLoading: true,
    daily: { quote: '', author: '', translation: '', analysis: '', insight: '' },

    // 热门话题（跳转到对应功能页）
    hotTopics: [
      { text: '李白 · 将进酒赏析', page: 'classics' },
      { text: '道德经核心思想', page: 'philosophers' },
      { text: '一鸣惊人的典故', page: 'idiom' },
      { text: '贞观之治始末', page: 'history' },
      { text: '论语十大名句', page: 'classics' },
      { text: '苏轼的人生智慧', page: 'classics' },
      { text: '孙子兵法精髓', page: 'philosophers' },
      { text: '唐诗宋词风格差异', page: 'translate' }
    ],

    // 五大功能模块
    funcs: [
      { id: 'translate', name: '古文翻译', desc: '文言白话互译', char: '译', bg: 'linear-gradient(135deg,#52C8A0,#1A8060)', page: '/pages/translate/index', isTab: true },
      { id: 'classics',  name: '诗词典籍', desc: '经典赏析鉴读', char: '詩', bg: 'linear-gradient(135deg,#9B6FD5,#6A3DA8)', page: '/pages/classics/index', isTab: true },
      { id: 'idiom',     name: '成语故事', desc: '典故溯源解析', char: '成', bg: 'linear-gradient(135deg,#F0B840,#C48A10)', page: '/pages/idiom/index', isTab: false },
      { id: 'history',   name: '历史探秘', desc: '朝代人物探究', char: '史', bg: 'linear-gradient(135deg,#5BC8F5,#1A7ED5)', page: '/pages/history/index', isTab: true },
      { id: 'philosophers', name: '诸子百家', desc: '百家争鸣精华', char: '道', bg: 'linear-gradient(135deg,#FF8FA3,#C03060)', page: '/pages/philosophers/index', isTab: true }
    ],

    // 国学分类（丰富）
    categories: [
      { id: 1, name: '诗词歌赋', desc: '唐诗宋词，韵律之美', icon: '📜', bg: 'linear-gradient(135deg,#FF9A5C,#E05820)', page: '/pages/classics/index', isTab: true },
      { id: 2, name: '经史子集', desc: '四部典籍，学问源流', icon: '📚', bg: 'linear-gradient(135deg,#52C878,#1A8040)', page: '/pages/classics/index', isTab: true },
      { id: 3, name: '成语典故', desc: '字里乾坤，故事传承', icon: '🏮', bg: 'linear-gradient(135deg,#F7C948,#C48A10)', page: '/pages/idiom/index', isTab: false },
      { id: 4, name: '历史文化', desc: '朝代更迭，人文风华', icon: '🏯', bg: 'linear-gradient(135deg,#9B8FD5,#5A3DA8)', page: '/pages/history/index', isTab: true },
      { id: 5, name: '诸子百家', desc: '百家争鸣，思想精华', icon: '⛩️', bg: 'linear-gradient(135deg,#FF8FA3,#C03060)', page: '/pages/philosophers/index', isTab: true },
      { id: 6, name: '古文翻译', desc: '文言白话，智慧互通', icon: '🖌️', bg: 'linear-gradient(135deg,#5BC8F5,#1A7ED5)', page: '/pages/translate/index', isTab: true }
    ],

    // 今日翻译示例
    translateTip: { ancient: '学而时习之，不亦说乎？', modern: '学习后时常温习，岂不是件令人愉快的事？' }
  },

  onLoad() {
    this._loadDaily();
    monetize.preloadRewardedAd();
  },

  onShow() {
    const today = this._todayKey();
    if (this._lastLoadedDay && this._lastLoadedDay !== today) {
      this._loadDaily(true);
    }
  },

  onPullDownRefresh() {
    this._loadDaily(true).finally(() => wx.stopPullDownRefresh());
  },

  // ── 加载每日经典 ──────────────────────────────
  async _loadDaily(forceRefresh = false) {
    this.setData({ dailyLoading: true });
    this._lastLoadedDay = this._todayKey();

    try {
      const res = await api.getDailyClassic(forceRefresh);
      const d = res.daily;

      if (typeof d === 'object' && d !== null && d.quote) {
        this.setData({ daily: d, dailyLoading: false });
      } else {
        this.setData({ daily: this._parseFallback(String(d || '')), dailyLoading: false });
      }
    } catch (e) {
      console.error('[Home] daily failed:', e);
      this.setData({ daily: this._fallbackDaily(), dailyLoading: false });
    }
  },

  _parseFallback(text) {
    if (!text) return this._fallbackDaily();
    const extract = (label) => {
      const m = text.match(new RegExp(`【${label}】\\s*([\\s\\S]*?)(?=【|$)`));
      return m ? m[1].trim() : '';
    };
    const quote = extract('今日经典') || text.substring(0, 80);
    if (!quote) return this._fallbackDaily();
    return {
      quote,
      author: extract('作者朝代') || '',
      translation: extract('白话赏析') || extract('译文') || '',
      analysis: extract('意境赏析') || extract('赏析') || '',
      insight: extract('今日启示') || ''
    };
  },

  _fallbackDaily() {
    return FALLBACK_DAILY_LIST[new Date().getDate() % FALLBACK_DAILY_LIST.length];
  },

  _todayKey() {
    const d = new Date();
    return `${d.getFullYear()}${d.getMonth() + 1}${d.getDate()}`;
  },

  refreshDaily() {
    this._loadDaily(true);
  },

  // ── 跳转功能页 ──────────────────────────────
  goFunc(e) {
    const func = e.currentTarget.dataset.func;
    if (!func) return;
    if (func.isTab) {
      wx.switchTab({ url: func.page });
    } else {
      wx.navigateTo({ url: func.page });
    }
  },

  // ── 热门话题 ──────────────────────────────
  goHotTopic(e) {
    const topic = e.currentTarget.dataset.topic;
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

  // ── 国学分类 ──────────────────────────────
  goCategory(e) {
    const cat = e.currentTarget.dataset.cat;
    if (!cat) return;
    if (cat.isTab) {
      wx.switchTab({ url: cat.page });
    } else {
      wx.navigateTo({ url: cat.page });
    }
  },

  // ── 点击每日经典卡片 → 古文翻译赏析 ──────────────────────────────
  goDiscussDaily() {
    wx.switchTab({ url: '/pages/translate/index' });
  },

  // ── 快速翻译 ──────────────────────────────
  goTranslate() {
    wx.switchTab({ url: '/pages/translate/index' });
  },

  // ── 会员中心 ──────────────────────────────
  goVip() {
    wx.navigateTo({ url: '/pages/vip/index' });
  },

  onAdError(e) {
    console.warn('[Home] ad error:', e.detail);
  }
});
