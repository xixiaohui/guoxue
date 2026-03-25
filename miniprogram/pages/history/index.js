// pages/history/index.js - 历史探秘页 v6.0（生产级，无AI问答跳转）
const api = require('../../utils/api');
const monetize = require('../../utils/monetize');

Page({
  data: {
    searchText: '',
    aiResult: '',
    aiResultSections: [],
    isLoading: false,
    activeDynasty: 'tang',
    activeTitle: '唐宋',
    currentQuery: '',

    dynasties: [
      { id: 'xia',    name: '夏商周', years: '前2070-前221', emoji: '🏺' },
      { id: 'qin',    name: '秦汉',   years: '前221-220',    emoji: '🏯' },
      { id: 'weijin', name: '魏晋',   years: '220-589',      emoji: '📜' },
      { id: 'sui',    name: '隋唐',   years: '581-907',      emoji: '🌸' },
      { id: 'tang',   name: '唐宋',   years: '618-1279',     emoji: '🌙' },
      { id: 'yuan',   name: '元明',   years: '1271-1644',    emoji: '🐉' },
      { id: 'qing',   name: '清代',   years: '1636-1912',    emoji: '👑' }
    ],

    // 预置朝代事件数据
    dynastyEvents: {
      tang: [
        { id: 1, year: '618年', name: '唐朝建立', desc: '李渊称帝，建立唐朝，定都长安，开启华夏盛世', color: '#FF6B35', figures: ['李渊', '李世民'] },
        { id: 2, year: '627年', name: '贞观之治', desc: '唐太宗励精图治，政治清明，国力强盛，万邦来朝', color: '#C4882E', figures: ['李世民', '魏征', '房玄龄'] },
        { id: 3, year: '690年', name: '武则天称帝', desc: '中国历史上唯一正式称帝的女皇帝，建立武周政权', color: '#9B8FD5', figures: ['武则天'] },
        { id: 4, year: '712年', name: '开元盛世', desc: '唐玄宗前期励精图治，唐朝国力达到鼎盛，史称"开元之治"', color: '#43E97B', figures: ['唐玄宗', '姚崇', '宋璟'] },
        { id: 5, year: '755年', name: '安史之乱', desc: '安禄山、史思明发动叛乱，唐朝由盛转衰，文明黯淡', color: '#FF8FA3', figures: ['安禄山', '史思明', '杜甫'] },
        { id: 6, year: '907年', name: '唐朝灭亡', desc: '朱温称帝建梁，唐朝终结，历时289年，五代十国开始', color: '#8C7B61', figures: ['朱温', '唐哀帝'] }
      ],
      qin: [
        { id: 1, year: '前221年', name: '秦统六国', desc: '秦王嬴政完成统一大业，建立中国历史第一个中央集权国家', color: '#FF6B35', figures: ['秦始皇', '李斯', '王翦'] },
        { id: 2, year: '前213年', name: '焚书坑儒', desc: '秦始皇下令焚烧诸子典籍，坑杀儒生，强化思想控制', color: '#E05820', figures: ['秦始皇', '李斯'] },
        { id: 3, year: '前209年', name: '陈胜吴广起义', desc: '陈胜吴广揭竿而起，开启反秦义军序幕，"王侯将相宁有种乎"', color: '#9B8FD5', figures: ['陈胜', '吴广'] },
        { id: 4, year: '前202年', name: '楚汉之争结束', desc: '刘邦击败项羽，建立汉朝，四百年汉室王朝开始', color: '#43E97B', figures: ['刘邦', '项羽', '韩信', '张良'] },
        { id: 5, year: '前140年', name: '汉武帝即位', desc: '汉武帝刘彻在位54年，开拓丝绸之路，北击匈奴，确立儒家正统', color: '#F7C948', figures: ['汉武帝', '卫青', '霍去病'] },
        { id: 6, year: '220年', name: '汉朝灭亡', desc: '汉献帝禅位曹丕，东汉终结，三国时代正式开幕', color: '#8C7B61', figures: ['曹操', '曹丕', '汉献帝'] }
      ]
    },

    timelineEvents: [],

    famousFigures: [
      { id: 1, name: '孔子', dynasty: '春秋', role: '儒家创始人', emoji: '📚', color: 'linear-gradient(135deg,#FF9A5C,#FF6B35)', desc: '至圣先师，儒家创始人，其思想影响中华两千余年' },
      { id: 2, name: '李白', dynasty: '唐代', role: '诗仙', emoji: '🌙', color: 'linear-gradient(135deg,#667EEA,#764BA2)', desc: '浪漫主义诗人，存诗900余首，"天才与癫狂并存的诗仙"' },
      { id: 3, name: '杜甫', dynasty: '唐代', role: '诗圣', emoji: '📜', color: 'linear-gradient(135deg,#43E97B,#38F9D7)', desc: '现实主义诗人，诗歌被誉为"诗史"，忧国忧民的典范' },
      { id: 4, name: '苏轼', dynasty: '北宋', role: '文学大家', emoji: '🍜', color: 'linear-gradient(135deg,#F093FB,#F5576C)', desc: '文学、书法、绘画、美食全才，"东坡"精神影响至今' },
      { id: 5, name: '诸葛亮', dynasty: '三国', role: '智圣', emoji: '🌟', color: 'linear-gradient(135deg,#5BC8F5,#1A9ED5)', desc: '三国时期蜀汉丞相，被誉为"古今第一谋臣"，鞠躬尽瘁' },
      { id: 6, name: '武则天', dynasty: '唐代', role: '女皇帝', emoji: '👑', color: 'linear-gradient(135deg,#F7C948,#E8A710)', desc: '中国历史上唯一正式称帝的女性，在位期间政治清明' },
      { id: 7, name: '秦始皇', dynasty: '秦代', role: '千古一帝', emoji: '🏯', color: 'linear-gradient(135deg,#9B8FD5,#6B5BB5)', desc: '统一六国，建立第一个中央集权封建国家，功过皆千秋' },
      { id: 8, name: '岳飞', dynasty: '南宋', role: '民族英雄', emoji: '⚔️', color: 'linear-gradient(135deg,#FF8FA3,#E05070)', desc: '精忠报国的民族英雄，《满江红》慷慨激昂流传千古' }
    ],

    trivias: [
      { id: 1, title: '古代科举考试有多难？', hint: '千年选才制度的秘密', icon: '📝', query: '古代科举考试制度的内容、难度和历史意义' },
      { id: 2, title: '万里长城是怎么修建的？', hint: '探秘伟大工程的历史', icon: '🏯', query: '万里长城的修建历史、规模和文化意义' },
      { id: 3, title: '古代皇帝一天怎么过？', hint: '揭秘宫廷生活真相', icon: '👑', query: '古代皇帝的日常生活、政务安排和宫廷制度' },
      { id: 4, title: '丝绸之路如何开辟？', hint: '东西方文明的交流之路', icon: '🐪', query: '丝绸之路的开辟历史、主要路线和重要意义' },
      { id: 5, title: '四大发明如何改变世界？', hint: '中国对人类文明的贡献', icon: '🧭', query: '中国古代四大发明的起源、发展和对世界的影响' },
      { id: 6, title: '古代战争为什么打仗？', hint: '战争背后的历史逻辑', icon: '⚔️', query: '中国古代著名战役的战略意义和历史影响' }
    ],

    // 历史趣闻
    historyFacts: [
      { id: 1, icon: '🎭', fact: '唐代女性可以穿男装出门，唐朝女性地位较高', tag: '唐代风俗' },
      { id: 2, icon: '🍜', fact: '宋朝是历史上GDP最高的朝代，占当时全球约80%', tag: '经济繁荣' },
      { id: 3, icon: '📚', fact: '活字印刷术发明后，知识传播成本降低了99%', tag: '科技革命' },
      { id: 4, icon: '🌙', fact: '中国有文字记录的历史长达3300多年，甲骨文至今', tag: '文字历史' }
    ]
  },

  onLoad() {
    this.loadDynastyEvents('tang');
    monetize.preloadRewardedAd();
  },

  // ── 加载朝代事件 ──────────────────────────────
  async loadDynastyEvents(dynasty) {
    const events = this.data.dynastyEvents[dynasty];
    const nameMap = {
      xia: '夏商周', qin: '秦汉', weijin: '魏晋南北朝',
      sui: '隋唐', tang: '唐宋', yuan: '元明', qing: '清代'
    };
    const name = nameMap[dynasty] || dynasty;

    if (events && events.length > 0) {
      this.setData({ timelineEvents: events, activeTitle: name, aiResult: '', aiResultSections: [] });
    } else {
      this.setData({ isLoading: true, timelineEvents: [], activeTitle: name, aiResult: '', aiResultSections: [] });
      try {
        const res = await api.queryHistory(`${name}时期的重大历史事件，请列举6个最重要的，每个含年代、名称和简介`);
        const sections = this._parseSections(res.content);
        this.setData({
          aiResult: res.content,
          aiResultSections: sections,
          isLoading: false,
          currentQuery: `${name}时期的重大历史事件`
        });
      } catch (e) {
        this.setData({ isLoading: false });
        api.showError('历史数据加载失败，请重试');
      }
    }
  },

  selectDynasty(e) {
    const { id } = e.currentTarget.dataset;
    if (id === this.data.activeDynasty) return;
    this.setData({ activeDynasty: id, aiResult: '', aiResultSections: [] });
    this.loadDynastyEvents(id);
  },

  // ── 搜索 ──────────────────────────────
  onSearch(e) {
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
      const res = await api.queryHistory(text);
      const sections = this._parseSections(res.content);
      this.setData({ aiResult: res.content, aiResultSections: sections, isLoading: false });
      wx.pageScrollTo({ selector: '.ai-result-section', duration: 400 });
    } catch (e) {
      this.setData({ isLoading: false });
      api.showError(e.message || '查询失败，请重试');
    }
  },

  closeResult() {
    this.setData({ aiResult: '', aiResultSections: [], isLoading: false, currentQuery: '' });
  },

  copyAiResult() {
    wx.setClipboardData({
      data: this.data.aiResult,
      success: () => wx.showToast({ title: '已复制', icon: 'success' })
    });
  },

  // ── 点击时间轴事件 ──────────────────────────────
  async exploreEvent(e) {
    const event = e.currentTarget.dataset.event;
    const query = `${event.name}（${event.year}）的详细历史背景、经过和影响`;
    this.setData({ isLoading: true, aiResult: '', aiResultSections: [], currentQuery: query });

    try {
      const res = await api.queryHistory(query);
      const sections = this._parseSections(res.content);
      this.setData({ aiResult: res.content, aiResultSections: sections, isLoading: false });
      wx.pageScrollTo({ selector: '.ai-result-section', duration: 400 });
    } catch (err) {
      this.setData({ isLoading: false });
      api.showError('查询失败，请重试');
    }
  },

  // ── 探索名人 ──────────────────────────────
  async exploreFigure(e) {
    const figure = e.currentTarget.dataset.figure;
    const query = `请详细介绍${figure.dynasty}${figure.name}的生平事迹、主要贡献和历史评价`;
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

  // ── 历史趣闻 ──────────────────────────────
  async exploreTrivia(e) {
    const trivia = e.currentTarget.dataset.trivia;
    this.setData({ isLoading: true, aiResult: '', aiResultSections: [], currentQuery: trivia.query });
    try {
      const res = await api.queryHistory(trivia.query);
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
      sections.push({ label: '历史详情', content: text.trim() });
    }
    return sections;
  },

  // ── 分享 ──────────────────────────────
  onShareAppMessage() {
    const q = this.data.currentQuery || '';
    return {
      title: q ? `【${q}】历史探秘 · 国学助手` : '历史探秘 · 朝代人物探究',
      path:  '/pages/history/index',
    };
  },
  onShareTimeline() {
    const q = this.data.currentQuery || '';
    return {
      title: q ? `【${q}】探究历史真相` : '国学助手 · 历史探秘',
      query: 'from=timeline',
    };
  },
  adLoad() {
    console.log('Banner 广告加载成功')
  },
  adError(err) {
    console.error('Banner 广告加载失败', err)
  },
  adClose() {
    console.log('Banner 广告关闭')
  }
});
