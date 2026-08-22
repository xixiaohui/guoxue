// pages/chinesepoetry/index.js - 诗词天地（Poetry Gateway API 数据源）
const poetry = require('../../utils/poetryApi');
const poemCache = require('../../utils/poemCache');
const settings = require('../../utils/settings');

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
    filterKeyword: '',
    categoryPoems: [],
    categoryLoading: false,
    categoryUnavailable: false,
    categoryQueried: false,   // 是否已发起过分类查询（控制结果区显隐）
    categoryError: false,     // 关键词搜索请求失败（区别于空结果）
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

  onShow() {
    settings.applyToPage(this);
  },

  onPullDownRefresh() {
    this._loadAll(true).finally(() => wx.stopPullDownRefresh());
  },

  async _loadAll(refresh = false) {
    if (refresh) {
      this.setData({ loading: true });
    }
    await Promise.all([
      this._loadQuote(),
      this._loadSolar(),
      this._loadCategories(),
      this._loadRecommend(),
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
    if (!nextDynasty && !nextType && !(this.data.filterKeyword || '').trim()) {
      this.setData({ categoryPoems: [], categoryUnavailable: false, categoryError: false, categoryQueried: false });
      return;
    }
    this._loadCategoryPoems();
  },

  resetFilter() {
    this.setData({
      activeDynasty: '',
      activeType: '',
      filterKeyword: '',
      categoryPoems: [],
      categoryUnavailable: false,
      categoryError: false,
      categoryQueried: false
    });
  },

  // ── 分类搜索过滤 ──────────────────────────
  onFilterKeywordInput(e) {
    this.setData({ filterKeyword: e.detail.value });
  },

  /** 清除关键词：仍选有朝代/体裁则按原条件重新查询，否则收起结果区 */
  onFilterKeywordClear() {
    const patch = { filterKeyword: '', categoryError: false };
    if (this.data.activeDynasty || this.data.activeType) {
      this.setData(patch);
      this._loadCategoryPoems();
    } else {
      patch.categoryPoems = [];
      patch.categoryUnavailable = false;
      patch.categoryQueried = false;
      this.setData(patch);
    }
  },

  onFilterKeywordSearch() {
    const kw = (this.data.filterKeyword || '').trim();
    if (!kw && !this.data.activeDynasty && !this.data.activeType) {
      wx.showToast({ title: '请输入关键词或选择分类', icon: 'none' });
      return;
    }
    this._loadCategoryPoems();
  },

  /**
   * 分类浏览统一入口：选择朝代/体裁 或 输入关键词过滤后触发查询。
   * 有关键词 → /search 拉取 + 客户端按所选朝代/体裁精确过滤；
   * 无关键词 → /poems/random 并发拉取构建列表（筛选参数真实生效）。
   */
  async _loadCategoryPoems() {
    const { activeDynasty, activeType } = this.data;
    const kw = (this.data.filterKeyword || '').trim();
    if (!activeDynasty && !activeType && !kw) return;
    this.setData({ categoryLoading: true, categoryUnavailable: false, categoryError: false, categoryQueried: true });
    if (kw) {
      await this._loadCategoryBySearch(kw, activeDynasty, activeType);
    } else {
      await this._loadCategoryByRandom(activeDynasty, activeType);
    }
  },

  /**
   * 关键词过滤：/search 是唯一支持关键词搜索的端点（/poems 的 dynasty/type 筛选被忽略），
   * 分页拉取（每页 100，最多 3 页）后在客户端按所选朝代/体裁精确过滤。
   */
  async _loadCategoryBySearch(kw, dynasty, type) {
    const filters = {};
    if (dynasty) filters.dynasty = dynasty;
    if (type) filters.type = type;
    let list = [];
    let failed = false;
    for (let page = 1; page <= 3; page++) {
      let r;
      try {
        r = await poetry.getSearch(kw, { type: 'all', page, pageSize: 100 });
      } catch (e) {
        console.warn('[PoetryHome] category search failed:', e.message || e.code);
        failed = true;
        break;
      }
      const batch = (r.poems || []).filter((p) => {
        if (filters.dynasty && p.dynasty !== filters.dynasty) return false;
        if (filters.type && p.type !== filters.type) return false;
        return true;
      });
      list = this._dedupe(list.concat(batch));
      if (list.length >= 12 || !r.hasMore) break;
    }
    this.setData({
      categoryPoems: list,
      categoryUnavailable: !failed && list.length === 0,
      categoryError: failed,
      categoryLoading: false
    });
  },

  /**
   * 无关键词分类浏览：/poems/random 筛选真实生效（每次 1 首），并发 8 次去重构建列表。
   * 零匹配值整批 500 → 判定「分类暂不可用」（区别于断网/超时）。
   */
  async _loadCategoryByRandom(dynasty, type) {
    const filters = {};
    if (dynasty) filters.dynasty = dynasty;
    if (type) filters.type = type;

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
  /** 点击「换一批」整批替换数据（不追加、触底不再自动加载） */
  async _loadRecommend() {
    if (this.data.recommendLoading) return;
    this.setData({ recommendLoading: true });
    try {
      const r = await poetry.getRecommend();
      this.setData({
        recommendPoems: this._dedupe(r.poems),
        recommendReason: r.reason || ''
      });
    } catch (e) {
      if (this.data.recommendPoems.length === 0) {
        this.setData({ recommendPoems: poetry.FALLBACK_POEMS.slice(0, 5) });
      }
    } finally {
      this.setData({ recommendLoaded: true, recommendLoading: false });
    }
  },

  refreshRecommend() {
    this._loadRecommend();
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
  /**
   * 推荐全库作品数 Top 20 的诗人：
   * /authors 服务端已按作品数降序返回（poemCount 字段恒为 null，无法客户端排序），
   * 故拉取第 1 页 pageSize=100（留足过滤「无名氏」等无效作者的余量）后截取前 20 位。
   */
  async _loadAuthors() {
    this.setData({ authorsLoading: true });
    try {
      const r = await poetry.getAuthors({ page: 1, pageSize: 100 });
      const top20 = r.authors && r.authors.length ? r.authors.slice(0, 20) : [];
      this.setData({
        authors: top20.length ? top20 : poetry.FALLBACK_AUTHORS
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
    // 缓存完整正文，避免详情页因 URL 长度限制展示截断内容
    poemCache.cachePoem(poem);
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
