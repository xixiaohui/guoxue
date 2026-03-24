// pages/translate/index.js - 生产级古文翻译 v6.0（丰富内容，无AI问答跳转）
const api = require('../../utils/api');
const storage = require('../../utils/storage');
const monetize = require('../../utils/monetize');

Page({
  data: {
    mode: 'ancient_to_modern',
    inputText: '',
    result: '',
    sections: [],
    isLoading: false,
    history: [],
    charCount: 0,
    showTips: true,   // 展示翻译技巧卡片

    examples: {
      ancient_to_modern: [
        { text: '学而时习之，不亦说乎？', tag: '《论语》' },
        { text: '己所不欲，勿施于人。', tag: '《论语》' },
        { text: '天将降大任于是人也，必先苦其心志。', tag: '《孟子》' },
        { text: '不积跬步，无以至千里。', tag: '《荀子》' },
        { text: '知己知彼，百战不殆。', tag: '《孙子兵法》' },
        { text: '满招损，谦受益。', tag: '《尚书》' }
      ],
      modern_to_ancient: [
        { text: '我今天非常开心', tag: '日常' },
        { text: '努力学习才能成功', tag: '励志' },
        { text: '朋友之间要诚实守信', tag: '交友' },
        { text: '读书能让人明智开阔眼界', tag: '读书' },
        { text: '持之以恒方能成就大事', tag: '励志' },
        { text: '春天的景色真是美不胜收', tag: '自然' }
      ]
    },

    // 翻译技巧卡片
    tips: [
      { icon: '💡', title: '断句技巧', desc: '古文无标点，注意语气词"也、矣、哉、乎"作为断句标志' },
      { icon: '📖', title: '词类活用', desc: '古文中名词可做动词，形容词可做名词，注意灵活理解' },
      { icon: '🔤', title: '通假字', desc: '古文常有通假字，如"说"通"悦"，"知"通"智"' },
      { icon: '🎯', title: '文言虚词', desc: '"之、乎、者、也、而、以、于"是最常见的文言虚词' }
    ],

    // 经典名句分类展示
    classicGroups: [
      {
        id: 'confucius', name: '儒家经典', icon: '📚',
        quotes: [
          { text: '温故而知新，可以为师矣。', from: '《论语·为政》' },
          { text: '三人行，必有我师焉。', from: '《论语·述而》' },
          { text: '敏而好学，不耻下问。', from: '《论语·公冶长》' }
        ]
      },
      {
        id: 'taoism', name: '道家精华', icon: '☯️',
        quotes: [
          { text: '知人者智，自知者明。', from: '《道德经》' },
          { text: '上善若水，水善利万物而不争。', from: '《道德经》' },
          { text: '合抱之木，生于毫末；九层之台，起于累土。', from: '《道德经》' }
        ]
      },
      {
        id: 'poetry', name: '诗词名句', icon: '🌸',
        quotes: [
          { text: '大漠孤烟直，长河落日圆。', from: '王维《使至塞上》' },
          { text: '会当凌绝顶，一览众山小。', from: '杜甫《望岳》' },
          { text: '春风又绿江南岸，明月何时照我还。', from: '王安石《泊船瓜洲》' }
        ]
      }
    ]
  },

  onLoad() {
    this.setData({ history: storage.getTranslateHistory() });
    monetize.preloadRewardedAd();
    this._bannerAd = null;
    monetize.getQuotaStatus().then(s => {
      if (!s.isVip) {
        this._bannerAd = monetize.createBannerAd();
      }
    }).catch(() => {});
  },

  onShow() {
    this.setData({ history: storage.getTranslateHistory() });
  },

  onHide() {
    if (this._bannerAd) { try { this._bannerAd.hide(); } catch (e) {} }
  },

  onUnload() {
    if (this._bannerAd) { try { this._bannerAd.destroy(); } catch (e) {} }
  },

  switchMode(e) {
    const mode = e.currentTarget.dataset.mode;
    this.setData({ mode, inputText: '', result: '', sections: [], charCount: 0 });
  },

  onInput(e) {
    this.setData({ inputText: e.detail.value, charCount: e.detail.value.length });
  },

  clearInput() {
    this.setData({ inputText: '', result: '', sections: [], charCount: 0 });
  },

  useExample(e) {
    const text = e.currentTarget.dataset.text;
    this.setData({ inputText: text, charCount: text.length, result: '', sections: [] });
    wx.pageScrollTo({ scrollTop: 0, duration: 300 });
  },

  useClassicQuote(e) {
    const text = e.currentTarget.dataset.text;
    this.setData({
      inputText: text, charCount: text.length,
      result: '', sections: [],
      mode: 'ancient_to_modern'
    });
    wx.pageScrollTo({ scrollTop: 0, duration: 400 });
  },

  toggleTips() {
    this.setData({ showTips: !this.data.showTips });
  },

  // ── 核心：执行翻译（含配额检查）──────────────────────────────
  async doTranslate() {
    const text = this.data.inputText.trim();
    if (!text || this.data.isLoading) return;

    if (text.length > 800) {
      wx.showToast({ title: '内容过长，请控制在800字以内', icon: 'none', duration: 2000 });
      return;
    }

    let quotaResult;
    try {
      quotaResult = await monetize.consumeQuota();
    } catch (e) {
      quotaResult = { allowed: true, reason: 'fallback' };
    }

    if (!quotaResult.allowed) {
      const unlocked = await monetize.handleQuotaExceeded({
        onContinue: () => this._doTranslate(text)
      });
      if (!unlocked) return;
      this._doTranslate(text);
      return;
    }

    this._doTranslate(text);
  },

  async _doTranslate(text) {
    this.setData({ isLoading: true, result: '', sections: [] });
    wx.showNavigationBarLoading();

    try {
      const res = await api.translate(text, this.data.mode);
      const raw = res.result;
      const sections = this._parseSections(raw);
      this.setData({ result: raw, sections, isLoading: false });

      storage.addTranslateHistory({
        mode: this.data.mode,
        input: text,
        result: raw,
        sections
      });
      this.setData({ history: storage.getTranslateHistory() });

      wx.pageScrollTo({ selector: '.result-section', duration: 400 });
    } catch (e) {
      this.setData({ isLoading: false });
      api.showError(e.message);
    } finally {
      wx.hideNavigationBarLoading();
    }
  },

  _parseSections(text) {
    const sections = [];
    const re = /【([^】]+)】\s*([\s\S]*?)(?=【|$)/g;
    let m;
    while ((m = re.exec(text)) !== null) {
      const content = m[2].trim();
      if (content) {
        sections.push({ label: m[1], content });
      }
    }
    if (sections.length === 0) {
      sections.push({ label: '翻译结果', content: text.trim() });
    }
    return sections;
  },

  copyResult() {
    wx.setClipboardData({
      data: this.data.result,
      success: () => wx.showToast({ title: '已复制到剪贴板', icon: 'success', duration: 1500 })
    });
  },

  shareResult() {
    wx.showShareMenu({ withShareTicket: false, menus: ['shareAppMessage'] });
  },

  onShareAppMessage() {
    const { mode, inputText, result } = this.data;
    const modeText = mode === 'ancient_to_modern' ? '文言→白话' : '白话→文言';
    return {
      title: `国学助手 · ${modeText}翻译`,
      path: '/pages/translate/index',
      imageUrl: ''
    };
  },

  loadHistory(e) {
    const item = e.currentTarget.dataset.item;
    const sections = item.sections || this._parseSections(item.result || '');
    this.setData({
      mode: item.mode,
      inputText: item.input,
      result: item.result,
      sections,
      charCount: item.input.length
    });
    wx.pageScrollTo({ scrollTop: 0, duration: 300 });
  },

  clearHistory() {
    wx.showModal({
      title: '清除历史',
      content: '确定清除所有翻译记录？',
      confirmColor: '#8B2500',
      success: res => {
        if (res.confirm) {
          storage.clearTranslateHistory();
          this.setData({ history: [] });
          wx.showToast({ title: '已清除', icon: 'success' });
        }
      }
    });
  }
});
