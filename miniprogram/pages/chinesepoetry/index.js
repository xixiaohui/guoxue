// pages/chinesepoetry/index.js - 诗词天地（Poetry Gateway API 数据源）
const poetry = require('../../utils/poetryApi');

Page({
  data: {
    // 每日一句 /quote
    quote: { content: '', author: '', source: '', date: '' },
    quoteLoading: true,
    // 节气推荐 /solar-term
    solar: { termName: '', termDescription: '', poem: null, reason: '' },
    solarLoading: true,
    // 分类 /categories（朝代 + 体裁）
    dynasties: [],
    types: [],
    activeDynasty: '',
    activeType: '',
    categoryPoems: [],
    categoryLoading: false,
    categoryUnavailable: false,
    // 为你推荐 /recommend
    recommendReason: '',
    recommendPoems: [],
    recommendLoading: false,
    recommendLoaded: false,   // 是否已完成首次推荐加载（骨架占位判断用）
    // 诗词精选 /poems
    poems: [],
    poemsLoading: true,
    // 诗人风采 /authors
    authors: [],
    authorsLoading: true,
    // 统计（由 /categories 汇总兜底 /home 缺失的数据）
    totalPoems: 0,
    totalPoemsText: '0',
    totalAuthors: 0,
    totalAuthorsText: '0',
    // 整页加载
    loading: true
  },

  onLoad() {
    this._loadAll();
  },

  onPullDownRefresh() {
    this._loadAll(true).finally(() => wx.stopPullDownRefresh());
  },

  onReachBottom() {
    this._loadRecommend(false);
  },

  async _loadAll(refresh = false) {
    if (refresh) {
      this.setData({ loading: true });
    }
    await Promise.all([
      this._loadQuote(),
      this._loadSolar(),
      this._loadCategories(),
      this._loadRecommend(true),
      this._loadPoems(),
      this._loadAuthors()
    ]);
    this.setData({ loading: false });
  },

  // ── 每日一句 ──────────────────────────────
  async _loadQuote() {
    this.setData({ quoteLoading: true });
    try {
      const q = await poetry.getQuote();
      if (!q.content) throw new Error('empty quote');
      this.setData({ quote: q });
    } catch (e) {
      this.setData({ quote: poetry.FALLBACK_QUOTE });
    } finally {
      this.setData({ quoteLoading: false });
    }
  },

  async refreshQuote() {
    if (this.data.quoteLoading) return;
    this._loadQuote();
  },

  // ── 节气推荐 ──────────────────────────────
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

  // ── 分类 ──────────────────────────────────
  async _loadCategories() {
    try {
      const c = await poetry.getCategories();
      const dynasties = c.dynasties || [];
      const types = c.types || [];
      this.setData({
        dynasties,
        types,
        totalPoems: dynasties.reduce((s, d) => s + (d.poemCount || 0), 0),
        totalPoemsText: poetry.fmtCount(dynasties.reduce((s, d) => s + (d.poemCount || 0), 0)),
        totalAuthors: dynasties.reduce((s, d) => s + (d.authorCount || 0), 0),
        totalAuthorsText: poetry.fmtCount(dynasties.reduce((s, d) => s + (d.authorCount || 0), 0))
      });
    } catch (e) {
      this.setData({
        dynasties: poetry.FALLBACK_DYNASTIES,
        types: poetry.FALLBACK_TYPES,
        totalPoemsText: '37.1万',
        totalAuthorsText: '1.4万'
      });
    }
  },

  selectFilter(e) {
    const { kind, name } = e.currentTarget.dataset;
    if (!name) return;
    const nextDynasty = kind === 'dynasty'
      ? (this.data.activeDynasty === name ? '' : name)
      : this.data.activeDynasty;
    const nextType = kind === 'type'
      ? (this.data.activeType === name ? '' : name)
      : this.data.activeType;
    this.setData({ activeDynasty: nextDynasty, activeType: nextType });
    if (!nextDynasty && !nextType) {
      this.setData({ categoryPoems: [], categoryUnavailable: false });
      return;
    }
    this._loadCategoryPoems();
  },

  resetFilter() {
    this.setData({
      activeDynasty: '',
      activeType: '',
      categoryPoems: [],
      categoryUnavailable: false
    });
  },

  /**
   * /poems 筛选参数被忽略，分类浏览改用 /poems/random 并发拉取构建列表
   * 零匹配值整批 500 → 判定「分类暂不可用」（区别于断网/超时）
   */
  async _loadCategoryPoems() {
    const { activeDynasty, activeType } = this.data;
    if (!activeDynasty && !activeType) return;
    this.setData({ categoryLoading: true, categoryUnavailable: false });
    const filters = {};
    if (activeDynasty) filters.dynasty = activeDynasty;
    if (activeType) filters.type = activeType;

    const tasks = [];
    for (let i = 0; i < 8; i++) {
      tasks.push(poetry.getRandomPoem(filters).catch(() => null));
    }
    const results = await Promise.all(tasks);
    const deduped = this._dedupe(results.filter(Boolean));

    this.setData({
      categoryPoems: deduped,
      categoryUnavailable: deduped.length === 0,
      categoryLoading: false
    });
  },

  // ── 为你推荐 ──────────────────────────────
  async _loadRecommend(reset = false) {
    if (this.data.recommendLoading) return;
    this.setData({ recommendLoading: true });
    try {
      const r = await poetry.getRecommend();
      const base = reset ? [] : this.data.recommendPoems;
      const merged = this._dedupe(base.concat(r.poems));
      this.setData({
        recommendPoems: merged,
        recommendReason: r.reason || this.data.recommendReason
      });
    } catch (e) {
      if (reset || this.data.recommendPoems.length === 0) {
        this.setData({ recommendPoems: poetry.FALLBACK_POEMS.slice(0, 5) });
      }
    } finally {
      this.setData({ recommendLoaded: true, recommendLoading: false });
    }
  },

  refreshRecommend() {
    this._loadRecommend(true);
  },

  // ── 诗词精选 ──────────────────────────────
  async _loadPoems() {
    this.setData({ poemsLoading: true });
    try {
      const r = await poetry.getPoems({ page: 1, pageSize: 10 });
      this.setData({
        poems: r.poems && r.poems.length ? r.poems : poetry.FALLBACK_POEMS.slice(0, 8)
      });
    } catch (e) {
      this.setData({ poems: poetry.FALLBACK_POEMS.slice(0, 8) });
    } finally {
      this.setData({ poemsLoading: false });
    }
  },

  // ── 诗人风采 ──────────────────────────────
  async _loadAuthors() {
    this.setData({ authorsLoading: true });
    try {
      const r = await poetry.getAuthors({ page: 1, pageSize: 12 });
      this.setData({
        authors: r.authors && r.authors.length ? r.authors : poetry.FALLBACK_AUTHORS
      });
    } catch (e) {
      this.setData({ authors: poetry.FALLBACK_AUTHORS });
    } finally {
      this.setData({ authorsLoading: false });
    }
  },

  // ── 搜索（跳转独立搜索页）────────────────────
  goSearch() {
    wx.navigateTo({ url: '/pages/chinesepoetry_search/index' });
  },

  // ── 跳转详情 ──────────────────────────────
  goDetail(e) {
    const poem = e.currentTarget.dataset.poem;
    // 实测数据中大量诗词 title 为空（author 佚名、dynasty 其他），有正文即可进入详情
    if (!poem || (!poem.title && !poem.content)) return;
    wx.navigateTo({ url: this._buildPoemUrl(poem) });
  },

  goAuthorDetail(e) {
    const author = e.currentTarget.dataset.author;
    if (!author || !author.name) return;
    const params = {
      kind: 'author',
      id: author.id || '',
      title: author.name,
      author: author.name,
      dynasty: author.dynasty || '',
      description: author.description || '',
      poemCount: author.poemCount || 0
    };
    const query = Object.keys(params)
      .map((k) => k + '=' + encodeURIComponent(String(params[k] == null ? '' : params[k])))
      .join('&');
    wx.navigateTo({ url: '/pages/chinesepoetry_detail/index?' + query });
  },

  /** 数据统计 → 对应全部列表页（poems/authors/dynasties/types，均分页展示） */
  goStatList(e) {
    const kind = e.currentTarget.dataset.kind;
    if (!kind) return;
    wx.navigateTo({ url: '/pages/chinesepoetry_all/index?kind=' + kind });
  },

  /** 组装详情页 URL（seed 数据走 query；超长时截断 content 保证跳转可用） */
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

  // ── 工具 ──────────────────────────────────
  _dedupe(list) {
    const seen = new Set();
    const out = [];
    (list || []).forEach((p) => {
      if (!p) return;
      const key = p.id != null ? String(p.id) : (p.title || '') + '|' + (p.author || '');
      if (seen.has(key)) return;
      seen.add(key);
      out.push(p);
    });
    return out;
  },

  // ── 分享 ──────────────────────────────────
  onShareAppMessage() {
    const q = this.data.quote;
    return {
      title: q && q.content
        ? '「' + q.content + '」' + (q.author ? '—— ' + q.author : '')
        : '诗词天地 · 中华诗词之美',
      path: '/pages/chinesepoetry/index'
    };
  },

  onShareTimeline() {
    const q = this.data.quote;
    return {
      title: q && q.content
        ? '「' + q.content + '」—— ' + (q.author || '中华诗词')
        : '诗词天地 · 中华诗词之美',
      query: 'from=timeline'
    };
  }
});
