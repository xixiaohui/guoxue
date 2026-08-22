// pages/chinesepoetry_all/index.js - 诗词/诗人/朝代/体裁 全部列表（分页）
const poetry = require('../../utils/poetryApi');
const poemCache = require('../../utils/poemCache');
const settings = require('../../utils/settings');

// 服务端分页大小（/poems /authors 实测 page 参数生效）
const PAGE_SIZE = 20;
// 作者总数 1.3w+：用服务端支持的最大 pageSize（100，>100 会 HTTP 500）减少翻页次数
const AUTHOR_PAGE_SIZE = 100;
// 朝代/体裁数据量小（11/17 条），本地分页切片
const LOCAL_PAGE_SIZE = 10;

const KIND_TITLES = {
  poems: '全部诗词',
  authors: '全部诗人',
  dynasties: '全部朝代',
  types: '全部体裁'
};

const KIND_SUBTITLES = {
  poems: '千年诗韵 · 全部诗词',
  authors: '千古风流 · 全部诗人',
  dynasties: '千年文脉 · 朝代一览',
  types: '诗词体裁 · 分类一览'
};

Page({
  data: {
    kind: 'poems',          // poems | authors | dynasties | types
    title: '全部诗词',
    subtitle: '',
    items: [],
    loading: true,          // 首屏/整页加载中
    loadingMore: false,     // 触底加载更多中
    page: 0,
    hasMore: true,
    localAll: []            // 朝代/体裁全量（本地分页用）
  },

  onLoad(options) {
    const o = options || {};
    const kind = KIND_TITLES[o.kind] ? o.kind : 'poems';
    this.setData({ kind, title: KIND_TITLES[kind], subtitle: KIND_SUBTITLES[kind] });
    wx.setNavigationBarTitle({ title: KIND_TITLES[kind] });
    this._load(true);
    if (kind === 'poems' || kind === 'authors') {
      this._loadStats();
    }
  },

  onShow() {
    settings.applyToPage(this);
  },

  onPullDownRefresh() {
    this._load(true)
      .then(() => this._loadStats())
      .finally(() => wx.stopPullDownRefresh());
  },

  /** 触底加载下一页 */
  onReachBottom() {
    if (this.data.loading || this.data.loadingMore) return;
    if (!this.data.hasMore || this.data.items.length === 0) return;
    this._load(false);
  },

  /** 按钮手动加载更多 */
  loadMore() {
    if (this.data.loading || this.data.loadingMore) return;
    if (!this.data.hasMore || this.data.items.length === 0) return;
    this._load(false);
  },

  /**
   * 分页加载核心
   * poems/authors 走服务端分页；dynasties/types 一次拉全量后本地切片
   */
  async _load(reset) {
    const kind = this.data.kind;
    if (!reset && (this.data.loading || this.data.loadingMore)) return;

    const patch = reset
      ? { loading: true, loadingMore: false, page: 0, hasMore: true }
      : { loadingMore: true };
    this.setData(patch);

    try {
      if (kind === 'poems') {
        const nextPage = reset ? 1 : this.data.page + 1;
        const r = await poetry.getPoems({ page: nextPage, pageSize: PAGE_SIZE });
        const items = reset ? r.poems : this._dedupe(this.data.items.concat(r.poems));
        this.setData({ items, page: nextPage, hasMore: r.hasMore });
      } else if (kind === 'authors') {
        const nextPage = reset ? 1 : this.data.page + 1;
        const r = await poetry.getAuthors({ page: nextPage, pageSize: AUTHOR_PAGE_SIZE });
        const items = reset ? r.authors : this._dedupe(this.data.items.concat(r.authors));
        this.setData({ items, page: nextPage, hasMore: r.hasMore });
      } else {
        // dynasties / types：本地分页切片
        if (reset || this.data.localAll.length === 0) {
          const c = await poetry.getCategories();
          const localAll = kind === 'dynasties' ? (c.dynasties || []) : (c.types || []);
          const slice = localAll.slice(0, LOCAL_PAGE_SIZE);
          this.setData({
            localAll,
            items: slice,
            page: 1,
            hasMore: localAll.length > LOCAL_PAGE_SIZE
          });
        } else {
          const start = this.data.page * LOCAL_PAGE_SIZE;
          const end = start + LOCAL_PAGE_SIZE;
          const slice = this.data.localAll.slice(start, end);
          this.setData({
            items: this.data.items.concat(slice),
            page: this.data.page + 1,
            hasMore: end < this.data.localAll.length
          });
        }
      }
    } catch (e) {
      console.warn('[PoetryAll] load failed:', e.message || e.code);
      // 朝代/体裁接口失败时用内置兜底数据
      if (reset && (kind === 'dynasties' || kind === 'types')) {
        const localAll = kind === 'dynasties' ? poetry.FALLBACK_DYNASTIES : poetry.FALLBACK_TYPES;
        const slice = localAll.slice(0, LOCAL_PAGE_SIZE);
        this.setData({
          localAll,
          items: slice,
          page: 1,
          hasMore: localAll.length > LOCAL_PAGE_SIZE
        });
      }
    } finally {
      this.setData({ loading: false, loadingMore: false });
    }
  },

  /** 用 /categories 汇总更新页头统计（poems/authors 专用） */
  async _loadStats() {
    try {
      const c = await poetry.getCategories();
      const poemCount = (c.dynasties || []).reduce((s, d) => s + (d.poemCount || 0), 0);
      const authorCount = (c.dynasties || []).reduce((s, d) => s + (d.authorCount || 0), 0);
      this.setData({
        subtitle: this.data.kind === 'poems'
          ? '共 ' + poetry.fmtCount(poemCount) + ' 首诗词'
          : '共 ' + poetry.fmtCount(authorCount) + ' 位诗人'
      });
    } catch (_) {
      // 统计失败保留默认副标题
    }
  },

  // ── 跳转 ──────────────────────────────
  /** 诗词 → 详情（seed 跳转，规避 /poems/:id 500 故障） */
  goPoem(e) {
    const poem = e.currentTarget.dataset.poem;
    if (!poem || (!poem.title && !poem.content)) return;
    // 缓存完整正文，避免详情页因 URL 长度限制展示截断内容
    poemCache.cachePoem(poem);
    wx.navigateTo({ url: this._buildPoemUrl(poem) });
  },

  /** 诗人 → 详情 */
  goAuthor(e) {
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

  /** 组装诗词详情页 URL（seed 数据走 query；超长时截断 content 保证跳转可用） */
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

  // ── 工具 ──────────────────────────────
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

  // ── 分享 ──────────────────────────────
  onShareAppMessage() {
    return {
      title: this.data.title + ' · 国文之学',
      path: '/pages/chinesepoetry/index'
    };
  }
});
