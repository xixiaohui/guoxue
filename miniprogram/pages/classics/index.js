// pages/classics/index.js - 诗词典籍页 v6.0（生产级，丰富内容）
const api = require('../../utils/api');
const storage = require('../../utils/storage');
const monetize = require('../../utils/monetize');

Page({
  data: {
    searchText: '',
    searchResult: '',
    searchSections: [],
    isSearching: false,
    activeTab: 'poem',
    showModal: false,
    currentPoem: {},
    poemLoading: false,
    isFavorited: false,

    tabs: [
      { id: 'poem',     name: '精选诗词', icon: '📜' },
      { id: 'classics', name: '经典典籍', icon: '📚' },
      { id: 'tang',     name: '唐诗',     icon: '🌙' },
      { id: 'song',     name: '宋词',     icon: '🍃' },
      { id: 'yuan',     name: '元曲',     icon: '🎭' }
    ],

    featuredPoems: [
      {
        id: 1, title: '静夜思', author: '李白', dynasty: '唐',
        preview: '床前明月光，疑是地上霜',
        content: '床前明月光，疑是地上霜。\n举头望明月，低头思故乡。',
        color: 'linear-gradient(135deg, #667EEA, #764BA2)',
        desc: '千古思乡第一诗'
      },
      {
        id: 2, title: '水调歌头', author: '苏轼', dynasty: '宋',
        preview: '明月几时有，把酒问青天',
        content: '明月几时有，把酒问青天。不知天上宫阙，今夕是何年。\n我欲乘风归去，又恐琼楼玉宇，高处不胜寒。\n起舞弄清影，何似在人间。\n转朱阁，低绮户，照无眠。\n不应有恨，何事长向别时圆？\n人有悲欢离合，月有阴晴圆缺，此事古难全。\n但愿人长久，千里共婵娟。',
        color: 'linear-gradient(135deg, #F093FB, #F5576C)',
        desc: '中秋词之绝唱'
      },
      {
        id: 3, title: '登鹳雀楼', author: '王之涣', dynasty: '唐',
        preview: '白日依山尽，黄河入海流',
        content: '白日依山尽，黄河入海流。\n欲穷千里目，更上一层楼。',
        color: 'linear-gradient(135deg, #4FACFE, #00F2FE)',
        desc: '励志名篇'
      },
      {
        id: 4, title: '春晓', author: '孟浩然', dynasty: '唐',
        preview: '春眠不觉晓，处处闻啼鸟',
        content: '春眠不觉晓，处处闻啼鸟。\n夜来风雨声，花落知多少。',
        color: 'linear-gradient(135deg, #43E97B, #38F9D7)',
        desc: '春日意境之作'
      }
    ],

    poems: [
      { id: 1, title: '望岳', author: '杜甫', dynasty: '唐', preview: '会当凌绝顶，一览众山小', content: '岱宗夫如何？齐鲁青未了。\n造化钟神秀，阴阳割昏晓。\n荡胸生曾云，决眦入归鸟。\n会当凌绝顶，一览众山小。' },
      { id: 2, title: '将进酒', author: '李白', dynasty: '唐', preview: '君不见黄河之水天上来', content: '君不见黄河之水天上来，奔流到海不复回。\n君不见高堂明镜悲白发，朝如青丝暮成雪。\n人生得意须尽欢，莫使金樽空对月。\n天生我材必有用，千金散尽还复来。' },
      { id: 3, title: '青玉案·元夕', author: '辛弃疾', dynasty: '宋', preview: '众里寻他千百度，蓦然回首', content: '东风夜放花千树，更吹落、星如雨。宝马雕车香满路。凤箫声动，玉壶光转，一夜鱼龙舞。\n蛾儿雪柳黄金缕，笑语盈盈暗香去。众里寻他千百度，蓦然回首，那人却在，灯火阑珊处。' },
      { id: 4, title: '如梦令', author: '李清照', dynasty: '宋', preview: '常记溪亭日暮，沉醉不知归路', content: '常记溪亭日暮，沉醉不知归路。\n兴尽晚回舟，误入藕花深处。\n争渡，争渡，惊起一滩鸥鹭。' },
      { id: 5, title: '出塞', author: '王昌龄', dynasty: '唐', preview: '秦时明月汉时关，万里长征人未还', content: '秦时明月汉时关，万里长征人未还。\n但使龙城飞将在，不教胡马度阴山。' },
      { id: 6, title: '虞美人', author: '李煜', dynasty: '五代', preview: '问君能有几多愁，恰似一江春水向东流', content: '春花秋月何时了？往事知多少。小楼昨夜又东风，故国不堪回首月明中。\n雕栏玉砌应犹在，只是朱颜改。问君能有几多愁？恰似一江春水向东流。' },
      { id: 7, title: '锦瑟', author: '李商隐', dynasty: '唐', preview: '此情可待成追忆，只是当时已惘然', content: '锦瑟无端五十弦，一弦一柱思华年。\n庄生晓梦迷蝴蝶，望帝春心托杜鹃。\n沧海月明珠有泪，蓝田日暖玉生烟。\n此情可待成追忆？只是当时已惘然。' },
      { id: 8, title: '念奴娇·赤壁怀古', author: '苏轼', dynasty: '宋', preview: '大江东去，浪淘尽，千古风流人物', content: '大江东去，浪淘尽，千古风流人物。\n故垒西边，人道是，三国周郎赤壁。\n乱石穿空，惊涛拍岸，卷起千堆雪。\n江山如画，一时多少豪杰。\n遥想公瑾当年，小乔初嫁了，雄姿英发。\n羽扇纶巾，谈笑间，樯橹灰飞烟灭。\n故国神游，多情应笑我，早生华发。\n人生如梦，一尊还酹江月。' },
      { id: 9, title: '声声慢', author: '李清照', dynasty: '宋', preview: '寻寻觅觅，冷冷清清，凄凄惨惨戚戚', content: '寻寻觅觅，冷冷清清，凄凄惨惨戚戚。\n乍暖还寒时候，最难将息。\n三杯两盏淡酒，怎敌他晚来风急！\n雁过也，正伤心，却是旧时相识。' },
      { id: 10, title: '满江红·怒发冲冠', author: '岳飞', dynasty: '宋', preview: '怒发冲冠，凭栏处，潇潇雨歇', content: '怒发冲冠，凭栏处，潇潇雨歇。\n抬望眼、仰天长啸，壮怀激烈。\n三十功名尘与土，八千里路云和月。\n莫等闲、白了少年头，空悲切。\n靖康耻，犹未雪。臣子恨，何时灭！\n驾长车踏破、贺兰山缺。\n壮志饥餐胡虏肉，笑谈渴饮匈奴血。\n待从头、收拾旧山河，朝天阙。' }
    ],

    classicBooks: [
      { id: 1, name: '论语', desc: '孔子及弟子言行，儒家思想核心', era: '春秋', icon: '📚', color: 'linear-gradient(135deg, #FF9A5C, #FF6B35)', highlights: ['学而时习之', '己所不欲，勿施于人', '三人行，必有我师'] },
      { id: 2, name: '道德经', desc: '老子哲学著作，道家思想源流', era: '春秋', icon: '☯️', color: 'linear-gradient(135deg, #67C5A5, #2E8B6A)', highlights: ['道可道，非常道', '上善若水', '知足者富'] },
      { id: 3, name: '孙子兵法', desc: '兵家圣典，古代军事谋略精华', era: '春秋', icon: '⚔️', color: 'linear-gradient(135deg, #F7C948, #E8A710)', highlights: ['知己知彼，百战不殆', '兵者，诡道也', '不战而屈人之兵'] },
      { id: 4, name: '易经', desc: '群经之首，中华文化的源头', era: '西周', icon: '☰', color: 'linear-gradient(135deg, #9B8FD5, #6B5BB5)', highlights: ['天行健，君子以自强不息', '厚德载物', '变则通，通则久'] },
      { id: 5, name: '诗经', desc: '最早诗歌总集，风雅颂三部', era: '西周', icon: '📜', color: 'linear-gradient(135deg, #FF8FA3, #E05070)', highlights: ['关关雎鸠，在河之洲', '青青子衿，悠悠我心', '蒹葭苍苍，白露为霜'] },
      { id: 6, name: '孟子', desc: '儒家经典，仁政民本思想', era: '战国', icon: '👁️', color: 'linear-gradient(135deg, #5BC8F5, #1A9ED5)', highlights: ['民为贵，社稷次之，君为轻', '得道多助，失道寡助', '生于忧患，死于安乐'] },
      { id: 7, name: '庄子', desc: '道家哲学，逍遥自在精神', era: '战国', icon: '🦋', color: 'linear-gradient(135deg, #43E97B, #38F9D7)', highlights: ['逍遥游', '庄周梦蝶', '相濡以沫，不如相忘于江湖'] },
      { id: 8, name: '史记', desc: '中国第一部纪传体通史', era: '汉代', icon: '📰', color: 'linear-gradient(135deg, #667EEA, #764BA2)', highlights: ['究天人之际', '通古今之变', '成一家之言'] }
    ],

    tangPoems: [
      { id: 1, title: '春江花月夜', author: '张若虚', preview: '春江潮水连海平，海上明月共潮生', dynasty: '唐' },
      { id: 2, title: '登高', author: '杜甫', preview: '无边落木萧萧下，不尽长江滚滚来', dynasty: '唐' },
      { id: 3, title: '琵琶行', author: '白居易', preview: '大弦嘈嘈如急雨，小弦切切如私语', dynasty: '唐' },
      { id: 4, title: '送别', author: '王维', preview: '劝君更尽一杯酒，西出阳关无故人', dynasty: '唐' },
      { id: 5, title: '早发白帝城', author: '李白', preview: '朝辞白帝彩云间，千里江陵一日还', dynasty: '唐' },
      { id: 6, title: '黄鹤楼', author: '崔颢', preview: '日暮乡关何处是，烟波江上使人愁', dynasty: '唐' }
    ],

    songCi: [
      { id: 1, title: '雨霖铃·寒蝉凄切', author: '柳永', preview: '多情自古伤离别，更那堪冷落清秋节', dynasty: '宋' },
      { id: 2, title: '蝶恋花·春景', author: '苏轼', preview: '枝上柳绵吹又少，天涯何处无芳草', dynasty: '宋' },
      { id: 3, title: '鹊桥仙', author: '秦观', preview: '两情若是久长时，又岂在朝朝暮暮', dynasty: '宋' },
      { id: 4, title: '破阵子', author: '辛弃疾', preview: '了却君王天下事，赢得生前身后名', dynasty: '宋' },
      { id: 5, title: '一剪梅', author: '李清照', preview: '此情无计可消除，才下眉头，却上心头', dynasty: '宋' },
      { id: 6, title: '虞美人', author: '李煜', preview: '问君能有几多愁，恰似一江春水向东流', dynasty: '宋' }
    ],

    yuanQu: [
      { id: 1, title: '天净沙·秋思', author: '马致远', preview: '夕阳西下，断肠人在天涯', dynasty: '元' },
      { id: 2, title: '山坡羊·潼关怀古', author: '张养浩', preview: '兴，百姓苦；亡，百姓苦', dynasty: '元' },
      { id: 3, title: '越调·天净沙', author: '白朴', preview: '孤村落日残霞，轻烟老树寒鸦', dynasty: '元' },
      { id: 4, title: '朝天子·咏喇叭', author: '王磐', preview: '喇叭，锁哪，曲儿小，腔儿大', dynasty: '元' }
    ]
  },

  onLoad() {
    monetize.preloadRewardedAd();
    monetize.getQuotaStatus().then(s => {
      if (!s.isVip) this._bannerAd = monetize.createBannerAd();
    }).catch(() => {});
  },

  onUnload() {
    if (this._bannerAd) { try { this._bannerAd.destroy(); } catch (e) {} }
  },

  // ── 搜索 ──────────────────────────────
  onSearchInput(e) {
    this.setData({ searchText: e.detail.value });
  },

  async doSearch() {
    const text = this.data.searchText.trim();
    if (!text || this.data.isSearching) return;

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
      wx.pageScrollTo({ selector: '.search-result-section', duration: 400 });
    } catch (e) {
      this.setData({ isSearching: false });
      api.showError(e.message || '搜索失败，请重试');
    }
  },

  closeSearch() {
    this.setData({ searchResult: '', searchSections: [], isSearching: false, searchText: '' });
  },

  copySearchResult() {
    wx.setClipboardData({
      data: this.data.searchResult,
      success: () => wx.showToast({ title: '已复制', icon: 'success' })
    });
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

  // ── AI诗词赏析 ──────────────────────────────
  async analyzePoem() {
    const poem = this.data.currentPoem;
    if (poem.analysis) return;
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

  // ── 打开典籍（在当前页展示介绍或跳翻译） ──────────────────────────────
  openClassic(e) {
    const book = e.currentTarget.dataset.book;
    // 显示典籍简介弹窗
    this.setData({
      showModal: true,
      currentPoem: {
        title: book.name,
        author: `${book.era}·${book.icon}`,
        dynasty: book.era,
        content: `${book.desc}\n\n经典名句：\n${(book.highlights || []).join('\n')}`
      },
      poemLoading: false,
      isFavorited: false
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
  },

  // ── 分享 ──────────────────────────────
  onShareAppMessage() {
    const p = this.data.currentPoem;
    return {
      title: p && p.title ? `《${p.title}》—— ${p.author || ''}` : '诗词典籍 · 国学助手',
      path:  '/pages/classics/index',
    };
  },
  onShareTimeline() {
    const p = this.data.currentPoem;
    return {
      title: p && p.title ? `《${p.title}》—— ${p.author || ''}` : '诗词典籍 · 传承经典之美',
      query: 'from=timeline',
    };
  }
});
