// pages/home/index.js - 生产级首页 v7.0（换一条不重复 + 分享海报）
const api = require('../../utils/api');
const { FALLBACK_DAILY_LIST, TAB_PAGES, STORAGE_KEYS } = require('../../utils/constants');
const monetize = require('../../utils/monetize');
const shareUtil = require('../../utils/share');

// ─── 换一条：改进版，真实随机且不重复 ──────────────────────────
// 从30条名言中随机选一条，记录已展示过的，避免短期内重复出现
function _getNextFallback(currentQuote) {
  const list = FALLBACK_DAILY_LIST;
  const total = list.length;
  if (total === 0) return null;
  if (total === 1) return list[0];

  // 读取已展示过的索引历史（最近 total-1 条内不重复）
  let shownIdxs = [];
  try {
    shownIdxs = wx.getStorageSync(STORAGE_KEYS.DAILY_HISTORY) || [];
  } catch (_) {}

  // 过滤掉最近已显示的（保留 Math.floor(total/2) 条历史记录）
  const windowSize = Math.floor(total / 2);
  const recentIdxs = new Set(shownIdxs.slice(-windowSize));

  // 也排除当前正在显示的
  const currentIdx = list.findIndex(item => item.quote === currentQuote);
  if (currentIdx >= 0) recentIdxs.add(currentIdx);

  // 候选列表
  const candidates = [];
  for (let i = 0; i < total; i++) {
    if (!recentIdxs.has(i)) candidates.push(i);
  }

  // 如果候选为空（所有条目都展示过），则重置历史，从全部中随机
  const pool = candidates.length > 0 ? candidates : list.map((_, i) => i).filter(i => i !== currentIdx);
  const chosenIdx = pool[Math.floor(Math.random() * pool.length)];

  // 更新历史记录
  shownIdxs.push(chosenIdx);
  if (shownIdxs.length > total) shownIdxs = shownIdxs.slice(-total);
  try {
    wx.setStorageSync(STORAGE_KEYS.DAILY_HISTORY, shownIdxs);
  } catch (_) {}

  return list[chosenIdx];
}

