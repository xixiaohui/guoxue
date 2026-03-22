// pages/home/index.js - 生产级首页（含变现闭环）
const api = require('../../utils/api');
const { FALLBACK_DAILY_LIST, TAB_PAGES } = require('../../utils/constants');
const monetize = require('../../utils/monetize');

Page({
  data: {
    // 每日经典
    dailyLoading: true,
    daily: { quote: '', author: '', translation: '', analysis: '', insight: '' },

    // 热门话题
    hotTopics: [
      '李白与杜甫谁更伟大？',
      '论语最经典的十句话',
      '孙子兵法现代应用',
      '道德经核心思想',
      '苏轼的人生智慧',
      '儒释道三家区别',
      '唐诗宋词的风格差异',
      '科举制度如何影响中国'
    ],

    // 国学分类
    categories: [
      { id: 1, name: '诗词歌赋', desc: '唐诗宋词，韵律之美', icon: '📜', bg: 'linear-gradient(135deg,#FF9A5C,#E05820)', url: '/pages/classics/index', tabUrl: true },
      { id: 2, name: '经史子集', desc: '四部典籍，学问源流', icon: '📚', bg: 'linear-gradient(135deg,#52C878,#1A8040)', url: '/pages/classics/index', tabUrl: true },
      { id: 3, name: '成语典故', desc: '字里乾坤，故事传承', icon: '🏮', bg: 'linear-gradient(135deg,#F7C948,#C48A10)', url: '/pages/idiom/index', tabUrl: false },
      { id: 4, name: '历史文化', desc: '朝代更迭，人文风华', icon: '🏯', bg: 'linear-gradient(135deg,#9B8FD5,#5A3DA8)', url: '/pages/history/index', tabUrl: true },
      { id: 5, name: '诸子百家', desc: '百家争鸣，思想精华', icon: '⛩️', bg: 'linear-gradient(135deg,#FF8FA3,#C03060)', url: '/pages/chat/index', tabUrl: true, topic: '诸子百家各派核心思想介绍' },
      { id: 6, name: '汉字文化', desc: '笔墨纸砚，文人雅韵', icon: '🖌️', bg: 'linear-gradient(135deg,#5BC8F5,#1A7ED5)', url: '/pages/chat/index', tabUrl: true, topic: '汉字的起源与演变历史' }
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
    // 首页不显示banner，用首页内嵌原生广告位替代
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

  // 解析纯文本格式（兼容旧格式）
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

  // ── 换一换 ──────────────────────────────
  refreshDaily() {
    this._loadDaily(true);
  },

  // ── 跳转到 AI 对话（带当日名句话题） ──────────────────────────────
  goToChat() {
    wx.switchTab({ url: '/pages/chat/index' });
  },

  goHotTopic(e) {
    const topic = e.currentTarget.dataset.topic;
    wx.navigateTo({ url: `/pages/chat/index?topic=${encodeURIComponent(topic)}` });
  },

  goCategory(e) {
    const cat = e.currentTarget.dataset.cat;

    if (cat.topic) {
      wx.navigateTo({ url: `/pages/chat/index?topic=${encodeURIComponent(cat.topic)}` });
    } else if (TAB_PAGES.includes(cat.url)) {
      wx.switchTab({ url: cat.url });
    } else {
      wx.navigateTo({ url: cat.url });
    }
  },

  // ── 点击每日经典卡片 → 带原文去聊天 ──────────────────────────────
  goDiscussDaily() {
    const { daily } = this.data;
    if (!daily.quote) {
      wx.switchTab({ url: '/pages/chat/index' });
      return;
    }
    const topic = `请为我深入赏析这句话："${daily.quote}" （${daily.author}）`;
    wx.navigateTo({ url: `/pages/chat/index?topic=${encodeURIComponent(topic)}` });
  },

  // ── 快速翻译示例 ──────────────────────────────
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
