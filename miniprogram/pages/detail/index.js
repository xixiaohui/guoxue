// pages/detail/index.js - 通用详情页（生产级，含变现闭环）
const api = require('../../utils/api');
const monetize = require('../../utils/monetize');

Page({
  data: {
    title: '',
    content: '',
    category: '',    // poem | idiom | history | classic
    isLoading: false,
    aiContent: '',   // AI 深度解析内容
    aiSections: [],  // 解析后的分段
  },

  onLoad(options) {
    const title = decodeURIComponent(options.title || '');
    const content = decodeURIComponent(options.content || '');
    const category = options.category || '';

    this.setData({ title, content, category });

    // Banner广告（非VIP）
    monetize.getQuotaStatus().then(s => {
      if (!s.isVip) {
        this._bannerAd = monetize.createBannerAd();
      }
    }).catch(() => {});

    // 若有内容且有分类，自动请求 AI 赏析
    if (content && category) {
      this._loadAiContent(title, content, category);
    }
  },

  onUnload() {
    if (this._bannerAd) { try { this._bannerAd.destroy(); } catch (e) {} }
  },

  // ── 加载 AI 内容 ──────────────────────────────
  async _loadAiContent(title, content, category) {
    this.setData({ isLoading: true });

    try {
      let res;
      if (category === 'poem') {
        res = await api.analyzePoem(`${title}\n${content}`);
        const raw = res.analysis || '';
        this.setData({
          aiContent: raw,
          aiSections: this._parseSections(raw),
          isLoading: false
        });
      } else if (category === 'idiom') {
        res = await api.explainIdiom(title);
        const raw = res.explanation || '';
        this.setData({
          aiContent: raw,
          aiSections: this._parseSections(raw),
          isLoading: false
        });
      } else if (category === 'history') {
        res = await api.queryHistory(title);
        const raw = res.content || '';
        this.setData({
          aiContent: raw,
          aiSections: this._parseSections(raw),
          isLoading: false
        });
      } else {
        this.setData({ isLoading: false });
      }
    } catch (e) {
      this.setData({ isLoading: false });
      console.error('[Detail] AI load error:', e);
    }
  },

  // ── 复制内容 ──────────────────────────────
  copyContent() {
    const text = this.data.aiContent || this.data.content;
    wx.setClipboardData({
      data: text,
      success: () => wx.showToast({ title: '已复制', icon: 'success' })
    });
  },

  // ── 继续探讨 ──────────────────────────────
  continueInChat() {
    const { title, content } = this.data;
    const topic = content
      ? `请深入讲解"${title}"：${content.substring(0, 80)}`
      : title;
    wx.navigateTo({
      url: `/pages/chat/index?topic=${encodeURIComponent(topic)}`
    });
  },

  // ── 分享 ──────────────────────────────
  onShareAppMessage() {
    return {
      title: this.data.title || '国学AI助手',
      path: '/pages/home/index'
    };
  },

  // ── 工具 ──────────────────────────────
  _parseSections(text) {
    const sections = [];
    const re = /【([^】]+)】\s*([\s\S]*?)(?=【|$)/g;
    let m;
    while ((m = re.exec(text)) !== null) {
      const content = m[2].trim();
      if (content) sections.push({ label: m[1], content });
    }
    if (sections.length === 0 && text.trim()) {
      sections.push({ label: 'AI解读', content: text.trim() });
    }
    return sections;
  }
});