Page({
  data: {
    // 每日经典
    dailyLoading: true,
    daily: { quote: '', author: '', translation: '', analysis: '', insight: '' },
    refreshing: false,   // 换一条动画状态

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
      { id: 'translate',    name: '古文翻译',  desc: '文言白话互译', char: '译', bg: 'linear-gradient(135deg,#52C8A0,#1A8060)', page: '/pages/translate/index',    isTab: true  },
      { id: 'classics',     name: '诗词典籍',  desc: '经典赏析鉴读', char: '詩', bg: 'linear-gradient(135deg,#9B6FD5,#6A3DA8)', page: '/pages/classics/index',     isTab: true  },
      { id: 'idiom',        name: '成语故事',  desc: '典故溯源解析', char: '成', bg: 'linear-gradient(135deg,#F0B840,#C48A10)', page: '/pages/idiom/index',         isTab: false },
      { id: 'history',      name: '历史探秘',  desc: '朝代人物探究', char: '史', bg: 'linear-gradient(135deg,#5BC8F5,#1A7ED5)', page: '/pages/history/index',      isTab: true  },
      { id: 'philosophers', name: '诸子百家',  desc: '百家争鸣精华', char: '道', bg: 'linear-gradient(135deg,#FF8FA3,#C03060)', page: '/pages/philosophers/index',  isTab: true  }
    ],

    // 国学分类
    categories: [
      { id: 1, name: '诗词歌赋', desc: '唐诗宋词，韵律之美',  icon: '📜', bg: 'linear-gradient(135deg,#FF9A5C,#E05820)', page: '/pages/classics/index',     isTab: true  },
      { id: 2, name: '经史子集', desc: '四部典籍，学问源流',  icon: '📚', bg: 'linear-gradient(135deg,#52C878,#1A8040)', page: '/pages/classics/index',     isTab: true  },
      { id: 3, name: '成语典故', desc: '字里乾坤，故事传承',  icon: '🏮', bg: 'linear-gradient(135deg,#F7C948,#C48A10)', page: '/pages/idiom/index',         isTab: false },
      { id: 4, name: '历史文化', desc: '朝代更迭，人文风华',  icon: '🏯', bg: 'linear-gradient(135deg,#9B8FD5,#5A3DA8)', page: '/pages/history/index',      isTab: true  },
      { id: 5, name: '诸子百家', desc: '百家争鸣，思想精华',  icon: '⛩️', bg: 'linear-gradient(135deg,#FF8FA3,#C03060)', page: '/pages/philosophers/index',  isTab: true  },
      { id: 6, name: '古文翻译', desc: '文言白话，智慧互通',  icon: '🖌️', bg: 'linear-gradient(135deg,#5BC8F5,#1A7ED5)', page: '/pages/translate/index',    isTab: true  }
    ],

    // 海报相关
    showPoster:    false,
    posterLoading: false,
    posterPath:    '',
  },

  onLoad() {
    this._loadDaily();
    monetize.preloadRewardedAd && monetize.preloadRewardedAd();
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

    // 先用本地缓存快速展示（今日第一次）
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
      const d = res.daily;
      if (typeof d === 'object' && d !== null && d.quote) {
        this.setData({ daily: d, dailyLoading: false });
      } else {
        this.setData({ daily: this._parseFallback(String(d || '')), dailyLoading: false });
      }
    } catch (e) {
      console.error('[Home] daily failed:', e);
      // AI 调用失败时：使用本地fallback（随机选）
      this.setData({ daily: this._getRandomFallback(), dailyLoading: false });
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
      author:      extract('作者朝代') || '',
      translation: extract('白话赏析') || extract('译文') || '',
      analysis:    extract('意境赏析') || extract('赏析') || '',
      insight:     extract('今日启示') || ''
    };
  },

  _getRandomFallback() {
    const list = FALLBACK_DAILY_LIST;
    return list[Math.floor(Math.random() * list.length)];
  },

  _todayKey() {
    const d = new Date();
    return `${d.getFullYear()}${d.getMonth() + 1}${d.getDate()}`;
  },

  // ── 换一条（核心：真实随机且不重复）──────────────────────────
  async refreshDaily() {
    if (this.data.refreshing || this.data.dailyLoading) return;
    this.setData({ refreshing: true });

    // 先立即展示本地fallback（无感切换，不走AI接口）
    const currentQuote = this.data.daily && this.data.daily.quote;
    const next = _getNextFallback(currentQuote);

    // 动画：短暂隐藏 → 切换 → 显示（模拟翻页效果）
    setTimeout(() => {
      this.setData({ dailyLoading: true });
      setTimeout(() => {
        this.setData({
          daily: next,
          dailyLoading: false,
          refreshing: false
        });
      }, 300);
    }, 80);

    // 同时在后台尝试获取AI生成的，成功后替换（不影响用户体验）
    this._refreshFromAIAsync(next);
  },

  // 后台静默从 AI 刷新，成功后替换当前卡片
  async _refreshFromAIAsync(fallbackUsed) {
    try {
      // 使用随机种子让 AI 返回不同内容
      const seed = Date.now();
      const res = await api.getDailyClassic(true, seed);
      const d = res && res.daily;
      if (d && typeof d === 'object' && d.quote && d.quote !== (this.data.daily && this.data.daily.quote)) {
        // 只有当 AI 返回的与当前显示的不同时，才更新
        if (!this.data.dailyLoading) {
          this.setData({ daily: d });
        }
      }
    } catch (_) {
      // 静默失败，不影响 UI
    }
  },

  // ── 跳转功能页 ──────────────────────────────────
  goFunc(e) {
    const func = e.currentTarget.dataset.func;
    if (!func) return;
    if (func.isTab) {
      wx.switchTab({ url: func.page });
    } else {
      wx.navigateTo({ url: func.page });
    }
  },

  // ── 热门话题 ──────────────────────────────────
  goHotTopic(e) {
    const page = e.currentTarget.dataset.page;
    const pageMap = {
      classics:     '/pages/classics/index',
      translate:    '/pages/translate/index',
      idiom:        '/pages/idiom/index',
      history:      '/pages/history/index',
      philosophers: '/pages/philosophers/index'
    };
    const url   = pageMap[page] || '/pages/classics/index';
    const isTab = TAB_PAGES.includes(url);
    if (isTab) {
      wx.switchTab({ url });
    } else {
      wx.navigateTo({ url });
    }
  },

  // ── 国学分类 ──────────────────────────────────
  goCategory(e) {
    const cat = e.currentTarget.dataset.cat;
    if (!cat) return;
    if (cat.isTab) {
      wx.switchTab({ url: cat.page });
    } else {
      wx.navigateTo({ url: cat.page });
    }
  },

  // ── 点击每日经典卡片 → 古文翻译赏析 ─────────────────────
  goDiscussDaily() {
    wx.switchTab({ url: '/pages/translate/index' });
  },

  // ── 快速翻译 ──────────────────────────────────
  goTranslate() {
    wx.switchTab({ url: '/pages/translate/index' });
  },

  // ── 会员中心 ──────────────────────────────────
  goVip() {
    wx.navigateTo({ url: '/pages/vip/index' });
  },

  // ── 分享 ──────────────────────────────────────
  // 发送给好友（系统自动调用）
  onShareAppMessage() {
    const daily = this.data.daily;
    return shareUtil.buildShareMsg({
      title:   daily && daily.quote
        ? `「${daily.quote}」—— ${daily.author || '国学精华'}`
        : '国学助手 · 传承千年智慧',
      path:    '/pages/home/index',
    });
  },

  // 分享到朋友圈（系统自动调用）
  onShareTimeline() {
    const daily = this.data.daily;
    return {
      title: daily && daily.quote
        ? `「${daily.quote}」—— ${daily.author || '国学精华'}`
        : '国学助手 · 传承千年智慧，探索文化精髓',
      query: 'from=timeline',
    };
  },

  // ── 生成海报 ──────────────────────────────────
  showShareMenu() {
    wx.showActionSheet({
      itemList: ['发送给好友', '分享到朋友圈', '生成精美海报'],
      success: (res) => {
        if (res.tapIndex === 0) {
          // 发送给好友 - 触发系统分享
          const daily = this.data.daily;
          wx.showShareMenu({ withShareTicket: true, menus: ['shareAppMessage'] });
          wx.showToast({ title: '请点击右上角转发', icon: 'none', duration: 2000 });
        } else if (res.tapIndex === 1) {
          // 朋友圈
          wx.showShareMenu({ withShareTicket: true, menus: ['shareTimeline'] });
          wx.showToast({ title: '请点击右上角分享到朋友圈', icon: 'none', duration: 2000 });
        } else if (res.tapIndex === 2) {
          // 生成海报
          this.openPoster();
        }
      }
    });
  },

  openPoster() {
    this.setData({ showPoster: true, posterPath: '', posterLoading: true });
    // 延迟渲染，确保 canvas 节点已挂载
    setTimeout(() => this._drawPoster(), 300);
  },

  closePoster() {
    this.setData({ showPoster: false, posterPath: '', posterLoading: false });
  },

  async _drawPoster() {
    const daily = this.data.daily;
    try {
      const path = await shareUtil.generatePoster(this, {
        quote:       daily.quote       || '',
        author:      daily.author      || '',
        translation: daily.translation || '',
        insight:     daily.insight     || '',
        canvasId:    'posterCanvas',
      });
      this.setData({ posterPath: path, posterLoading: false });
    } catch (e) {
      console.error('[Home] drawPoster error:', e);
      this.setData({ posterLoading: false });
      wx.showToast({ title: '海报生成失败，请重试', icon: 'none' });
    }
  },

  async savePoster() {
    const path = this.data.posterPath;
    if (!path) {
      wx.showToast({ title: '海报尚未生成', icon: 'none' });
      return;
    }
    await shareUtil.savePosterToAlbum(path);
  },

  previewPoster() {
    const path = this.data.posterPath;
    if (!path) return;
    wx.previewImage({ urls: [path], current: path });
  },

  onAdError(e) {
    console.warn('[Home] ad error:', e.detail);
  }
});
