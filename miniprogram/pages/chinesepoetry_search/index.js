// pages/chinesepoetry_search/index.js - 诗词搜索 + 诗词过滤查询系统
const poetry = require('../../utils/poetryApi');
const poemCache = require('../../utils/poemCache');
const settings = require('../../utils/settings');

const PAGE_SIZE = 10;
// 过滤查询：每批并发调用 /poems/random 的次数
//（该端点是唯一支持 dynasty/type/author/char 筛选的端点，每次返回 1 首，需并发构建列表）
const RANDOM_BATCH = 10;
// /poems/random 实测零匹配即 HTTP 500 的朝代/体裁，从可选项中剔除，避免整批查询失败
const UNSUPPORTED_DYNASTIES = ['隋', '两汉', '南北朝', '金', '明'];
const UNSUPPORTED_TYPES = ['唐诗', '五言古诗', '七言古诗', '五古', '七古', '古体诗'];

Page({
  data: {
    keyword: '',
    // ── 关键词搜索 ──────────────────────────
    poems: [],
    page: 0,
    hasMore: false,
    loading: false,
    loadingMore: false,
    searched: false,
    searchedText: '',
    // ── 过滤查询系统 ────────────────────────
    filterDynasties: [],
    filterTypes: [],
    selDynasty: '',
    selType: '',
    authorInput: '',
    charInput: '',
    filterPoems: [],
    filterPage: 0,
    filterHasMore: false,
    filterLoading: false,
    filterLoadingMore: false,
    filterSearched: false,
    filterEmpty: false,
    filterUnavailable: false,   // 整批请求全部失败（筛选暂不可用）与空结果的区分提示
    // 结果模式：'' 初始引导 / 'search' 关键词搜索 / 'filter' 过滤查询
    mode: ''
  },

  onLoad(options) {
    const o = options || {};
    this._loadFilterOptions();
    const q = o.q ? String(o.q).trim() : '';
    if (q) {
      this.setData({ keyword: q, mode: 'search' });
      this._search(true);
    }
  },

  onShow() {
    settings.applyToPage(this);
  },

  onPullDownRefresh() {
    const m = this.data.mode;
    const task = m === 'filter'
      ? this._loadFilterPoems(true)
      : (m === 'search' ? this._search(true) : this._loadFilterOptions());
    Promise.resolve(task).finally(() => wx.stopPullDownRefresh());
  },

  /** 触底加载下一页 */
  onReachBottom() {
    const m = this.data.mode;
    if (m === 'search') {
      if (this.data.loading || this.data.loadingMore) return;
      if (!this.data.hasMore || this.data.poems.length === 0) return;
      this._search(false);
    } else if (m === 'filter') {
      if (this.data.filterLoading || this.data.filterLoadingMore) return;
      if (!this.data.filterHasMore || this.data.filterPoems.length === 0) return;
      this._loadFilterPoems(false);
    }
  },

  // ── 过滤选项加载 ──────────────────────────
  /** 朝代/体裁选项来自 /categories；剔除 /poems/random 零匹配 500 的不可用项 */
  async _loadFilterOptions() {
    try {
      const c = await poetry.getCategories();
      this.setData({
        filterDynasties: (c.dynasties || []).map((d) => d.name).filter((n) => n && !UNSUPPORTED_DYNASTIES.includes(n)),
        filterTypes: (c.types || []).map((t) => t.name).filter((n) => n && !UNSUPPORTED_TYPES.includes(n))
      });
    } catch (e) {
      this.setData({
        filterDynasties: poetry.FALLBACK_DYNASTIES.map((d) => d.name).filter((n) => !UNSUPPORTED_DYNASTIES.includes(n)),
        filterTypes: poetry.FALLBACK_TYPES.map((t) => t.name).filter((n) => !UNSUPPORTED_TYPES.includes(n))
      });
    }
  },

  // ── 过滤交互 ──────────────────────────────
  onSelectDynasty(e) {
    const name = e.currentTarget.dataset.name;
    this.setData({ selDynasty: this.data.selDynasty === name ? '' : name });
  },

  onSelectType(e) {
    const name = e.currentTarget.dataset.name;
    this.setData({ selType: this.data.selType === name ? '' : name });
  },

  onAuthorInput(e) {
    this.setData({ authorInput: e.detail.value });
  },

  onCharInput(e) {
    this.setData({ charInput: e.detail.value });
  },

  onFilterQuery() {
    if (this.data.filterLoading || this.data.filterLoadingMore) return;
    if (!this._currentFilters().active) {
      wx.showToast({ title: '请至少选择一个过滤条件', icon: 'none' });
      return;
    }
    this.setData({ mode: 'filter' });
    this._loadFilterPoems(true);
  },

  onResetFilter() {
    const patch = {
      selDynasty: '',
      selType: '',
      authorInput: '',
      charInput: '',
      filterPoems: [],
      filterPage: 0,
      filterHasMore: false,
      filterSearched: false,
      filterEmpty: false,
      filterUnavailable: false
    };
    if (this.data.mode === 'filter') patch.mode = '';
    this.setData(patch);
  },

  /** 汇总当前过滤条件（dynasty/type/author/char） */
  _currentFilters() {
    const filters = {};
    if (this.data.selDynasty) filters.dynasty = this.data.selDynasty;
    if (this.data.selType) filters.type = this.data.selType;
    const author = (this.data.authorInput || '').trim();
    if (author) filters.author = author;
    const char = (this.data.charInput || '').trim();
    if (char) filters.char = char;
    filters.active = !!(filters.dynasty || filters.type || filters.author || filters.char);
    return filters;
  },

  /**
   * 过滤查询核心：/poems/random 是唯一支持筛选的端点（每次 1 首），
   * 每批并发拉取 RANDOM_BATCH 首去重构建列表；
   * 零匹配/不可用筛选值整批失败（HTTP 500）→ 判空，并区分「暂不可用」提示。
   */
  async _loadFilterPoems(reset) {
    const filters = this._currentFilters();
    if (!filters.active) return;

    const patch = { filterLoading: false, filterLoadingMore: false };
    if (reset) {
      patch.filterLoading = true;
      patch.filterPoems = [];
      patch.filterPage = 0;
      patch.filterHasMore = false;
      patch.filterEmpty = false;
      patch.filterUnavailable = false;
    } else {
      patch.filterLoadingMore = true;
    }
    this.setData(patch);

    const tasks = [];
    for (let i = 0; i < RANDOM_BATCH; i++) {
      tasks.push(poetry.getRandomPoem(filters).catch(() => null));
    }
    const results = await Promise.all(tasks);
    const got = results.filter(Boolean);

    if (reset) {
      const failCount = RANDOM_BATCH - got.length;
      this.setData({
        filterPoems: this._dedupe(got),
        filterPage: 1,
        filterHasMore: got.length > 0,
        filterSearched: true,
        filterEmpty: got.length === 0,
        filterUnavailable: got.length === 0 && failCount === RANDOM_BATCH,
        filterLoading: false
      });
    } else {
      const merged = this._dedupe(this.data.filterPoems.concat(got));
      const addedCount = merged.length - this.data.filterPoems.length;
      this.setData({
        filterPoems: merged,
        filterPage: this.data.filterPage + 1,
        filterHasMore: addedCount > 0 && got.length > 0,
        filterLoadingMore: false
      });
    }
  },

  // ── 关键词搜索 ────────────────────────────
  onInput(e) {
    this.setData({ keyword: e.detail.value });
  },

  onClear() {
    const patch = { keyword: '', poems: [], page: 0, hasMore: false, searched: false, searchedText: '' };
    if (this.data.mode === 'search') patch.mode = '';
    this.setData(patch);
  },

  onSearch() {
    const q = (this.data.keyword || '').trim();
    if (!q) {
      wx.showToast({ title: '请输入关键词', icon: 'none' });
      return;
    }
    if (this.data.loading || this.data.loadingMore) return;
    this.setData({ mode: 'search' });
    this._search(true);
  },

  /** 搜索核心：reset=true 重新搜索第 1 页，否则加载下一页并去重合并 */
  async _search(reset) {
    const q = (this.data.keyword || '').trim();
    if (!q) return;

    const nextPage = reset ? 1 : this.data.page + 1;
    const patch = { searched: true, searchedText: q };
    if (reset) {
      patch.loading = true;
      patch.loadingMore = false;
      patch.poems = [];
      patch.hasMore = false;
    } else {
      patch.loadingMore = true;
    }
    this.setData(patch);

    try {
      const r = await poetry.getSearch(q, { type: 'all', page: nextPage, pageSize: PAGE_SIZE });
      const poems = reset ? r.poems : this._dedupe(this.data.poems.concat(r.poems));
      this.setData({
        poems,
        page: nextPage,
        hasMore: r.hasMore,
        loading: false,
        loadingMore: false
      });
    } catch (e) {
      console.warn('[PoetrySearch] search failed:', e.message || e.code);
      this.setData({ loading: false, loadingMore: false });
      wx.showToast({ title: '搜索失败，请稍后重试', icon: 'none' });
    }
  },

  // ── 跳转详情 ──────────────────────────────
  goDetail(e) {
    const poem = e.currentTarget.dataset.poem;
    if (!poem || (!poem.title && !poem.content)) return;
    // 缓存完整正文，避免详情页因 URL 长度限制展示截断内容
    poemCache.cachePoem(poem);
    wx.navigateTo({ url: this._buildPoemUrl(poem) });
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

  // ── 分享（与当前搜索/筛选内容对应）─────────
  /** 当前筛选条件描述（朝代·体裁·作者·诗句） */
  _filterSummary() {
    const f = this._currentFilters();
    const parts = [];
    if (f.dynasty) parts.push(f.dynasty);
    if (f.type) parts.push(f.type);
    if (f.author) parts.push(f.author);
    if (f.char) parts.push(f.char);
    return parts.join('·');
  },

  onShareAppMessage() {
    const d = this.data;
    const q = (d.keyword || d.searchedText || '').trim();
    if (d.mode === 'search' && q) {
      return {
        title: '「' + q + '」相关诗词 · 国文之学',
        path: '/pages/chinesepoetry_search/index?q=' + encodeURIComponent(q)
      };
    }
    if (d.mode === 'filter') {
      const summary = this._filterSummary();
      return {
        title: summary ? '诗词筛选「' + summary + '」· 国文之学' : '诗词筛选查询 · 国文之学',
        path: '/pages/chinesepoetry_search/index'
      };
    }
    return {
      title: '诗词搜索 · 国文之学',
      path: '/pages/chinesepoetry_search/index'
    };
  },

  onShareTimeline() {
    const d = this.data;
    const q = (d.keyword || d.searchedText || '').trim();
    if (d.mode === 'search' && q) {
      return {
        title: '「' + q + '」相关诗词 · 国文之学',
        query: 'q=' + encodeURIComponent(q) + '&from=timeline'
      };
    }
    if (d.mode === 'filter') {
      const summary = this._filterSummary();
      return {
        title: summary ? '诗词筛选「' + summary + '」· 国文之学' : '诗词筛选查询 · 国文之学',
        query: 'from=timeline'
      };
    }
    return {
      title: '诗词搜索 · 国文之学',
      query: 'from=timeline'
    };
  }
});
