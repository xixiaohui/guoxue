// pages/philosophers/index.js - 诸子百家页 v6.0（全新页面，生产级）
const api = require('../../utils/api');
const monetize = require('../../utils/monetize');

Page({
  data: {
    searchText: '',
    aiResult: '',
    aiResultSections: [],
    isLoading: false,
    currentQuery: '',
    activeSchool: null,  // 当前选中学派
    showSchoolModal: false,

    // 主要学派
    schools: [
      {
        id: 'confucianism', name: '儒家', emoji: '📚',
        color: 'linear-gradient(135deg,#FF9A5C,#E05820)',
        founder: '孔子', period: '春秋',
        core: '仁、义、礼、智、信',
        desc: '以"仁"为核心，强调道德修养、礼乐制度和君臣父子之伦，是中国传统社会主流思想。',
        masterWorks: ['《论语》', '《孟子》', '《大学》', '《中庸》'],
        keyQuotes: [
          { text: '学而时习之，不亦说乎？', author: '孔子《论语》' },
          { text: '仁者爱人。', author: '孔子《论语》' },
          { text: '穷则独善其身，达则兼善天下。', author: '孟子《尽心上》' }
        ],
        representatives: ['孔子', '孟子', '荀子', '曾子', '子思']
      },
      {
        id: 'taoism', name: '道家', emoji: '☯️',
        color: 'linear-gradient(135deg,#43E97B,#38F9D7)',
        founder: '老子', period: '春秋',
        core: '道法自然、无为而治',
        desc: '以"道"为核心，主张顺应自然、无为而治，强调个体精神自由与天地和谐。',
        masterWorks: ['《道德经》', '《庄子》', '《列子》'],
        keyQuotes: [
          { text: '道可道，非常道。', author: '老子《道德经》' },
          { text: '上善若水，水善利万物而不争。', author: '老子《道德经》' },
          { text: '逍遥游。', author: '庄子《逍遥游》' }
        ],
        representatives: ['老子', '庄子', '列子', '关尹子']
      },
      {
        id: 'legalism', name: '法家', emoji: '⚖️',
        color: 'linear-gradient(135deg,#9B8FD5,#6B5BB5)',
        founder: '商鞅/韩非', period: '战国',
        core: '法、术、势三位一体',
        desc: '强调以法治国，君主以法律控制臣民，重视农战，反对礼教，是秦统一六国的理论基础。',
        masterWorks: ['《韩非子》', '《商君书》', '《管子》'],
        keyQuotes: [
          { text: '法者，编著之图籍，设之于官府，而布之于百姓者也。', author: '韩非子' },
          { text: '世异则事异，事异则备变。', author: '韩非子' },
          { text: '不期修古，不法常可。', author: '商鞅' }
        ],
        representatives: ['商鞅', '韩非', '李斯', '申不害', '慎到']
      },
      {
        id: 'mohism', name: '墨家', emoji: '🔨',
        color: 'linear-gradient(135deg,#5BC8F5,#1A9ED5)',
        founder: '墨子', period: '战国',
        core: '兼爱、非攻、尚贤',
        desc: '主张兼爱非攻，反对战争，提倡节俭，注重逻辑思维，代表了手工业者和小生产者的利益。',
        masterWorks: ['《墨子》'],
        keyQuotes: [
          { text: '兼相爱，交相利。', author: '墨子' },
          { text: '非攻。', author: '墨子' },
          { text: '尚贤者，政之本也。', author: '墨子' }
        ],
        representatives: ['墨子', '禽滑釐']
      },
      {
        id: 'strategy', name: '兵家', emoji: '⚔️',
        color: 'linear-gradient(135deg,#F7C948,#C48A10)',
        founder: '孙武', period: '春秋',
        core: '知己知彼，百战不殆',
        desc: '研究战争规律和军事策略，以孙子兵法为代表，其哲学思想超越军事范畴，影响现代管理。',
        masterWorks: ['《孙子兵法》', '《吴子兵法》', '《孙膑兵法》'],
        keyQuotes: [
          { text: '知己知彼，百战不殆。', author: '孙子《孙子兵法》' },
          { text: '兵者，诡道也。', author: '孙子' },
          { text: '不战而屈人之兵，善之善者也。', author: '孙子' }
        ],
        representatives: ['孙武', '吴起', '孙膑', '尉缭']
      },
      {
        id: 'miscellaneous', name: '杂家', emoji: '🌟',
        color: 'linear-gradient(135deg,#FF8FA3,#C03060)',
        founder: '吕不韦等', period: '战国',
        core: '博采众家，综合融通',
        desc: '兼采儒、道、法、墨、名诸家之长，著《吕氏春秋》，代表了学术综合与融汇的努力。',
        masterWorks: ['《吕氏春秋》', '《淮南子》'],
        keyQuotes: [
          { text: '万物各得其所。', author: '《吕氏春秋》' },
          { text: '不以物喜，不以己悲。', author: '《岳阳楼记》引申' }
        ],
        representatives: ['吕不韦', '刘安']
      }
    ],

    // 诸子名言
    masterQuotes: [
      { school: '儒', text: '吾日三省吾身：为人谋而不忠乎？与朋友交而不信乎？传不习乎？', author: '曾子', color: '#E05820' },
      { school: '道', text: '知足者富，强行者有志。', author: '老子《道德经》', color: '#38F9D7' },
      { school: '法', text: '法不阿贵，绳不挠曲。', author: '韩非子', color: '#6B5BB5' },
      { school: '墨', text: '视人之国若视其国，视人之家若视其家，视人之身若视其身。', author: '墨子', color: '#1A9ED5' },
      { school: '兵', text: '上兵伐谋，其次伐交，其次伐兵，其下攻城。', author: '孙子', color: '#C48A10' },
      { school: '儒', text: '生于忧患，死于安乐。', author: '孟子', color: '#E05820' },
      { school: '道', text: '为学日益，为道日损，损之又损，以至于无为。', author: '老子《道德经》', color: '#38F9D7' },
      { school: '兵', text: '攻城为下，攻心为上。', author: '孙子', color: '#C48A10' }
    ],

    // 学派比较
    comparison: [
      { aspect: '核心主张', confucianism: '仁义礼智', taoism: '自然无为', legalism: '法术势', mohism: '兼爱非攻' },
      { aspect: '治国理念', confucianism: '德治礼治', taoism: '无为而治', legalism: '法治', mohism: '尚贤节用' },
      { aspect: '人性观', confucianism: '性善论', taoism: '顺应自然', legalism: '性恶论', mohism: '人性平等' }
    ]
  },

  onLoad() {
    monetize.preloadRewardedAd();
  },

  // ── 搜索 ──────────────────────────────
  onSearchInput(e) {
    this.setData({ searchText: e.detail.value });
  },

  async doSearch() {
    const text = this.data.searchText.trim();
    if (!text || this.data.isLoading) return;

    let quotaResult;
    try {
      quotaResult = await monetize.consumeQuota();
    } catch (e) {
      quotaResult = { allowed: true, reason: 'fallback' };
    }

    if (!quotaResult.allowed) {
      const unlocked = await monetize.handleQuotaExceeded({
        onContinue: () => this._doSearch(text)
      });
      if (!unlocked) return;
      this._doSearch(text);
      return;
    }
    this._doSearch(text);
  },

  async _doSearch(text) {
    this.setData({ isLoading: true, aiResult: '', aiResultSections: [], currentQuery: text });
    try {
      const res = await api.queryHistory(`诸子百家：${text}`);
      const sections = this._parseSections(res.content);
      this.setData({ aiResult: res.content, aiResultSections: sections, isLoading: false });
      wx.pageScrollTo({ selector: '.ai-result-section', duration: 400 });
    } catch (e) {
      this.setData({ isLoading: false });
      api.showError(e.message || '查询失败，请重试');
    }
  },

  closeResult() {
    this.setData({ aiResult: '', aiResultSections: [], currentQuery: '' });
  },

  copyResult() {
    wx.setClipboardData({
      data: this.data.aiResult,
      success: () => wx.showToast({ title: '已复制', icon: 'success' })
    });
  },

  // ── 打开学派详情 ──────────────────────────────
  openSchool(e) {
    const school = e.currentTarget.dataset.school;
    this.setData({ activeSchool: school, showSchoolModal: true });
  },

  closeModal() {
    this.setData({ showSchoolModal: false, activeSchool: null });
  },

  stopProp() {},

  // ── AI深度解析学派 ──────────────────────────────
  async analyzeSchool() {
    const school = this.data.activeSchool;
    if (!school || this.data.isLoading) return;

    let quotaResult;
    try {
      quotaResult = await monetize.consumeQuota();
    } catch (e) {
      quotaResult = { allowed: true, reason: 'fallback' };
    }

    if (!quotaResult.allowed) {
      const unlocked = await monetize.handleQuotaExceeded({
        onContinue: () => this._analyzeSchool(school)
      });
      if (!unlocked) return;
      this._analyzeSchool(school);
      return;
    }
    this._analyzeSchool(school);
  },

  async _analyzeSchool(school) {
    const query = `请详细介绍${school.name}的核心思想、主要代表人物、代表著作和历史影响`;
    this.setData({ isLoading: true, closeSchoolModal: false });
    this.closeModal();

    this.setData({ aiResult: '', aiResultSections: [], currentQuery: query });
    try {
      const res = await api.queryHistory(query);
      const sections = this._parseSections(res.content);
      this.setData({ aiResult: res.content, aiResultSections: sections, isLoading: false });
      wx.pageScrollTo({ selector: '.ai-result-section', duration: 400 });
    } catch (e) {
      this.setData({ isLoading: false });
      api.showError(e.message || '分析失败，请重试');
    }
  },

  // ── 查询名言 ──────────────────────────────
  async exploreQuote(e) {
    const quote = e.currentTarget.dataset.quote;
    const query = `请解读"${quote.text}"（${quote.author}）的含义、背景和现代启示`;
    this.setData({ isLoading: true, aiResult: '', aiResultSections: [], currentQuery: query });
    try {
      const res = await api.queryHistory(query);
      const sections = this._parseSections(res.content);
      this.setData({ aiResult: res.content, aiResultSections: sections, isLoading: false });
      wx.pageScrollTo({ selector: '.ai-result-section', duration: 400 });
    } catch (e) {
      this.setData({ isLoading: false });
    }
  },

  // ── 分段解析 ──────────────────────────────
  _parseSections(text) {
    if (!text) return [];
    const sections = [];
    const re = /【([^】]+)】\s*([\s\S]*?)(?=【|$)/g;
    let m;
    while ((m = re.exec(text)) !== null) {
      const content = m[2].trim();
      if (content) sections.push({ label: m[1], content });
    }
    if (sections.length === 0 && text.trim()) {
      sections.push({ label: '详细解析', content: text.trim() });
    }
    return sections;
  }
});
