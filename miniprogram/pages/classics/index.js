// pages/classics/index.js - 诗词典籍页（生产级，含变现闭环）
const api = require('../../utils/api');
const storage = require('../../utils/storage');
const monetize = require('../../utils/monetize');

Page({
  data: {
    searchText: '',
    searchResult: '',
    searchSections: [],  // 解析后的分段
    isSearching: false,
    activeTab: 'poem',
    showModal: false,
    currentPoem: {},
    poemLoading: false,
    isFavorited: false,

    tabs: [
      { id: 'poem', name: '诗词' },
      { id: 'classics', name: '典籍' },
      { id: 'tang', name: '唐诗' },
      { id: 'song', name: '宋词' },
      { id: 'yuan', name: '元曲' }
    ],

    featuredPoems: [
      {
        id: 1, title: '静夜思', author: '李白', dynasty: '唐',
        preview: '床前明月光，疑是地上霜',
        content: '床前明月光，疑是地上霜。\n举头望明月，低头思故乡。',
        color: 'linear-gradient(135deg, #667EEA, #764BA2)'
      },
      {
        id: 2, title: '水调歌头', author: '苏轼', dynasty: '宋',
        preview: '明月几时有，把酒问青天',
        content: '明月几时有，把酒问青天。不知天上宫阙，今夕是何年。\n我欲乘风归去，又恐琼楼玉宇，高处不胜寒。\n起舞弄清影，何似在人间。\n转朱阁，低绮户，照无眠。\n不应有恨，何事长向别时圆？\n人有悲欢离合，月有阴晴圆缺，此事古难全。\n但愿人长久，千里共婵娟。',
        color: 'linear-gradient(135deg, #F093FB, #F5576C)'
      },
      {
        id: 3, title: '登鹳雀楼', author: '王之涣', dynasty: '唐',
        preview: '白日依山尽，黄河入海流',
        content: '白日依山尽，黄河入海流。\n欲穷千里目，更上一层楼。',
        color: 'linear-gradient(135deg, #4FACFE, #00F2FE)'
      },
      {
        id: 4, title: '春晓', author: '孟浩然', dynasty: '唐',
        preview: '春眠不觉晓，处处闻啼鸟',
        content: '春眠不觉晓，处处闻啼鸟。\n夜来风雨声，花落知多少。',
        color: 'linear-gradient(135deg, #43E97B, #38F9D7)'
      }
    ],

    poems: [
      { id: 1, title: '望岳', author: '杜甫', dynasty: '唐', preview: '会当凌绝顶，一览众山小', content: '岱宗夫如何？齐鲁青未了。\n造化钟神秀，阴阳割昏晓。\n荡胸生曾云，决眦入归鸟。\n会当凌绝顶，一览众山小。' },
      { id: 2, title: '将进酒', author: '李白', dynasty: '唐', preview: '君不见黄河之水天上来', content: '君不见黄河之水天上来，奔流到海不复回。\n君不见高堂明镜悲白发，朝如青丝暮成雪。\n人生得意须尽欢，莫使金樽空对月...' },
      { id: 3, title: '青玉案·元夕', author: '辛弃疾', dynasty: '宋', preview: '众里寻他千百度，蓦然回首', content: '东风夜放花千树，更吹落、星如雨。宝马雕车香满路。凤箫声动，玉壶光转，一夜鱼龙舞。\n蛾儿雪柳黄金缕，笑语盈盈暗香去。众里寻他千百度，蓦然回首，那人却在，灯火阑珊处。' },
      { id: 4, title: '如梦令', author: '李清照', dynasty: '宋', preview: '常记溪亭日暮，沉醉不知归路', content: '常记溪亭日暮，沉醉不知归路。\n兴尽晚回舟，误入藕花深处。\n争渡，争渡，惊起一滩鸥鹭。' },
      { id: 5, title: '出塞', author: '王昌龄', dynasty: '唐', preview: '秦时明月汉时关，万里长征人未还', content: '秦时明月汉时关，万里长征人未还。\n但使龙城飞将在，不教胡马度阴山。' },
      { id: 6, title: '虞美人', author: '李煜', dynasty: '五代', preview: '问君能有几多愁，恰似一江春水向东流', content: '春花秋月何时了？往事知多少。小楼昨夜又东风，故国不堪回首月明中。\n雕栏玉砌应犹在，只是朱颜改。问君能有几多愁？恰似一江春水向东流。' },
      { id: 7, title: '锦瑟', author: '李商隐', dynasty: '唐', preview: '此情可待成追忆，只是当时已惘然', content: '锦瑟无端五十弦，一弦一柱思华年。\n庄生晓梦迷蝴蝶，望帝春心托杜鹃。\n沧海月明珠有泪，蓝田日暖玉生烟。\n此情可待成追忆？只是当时已惘然。' },
      { id: 8, title: '念奴娇·赤壁怀古', author: '苏轼', dynasty: '宋', preview: '大江东去，浪淘尽，千古风流人物', content: '大江东去，浪淘尽，千古风流人物。\n故垒西边，人道是，三国周郎赤壁。\n乱石穿空，惊涛拍岸，卷起千堆雪。\n江山如画，一时多少豪杰。\n遥想公瑾当年，小乔初嫁了，雄姿英发。\n羽扇纶巾，谈笑间，樯橹灰飞烟灭。\n故国神游，多情应笑我，早生华发。\n人生如梦，一尊还酹江月。' }
    ],

    classicBooks: [
      { id: 1, name: '论语', desc: '孔子及其弟子言行集', era: '春秋', icon: '📚', color: 'linear-gradient(135deg, #FF9A5C, #FF6B35)' },
      { id: 2, name: '道德经', desc: '老子的哲学著作', era: '春秋', icon: '☯️', color: 'linear-gradient(135deg, #67C5A5, #2E8B6A)' },
      { id: 3, name: '孙子兵法', desc: '古代军事经典', era: '春秋', icon: '⚔️', color: 'linear-gradient(135deg, #F7C948, #E8A710)' },
      { id: 4, name: '易经', desc: '中华文化的源头', era: '西周', icon: '☰', color: 'linear-gradient(135deg, #9B8FD5, #6B5BB5)' },
      { id: 5, name: '诗经', desc: '中国最早的诗歌总集', era: '西周', icon: '📜', color: 'linear-gradient(135deg, #FF8FA3, #E05070)' },
      { id: 6, name: '孟子', desc: '儒家经典著作', era: '战国', icon: '👁️', color: 'linear-gradient(135deg, #5BC8F5, #1A9ED5)' }
    ]
  },

  // ── 搜索 ──────────────────────────────
  onSearchInput(e) {
    this.setData({ searchText: e.detail.value });
  },

  async doSearch() {
    const text = this.data.searchText.trim();
    if (!text) return;

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
    this.setData({ isSearching: true, searchResult: '', searchSections: [] });
    try {
      const res = await api.analyzePoem(text);
      const raw = res.analysis || '';
      this.setData({
        searchResult: raw,
        searchSections: this._parseSections(raw),
        isSearching: false
      });
    } catch (e) {
      this.setData({ isSearching: false });
      api.showError(e.message || '搜索失败，请重试');
    }
  },

  closeSearch() {
    this.setData({ searchResult: '', searchSections: [], isSearching: false, searchText: '' });
  },

  // ── Tab切换 ──────────────────────────────
  switchTab(e) {
    this.setData({ activeTab: e.currentTarget.dataset.id });
  },

  // ── 打开诗词弹窗 ──────────────────────────────
  openPoem(e) {
    const poem = e.currentTarget.dataset.poem;
    const isFav = storage.isPoemFavorited(poem.title, poem.author);
    this.setData({ showModal: true, currentPoem: poem, poemLoading: false, isFavorited: isFav });
  },

  closeModal() {
    this.setData({ showModal: false, currentPoem: {} });
  },

  stopProp() {},

  // ── AI诗词赏析（含配额检查）──────────────────────────────
  async analyzePoem() {
    const poem = this.data.currentPoem;
    if (poem.analysis) return; // 已缓存
    if (this.data.poemLoading) return;

    let quotaResult;
    try {
      quotaResult = await monetize.consumeQuota();
    } catch (e) {
      quotaResult = { allowed: true, reason: 'fallback' };
    }

    if (!quotaResult.allowed) {
      const unlocked = await monetize.handleQuotaExceeded({
        onContinue: () => this._doAnalyzePoem(poem)
      });
      if (!unlocked) return;
      this._doAnalyzePoem(poem);
      return;
    }
    this._doAnalyzePoem(poem);
  },

  async _doAnalyzePoem(poem) {
    this.setData({ poemLoading: true });
    try {
      const res = await api.analyzePoem(`${poem.title} - ${poem.author}\n${poem.content}`);
      const updatedPoem = { ...poem, analysis: res.analysis };
      this.setData({ currentPoem: updatedPoem, poemLoading: false });
    } catch (e) {
      this.setData({ poemLoading: false });
      api.showError(e.message || 'AI赏析失败');
    }
  },

  // ── 收藏/取消收藏 ──────────────────────────────
  toggleFavoritePoem() {
    const poem = this.data.currentPoem;
    if (!poem.title) return;
    const isFav = storage.toggleFavoritePoem(poem);
    this.setData({ isFavorited: isFav });
    wx.showToast({ title: isFav ? '已收藏' : '已取消收藏', icon: 'success', duration: 1200 });
  },

  // ── 跳转聊天继续探讨 ──────────────────────────────
  askAboutPoem() {
    const poem = this.data.currentPoem;
    this.setData({ showModal: false });
    wx.navigateTo({
      url: `/pages/chat/index?topic=${encodeURIComponent(`请详细讲解"${poem.title}"这首诗，包括创作背景、逐句注释和意境分析`)}`
    });
  },

  continueInChat() {
    const query = this.data.searchText;
    wx.navigateTo({
      url: `/pages/chat/index?topic=${encodeURIComponent(query)}`
    });
  },

  copySearchResult() {
    wx.setClipboardData({
      data: this.data.searchResult,
      success: () => wx.showToast({ title: '已复制', icon: 'success' })
    });
  },

  // ── 打开典籍 ──────────────────────────────
  openClassic(e) {
    const book = e.currentTarget.dataset.book;
    wx.navigateTo({
      url: `/pages/chat/index?topic=${encodeURIComponent(`请介绍《${book.name}》的主要内容、核心思想和历史价值，并引用其中经典段落`)}`
    });
  },

  // ── 分段解析 ──────────────────────────────
  _parseSections(text) {
    const sections = [];
    const re = /【([^】]+)】\s*([\s\S]*?)(?=【|$)/g;
    let m;
    while ((m = re.exec(text)) !== null) {
      const content = m[2].trim();
      if (content) sections.push({ label: m[1], content });
    }
    if (sections.length === 0 && text.trim()) {
      sections.push({ label: 'AI解析', content: text.trim() });
    }
    return sections;
  }
});
