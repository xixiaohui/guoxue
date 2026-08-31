const { FALLBACK_DAILY_LIST, TAB_PAGES, STORAGE_KEYS } = require('../../utils/constants');
const shareUtil = require('../../utils/share');
const { downloadPdf } = require('../../utils/pdf');
const settings = require('../../utils/settings');
const poetry = require('../../utils/poetryApi');
const poemCache = require('../../utils/poemCache');
const seo = require('../../utils/seo');
const topicData = require('../../utils/topicData');
const landing = require('../../utils/landing');

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

    // 节气诗词（与诗词天地页同源 /solar-term）
    solar: { termName: '', termDescription: '', poem: null, reason: '' },
    solarLoading: true,

    // 本周最热门诗词（首页预览 Top3，完整榜单见 week_hot 页）
    weekHotPreview: [
      { rank: 1, title: '静夜思', author: '李白', dynasty: '唐' },
      { rank: 2, title: '水调歌头·明月几时有', author: '苏轼', dynasty: '宋' },
      { rank: 3, title: '春晓', author: '孟浩然', dynasty: '唐' }
    ],

    // 连续学习7天（首页预览：本周打卡圆点 + 连续天数，完整见 seven_days 页）
    study: { streak: 0, todayDone: false, week: [] },

    // 精选专题（唐诗三百首/宋词精选/古诗词名句/唐诗鉴赏，入口见 topic 页）
    topics: topicData.getTopics().map((t) => Object.assign({}, t, {
      bg: { tangshi300: 'linear-gradient(135deg,#E05820,#8B2500)', songci: 'linear-gradient(135deg,#5A3DA8,#9B6FD5)', mingju: 'linear-gradient(135deg,#C48A10,#F0B840)', shangxi: 'linear-gradient(135deg,#1A7ED5,#5BC8F5)' }[t.type] || 'linear-gradient(135deg,#C48A10,#8B2500)'
    })),

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
      { id: 'classics',     name: '诗词典籍',  desc: '经典赏析鉴读', char: '詩', bg: 'linear-gradient(135deg,#9B6FD5,#6A3DA8)', page: '/pages/chinesepoetry/index', isTab: true  },
      { id: 'idiom',        name: '成语故事',  desc: '典故溯源解析', char: '成', bg: 'linear-gradient(135deg,#F0B840,#C48A10)', page: '/pages/idiom/index',         isTab: false },
      { id: 'history',      name: '历史探秘',  desc: '朝代人物探究', char: '史', bg: 'linear-gradient(135deg,#5BC8F5,#1A7ED5)', page: '/pages/history/index',      isTab: false },
      { id: 'philosophers', name: '诸子百家',  desc: '百家争鸣精华', char: '道', bg: 'linear-gradient(135deg,#FF8FA3,#C03060)', page: '/pages/philosophers/index',  isTab: false }
    ],

    categories: [
      { id: 1, name: '诗词歌赋', desc: '唐诗宋词，韵律之美', icon: '📜', bg: 'linear-gradient(135deg,#FF9A5C,#E05820)', page: '/pages/chinesepoetry/index', isTab: true },
      { id: 2, name: '经史子集', desc: '四部典籍，学问源流', icon: '📚', bg: 'linear-gradient(135deg,#52C878,#1A8040)', page: '/pages/classics/index', isTab: false },
      { id: 3, name: '成语典故', desc: '字里乾坤，故事传承', icon: '🏮', bg: 'linear-gradient(135deg,#F7C948,#C48A10)', page: '/pages/idiom/index', isTab: false },
      { id: 4, name: '历史文化', desc: '朝代更迭，人文风华', icon: '🏯', bg: 'linear-gradient(135deg,#9B8FD5,#5A3DA8)', page: '/pages/history/index', isTab: false }
    ],

    showPoster: false,
    posterLoading: false,
    posterPath: '',

    isSinglePage: false, // 朋友圈单页模式：广告/跳转/海报/分享菜单被禁用

    showAd: false,
    adUnitId: 'adunit-67efd80bac46e2ad',

    pdfList: [
      {
        id: 1,
        name: '论语导读.pdf',
        url: 'https://files.yourdomain.com/pdfs/lunyu.pdf'
      },
      {
        id: 2,
        name: '诗经精选.pdf',
        url: 'https://files.yourdomain.com/pdfs/shijing.pdf'
      }
    ]
  },

  onLoad() {
    this._posterToken = 0;
    this._posterTimer = null;
    this._lastLoadedDay = this._todayKey();

    // 单页模式：广告组件被禁用，且禁止一切页面跳转/海报/分享菜单等能力
    const single = landing.isSinglePage();
    this.setData({
      isSinglePage: single,
      showAd: this._canShowAd() && !single
    });

    this._loadDaily();
    this._loadSolar();
    this._setupSeo();
  },

  /** 单页模式下禁止页面跳转/海报/分享菜单等能力，返回 true 表示已拦截并提示 */
  _guardNav() {
    if (!this.data.isSinglePage) return false;
    wx.showToast({ title: '请打开小程序浏览更多内容', icon: 'none' });
    return true;
  },

  onShow() {
    settings.applyToPage(this);
    const today = this._todayKey();
    if (this._lastLoadedDay && this._lastLoadedDay !== today) {
      this._loadDaily(true);
    }
    this._loadStudyPreview();
  },

  onHide() {
    this._clearPosterTask();
  },

  onUnload() {
    this._clearPosterTask();
  },

  noop() {},

  /** 搜一搜优化：首页上报品牌与核心栏目关键词（覆盖「唐诗三百首/古诗词大全/写月的诗」等目标词） */
  _setupSeo() {
    seo.reportPageInfo({
      title: '古诗词大全 · 国文之学',
      keywords: seo.buildKeywords([
        '国文之学', '古诗词大全', '唐诗三百首', '宋词', '古诗词', '写月的诗', '送别诗', '思乡诗',
        '诗词学习', '诗词鉴赏', '诗词朗诵', '李白的诗', '苏轼的诗',
        '古诗', '唐诗', '元曲', '国学', '成语', '历史', '诸子百家', '诗词'
      ]),
      description: '国文之学——古诗词大全：唐诗宋词、李白苏轼名篇、写月的诗、送别诗、思乡诗、成语典故、历史文化、诸子百家，每日一句国学经典。'
    });
  },

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

  _loadDaily(forceRefresh = false) {
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

    const dailyData = _getNextFallback(this.data.daily && this.data.daily.quote) || this._getRandomFallback();
    this.setData({ daily: dailyData, dailyLoading: false });

    try {
      const todayKey = 'daily_' + this._todayKey();
      wx.setStorageSync(todayKey, dailyData);
    } catch (_) {}
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

  /** 连续学习7天预览：本周打卡圆点 + 连续天数（与 seven_days 页同 storage key） */
  _loadStudyPreview() {
    let days = [];
    try {
      days = wx.getStorageSync('study_days') || [];
    } catch (_) {}
    const doneSet = new Set(days);
    const today = this._todayKey();

    const now = new Date();
    const dow = (now.getDay() + 6) % 7; // 周一=0
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dow);
    const labels = ['一', '二', '三', '四', '五', '六', '日'];
    const week = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
      const key = this._keyOf(d);
      week.push({
        key,
        label: labels[i],
        dayNum: String(d.getDate()),
        done: doneSet.has(key),
        today: key === today
      });
    }

    this.setData({
      study: {
        streak: this._calcStreak(doneSet, today),
        todayDone: doneSet.has(today),
        week
      }
    });
  },

  /** 连续打卡天数：今天已打卡从今天起算，否则从昨天起算 */
  _calcStreak(doneSet, today) {
    let streak = 0;
    const cursor = new Date(Number(today.slice(0, 4)), Number(today.slice(4, 6)) - 1, Number(today.slice(6, 8)));
    if (!doneSet.has(today)) cursor.setDate(cursor.getDate() - 1);
    while (doneSet.has(this._keyOf(cursor))) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    }
    return streak;
  },

  _keyOf(d) {
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  },

  refreshDaily() {
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
  },

  goFunc(e) {
    if (this._guardNav()) return;
    const func = e.currentTarget.dataset.func;
    if (!func) return;

    if (func.isTab) {
      wx.switchTab({ url: func.page });
    } else {
      wx.navigateTo({ url: func.page });
    }
  },

  goHotTopic(e) {
    if (this._guardNav()) return;
    const page = e.currentTarget.dataset.page;

    const pageMap = {
      classics: '/pages/classics/index',
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
    if (this._guardNav()) return;
    const cat = e.currentTarget.dataset.cat;
    if (!cat) return;

    if (cat.isTab) {
      wx.switchTab({ url: cat.page });
    } else {
      wx.navigateTo({ url: cat.page });
    }
  },

  goGuoxueDownload() {
    if (this._guardNav()) return;
    wx.navigateTo({ url: '/pages/guoxuedownload/index' });
  },

  goPoetry() {
    if (this._guardNav()) return;
    wx.switchTab({ url: '/pages/chinesepoetry/index' });
  },

  /** 精选专题 → 静态专题页（唐诗三百首/宋词精选/古诗词名句/唐诗鉴赏） */
  goTopic(e) {
    if (this._guardNav()) return;
    const type = e.currentTarget.dataset.type;
    if (!type) return;
    wx.navigateTo({ url: '/pages/topic/index?type=' + type });
  },

  /** 本周最热门诗词 → 完整榜单页 */
  goWeekHot() {
    if (this._guardNav()) return;
    wx.navigateTo({ url: '/pages/week_hot/index' });
  },

  /** 连续学习7天 → 打卡页 */
  goSevenDays() {
    if (this._guardNav()) return;
    wx.navigateTo({ url: '/pages/seven_days/index' });
  },

  // ── 节气诗词 ──────────────────────────────
  async _loadSolar() {
    this.setData({ solarLoading: true });
    try {
      const s = await poetry.getSolarTerm();
      if (!s.termName) throw new Error('empty solar');
      this.setData({ solar: s });
    } catch (e) {
      this.setData({ solar: poetry.FALLBACK_SOLAR });
    } finally {
      this.setData({ solarLoading: false });
    }
  },

  /** 节气诗词 → 详情 */
  goSolarPoem(e) {
    if (this._guardNav()) return;
    const poem = e.currentTarget.dataset.poem;
    if (!poem || (!poem.title && !poem.content)) return;
    poemCache.cachePoem(poem);
    wx.navigateTo({ url: this._buildPoemUrl(poem) });
  },

  /** 组装诗词详情 URL（与诗词天地页一致：超长时截断 content 保证跳转可用） */
  _buildPoemUrl(poem) {
    const qs = [
      'kind=poem',
      'id=' + encodeURIComponent(poem.id == null ? '' : String(poem.id)),
      'title=' + encodeURIComponent(poem.title || ''),
      'author=' + encodeURIComponent(poem.author || ''),
      'dynasty=' + encodeURIComponent(poem.dynasty || ''),
      'type=' + encodeURIComponent(poem.type || '')
    ];
    let content = poem.content || poem.preview || '';
    let url = '';
    for (let i = 0; i < 3; i++) {
      url = '/pages/chinesepoetry_detail/index?' + qs.join('&') + '&content=' + encodeURIComponent(content);
      if (url.length <= 1800) break;
      content = content.slice(0, Math.floor(content.length * 0.7));
    }
    return url;
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
    // 单页模式下分享菜单/海报等能力不可用
    if (this.data.isSinglePage) {
      wx.showToast({ title: '请打开小程序分享', icon: 'none' });
      return;
    }
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
    // 单页模式下画布能力被禁用
    if (this.data.isSinglePage) {
      wx.showToast({ title: '请打开小程序生成海报', icon: 'none' });
      return;
    }
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


  adError(err) {
    console.warn('[Home] Banner 广告加载失败', err);
    this.setData({ showAd: false });
  },

  adClose() {
    console.log('[Home] Banner 广告关闭');
  }
});
