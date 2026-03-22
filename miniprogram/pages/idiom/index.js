// pages/idiom/index.js - 成语故事页（生产级，含变现闭环）
const api = require('../../utils/api');
const storage = require('../../utils/storage');
const { FALLBACK_IDIOM } = require('../../utils/constants');
const monetize = require('../../utils/monetize');

Page({
  data: {
    searchText: '',
    currentIdiom: '',
    result: '',
    resultSections: [],  // 解析后的分段
    isLoading: false,
    dailyIdiomLoading: true,
    dailyIdiom: FALLBACK_IDIOM,
    isFavorited: false,

    knownIdioms: [
      { word: '一鸣惊人', pinyin: 'yī míng jīng rén', brief: '比喻平时没有表现，突然做出惊人成绩', category: '励志' },
      { word: '画龙点睛', pinyin: 'huà lóng diǎn jīng', brief: '比喻在关键地方加上精彩的一笔', category: '艺术' },
      { word: '掩耳盗铃', pinyin: 'yǎn ěr dào líng', brief: '比喻自欺欺人', category: '讽刺' },
      { word: '叶公好龙', pinyin: 'yè gōng hào lóng', brief: '比喻说是爱好某事物，其实并不真爱好', category: '讽刺' },
      { word: '卧薪尝胆', pinyin: 'wò xīn cháng dǎn', brief: '比喻刻苦自励，发愤图强', category: '励志' },
      { word: '亡羊补牢', pinyin: 'wáng yáng bǔ láo', brief: '比喻出了问题，及时纠正，还不算晚', category: '哲理' },
      { word: '守株待兔', pinyin: 'shǒu zhū dài tù', brief: '比喻不主动努力，而存侥幸心理', category: '哲理' },
      { word: '刻舟求剑', pinyin: 'kè zhōu qiú jiàn', brief: '比喻不懂变通，拘泥守旧', category: '哲理' },
      { word: '滥竽充数', pinyin: 'làn yú chōng shù', brief: '比喻没有本领混在行家里凑数', category: '讽刺' },
      { word: '杯弓蛇影', pinyin: 'bēi gōng shé yǐng', brief: '形容疑神疑鬼，内心恐惧', category: '心理' }
    ],
    idiomCategories: [
      { id: 1, name: '励志奋进', icon: '🔥', count: 128, bg: 'linear-gradient(135deg, #FF9A5C, #FF6B35)', topic: '励志奋进类成语' },
      { id: 2, name: '历史典故', icon: '🏯', count: 256, bg: 'linear-gradient(135deg, #9B8FD5, #6B5BB5)', topic: '来自历史典故的成语' },
      { id: 3, name: '自然风物', icon: '🌿', count: 96, bg: 'linear-gradient(135deg, #43E97B, #38F9D7)', topic: '描写自然风物的成语' },
      { id: 4, name: '人情世故', icon: '👥', count: 180, bg: 'linear-gradient(135deg, #5BC8F5, #1A9ED5)', topic: '描写人情世故的成语' },
      { id: 5, name: '品德修养', icon: '🌸', count: 144, bg: 'linear-gradient(135deg, #FF8FA3, #E05070)', topic: '描写品德修养的成语' },
      { id: 6, name: '战争军事', icon: '⚔️', count: 112, bg: 'linear-gradient(135deg, #F7C948, #E8A710)', topic: '来自战争军事的成语' }
    ],
    featuredIdioms: [
      { id: 1, word: '三人成虎', pinyin: 'sān rén chéng hǔ', brief: '谣言重复多次便会被信以为真', category: '警示' },
      { id: 2, word: '狐假虎威', pinyin: 'hú jiǎ hǔ wēi', brief: '比喻借助强者的权势来欺压他人', category: '讽刺' },
      { id: 3, word: '塞翁失马', pinyin: 'sài wēng shī mǎ', brief: '比喻坏事可以变成好事', category: '哲理' },
      { id: 4, word: '完璧归赵', pinyin: 'wán bì guī zhào', brief: '比喻把原物完好地归还原主', category: '历史' },
      { id: 5, word: '负荆请罪', pinyin: 'fù jīng qǐng zuì', brief: '主动向人认错道歉，请求责罚', category: '美德' },
      { id: 6, word: '破釜沉舟', pinyin: 'pò fǔ chén zhōu', brief: '比喻下定决心，不顾一切干到底', category: '励志' },
      { id: 7, word: '纸上谈兵', pinyin: 'zhǐ shàng tán bīng', brief: '比喻空谈理论，不能解决实际问题', category: '讽刺' },
      { id: 8, word: '围魏救赵', pinyin: 'wéi wèi jiù zhào', brief: '比喻用迂回战术打击敌方要害', category: '策略' }
    ]
  },

  onLoad() {
    this._loadDailyIdiom();
    monetize.preloadRewardedAd();
    // Banner广告（非VIP）
    monetize.getQuotaStatus().then(s => {
      if (!s.isVip) this._bannerAd = monetize.createBannerAd();
    }).catch(() => {});
  },

  onUnload() {
    if (this._bannerAd) { try { this._bannerAd.destroy(); } catch (e) {} }
  },

  // ── 加载每日成语（AI生成，带缓存） ──────────────────────────────
  async _loadDailyIdiom(forceRefresh = false) {
    this.setData({ dailyIdiomLoading: true });
    try {
      const res = await api.getDailyIdiom(forceRefresh);
      const idiom = res.idiom;
      if (idiom && idiom.word) {
        this.setData({
          dailyIdiom: idiom,
          dailyIdiomLoading: false,
          isFavorited: storage.isIdiomFavorited(idiom.word)
        });
      } else {
        this.setData({ dailyIdiomLoading: false });
      }
    } catch (e) {
      console.warn('[Idiom] daily idiom failed, using fallback:', e);
      // 从本地列表随机选一个作为兜底
      const idioms = this.data.knownIdioms;
      const fb = idioms[new Date().getDate() % idioms.length];
      this.setData({ dailyIdiom: { ...FALLBACK_IDIOM, ...fb }, dailyIdiomLoading: false });
    }
  },

  changeDailyIdiom() {
    this._loadDailyIdiom(true);
  },

  // ── 搜索 ──────────────────────────────
  onSearchInput(e) {
    this.setData({ searchText: e.detail.value });
  },

  searchIdiom() {
    const text = this.data.searchText.trim();
    if (!text) return;
    this.lookupIdiomByWord(text);
  },

  lookupIdiom(e) {
    const idiom = e.currentTarget.dataset.idiom;
    this.lookupIdiomByWord(idiom);
  },

  // ── 核心查询（含配额检查）──────────────────────────────
  async lookupIdiomByWord(word) {
    if (!word || this.data.isLoading) return;

    // 配额检查
    let quotaResult;
    try {
      quotaResult = await monetize.consumeQuota();
    } catch (e) {
      quotaResult = { allowed: true, reason: 'fallback' };
    }

    if (!quotaResult.allowed) {
      const unlocked = await monetize.handleQuotaExceeded({
        onContinue: () => this._doLookupIdiom(word)
      });
      if (!unlocked) return;
      this._doLookupIdiom(word);
      return;
    }
    this._doLookupIdiom(word);
  },

  async _doLookupIdiom(word) {
    this.setData({ currentIdiom: word, result: '', resultSections: [], isLoading: true });
    wx.pageScrollTo({ scrollTop: 300, duration: 300 });

    try {
      const res = await api.explainIdiom(word);
      const text = res.explanation || '';
      const sections = this._parseSections(text);
      this.setData({ result: text, resultSections: sections, isLoading: false });
    } catch (e) {
      this.setData({ isLoading: false });
      api.showError(e.message || '查询失败，请重试');
    }
  },

  // ── 解析分段 ──────────────────────────────
  _parseSections(text) {
    const sections = [];
    const re = /【([^】]+)】\s*([\s\S]*?)(?=【|$)/g;
    let m;
    while ((m = re.exec(text)) !== null) {
      const content = m[2].trim();
      if (content) sections.push({ label: m[1], content });
    }
    if (sections.length === 0 && text.trim()) {
      sections.push({ label: '解释', content: text.trim() });
    }
    return sections;
  },

  // ── 收藏 ──────────────────────────────
  toggleFavorite() {
    const { currentIdiom, result } = this.data;
    if (!currentIdiom) return;
    const isFav = storage.toggleFavoriteIdiom({ word: currentIdiom, explanation: result, savedAt: Date.now() });
    this.setData({ isFavorited: isFav });
    wx.showToast({ title: isFav ? '已收藏' : '已取消收藏', icon: 'success', duration: 1200 });
  },

  // ── 复制 ──────────────────────────────
  copyResult() {
    wx.setClipboardData({
      data: this.data.result,
      success: () => wx.showToast({ title: '已复制', icon: 'success' })
    });
  },

  // ── 在聊天中探讨 ──────────────────────────────
  chatAboutIdiom() {
    const idiom = this.data.currentIdiom;
    wx.navigateTo({
      url: `/pages/chat/index?topic=${encodeURIComponent(`请详细讲述成语"${idiom}"的历史故事、文化内涵和现代应用`)}`
    });
  },

  // ── 探索每日成语详情 ──────────────────────────────
  lookupDailyIdiom() {
    const { dailyIdiom } = this.data;
    if (dailyIdiom && dailyIdiom.word) {
      this.lookupIdiomByWord(dailyIdiom.word);
    }
  },

  // ── 探索分类 ──────────────────────────────
  exploreCat(e) {
    const cat = e.currentTarget.dataset.cat;
    wx.navigateTo({
      url: `/pages/chat/index?topic=${encodeURIComponent(`请列举5个${cat.topic}，并分别解释含义和典故故事`)}`
    });
  }
});
