// pages/translate/index.js - 生产级古文翻译（含变现闭环）
const api = require('../../utils/api');
const storage = require('../../utils/storage');
const monetize = require('../../utils/monetize');

Page({
  data: {
    mode: 'ancient_to_modern',
    inputText: '',
    result: '',      // 翻译结果（原始）
    sections: [],    // 解析后的分段 [{label, content}]
    isLoading: false,
    history: [],
    charCount: 0,
    examples: {
      ancient_to_modern: [
        '学而时习之，不亦说乎？',
        '己所不欲，勿施于人。',
        '温故而知新，可以为师矣。',
        '三人行，必有我师焉。',
        '知之为知之，不知为不知，是知也。'
      ],
      modern_to_ancient: [
        '我今天很开心',
        '努力学习才能成功',
        '朋友之间要诚实守信',
        '读书能让人明智',
        '持之以恒方能成就大事'
      ]
    }
  },

  onLoad() {
    this.setData({ history: storage.getTranslateHistory() });
    monetize.preloadRewardedAd();
    // 预加载Banner广告（非VIP）
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
    this.setData({ inputText: text, charCount: text.length });
  },

  // ── 核心：执行翻译（含配额检查）──────────────────────────────
  async doTranslate() {
    const text = this.data.inputText.trim();
    if (!text || this.data.isLoading) return;

    if (text.length > 800) {
      wx.showToast({ title: '内容过长，请控制在800字以内', icon: 'none' });
      return;
    }

    // ① 配额检查
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

      // 保存历史
      storage.addTranslateHistory({
        mode: this.data.mode,
        input: text,
        result: raw,
        sections
      });
      this.setData({ history: storage.getTranslateHistory() });

      // 滚动到结果
      wx.pageScrollTo({ selector: '.result-section', duration: 300 });
    } catch (e) {
      this.setData({ isLoading: false });
      api.showError(e.message);
    } finally {
      wx.hideNavigationBarLoading();
    }
  },

  // 将 AI 返回的分段文本解析为结构化数据
  _parseSections(text) {
    const sections = [];
    // 匹配 【标题】 格式的分段
    const re = /【([^】]+)】\s*([\s\S]*?)(?=【|$)/g;
    let m;
    while ((m = re.exec(text)) !== null) {
      const content = m[2].trim();
      if (content) {
        sections.push({ label: m[1], content });
      }
    }
    // 若没有识别到分段，整体作为一段
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
    return {
      title: `国学AI助手 · ${this.data.mode === 'ancient_to_modern' ? '文言→白话' : '白话→文言'}`,
      path: '/pages/translate/index'
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
        }
      }
    });
  },

  // ── 跳转聊天页深入探讨 ────────────────────────────────────────
  chatAboutTranslation() {
    const { inputText, mode } = this.data;
    if (!inputText) return;
    const topic = mode === 'ancient_to_modern'
      ? `请帮我深入理解这段文言文的文化内涵：${inputText}`
      : `我把这段现代文改写成了文言文风格，请帮我点评和改进`;
    wx.navigateTo({
      url: `/pages/chat/index?topic=${encodeURIComponent(topic)}`
    });
  }
});
