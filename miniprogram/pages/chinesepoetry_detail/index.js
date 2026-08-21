// pages/chinesepoetry_detail/index.js - 诗词/诗人详情页
const storage = require('../../utils/storage');
const poetry = require('../../utils/poetryApi');
const share = require('../../utils/share');

// 诗人作品分页大小（/search 实测 page 参数生效）
const AUTHOR_POEM_PAGE_SIZE = 20;

Page({
  data: {
    kind: 'poem',            // poem | author
    id: '',
    title: '',
    content: '',
    author: '',
    dynasty: '',
    type: '',
    source: '',
    description: '',
    poemCount: 0,
    countText: '',
    authorChar: '',

    loading: false,          // 详情接口增强请求中
    fromSeed: false,         // 是否以列表页 seed 渲染（详情接口不可用时）

    isFavorited: false,

    // 诗人全部诗词（分页，/search?type=author）
    authorPoems: [],
    authorPoemsLoading: false,     // 首屏加载中
    authorPoemsLoadingMore: false, // 触底加载更多中
    authorPoemsPage: 0,
    authorPoemsHasMore: true,
    authorPoemsLoaded: false,      // 是否已发起过请求（用于空态展示）

    // 海报
    showPoster: false,
    posterLoading: false,
    posterPath: ''
  },

  onLoad(options) {
    const o = options || {};
    const kind = o.kind === 'author' ? 'author' : 'poem';
    const title = decodeURIComponent(o.title || '');
    const author = decodeURIComponent(o.author || '');
    const dynasty = decodeURIComponent(o.dynasty || '');
    const poemCount = parseInt(o.poemCount, 10) || 0;

    this.setData({
      kind,
      id: o.id || '',
      title,
      content: decodeURIComponent(o.content || ''),
      author,
      dynasty,
      type: decodeURIComponent(o.type || ''),
      source: decodeURIComponent(o.source || ''),
      description: decodeURIComponent(o.description || ''),
      poemCount,
      countText: poetry.fmtCount(poemCount),
      authorChar: title.slice(0, 1),
      fromSeed: !!(o.title || o.content),
      isFavorited: kind === 'poem' && title ? storage.isPoemFavorited(title, author) : false
    });

    wx.setNavigationBarTitle({ title: kind === 'author' ? (title || '诗人详情') : (title || '诗词详情') });

    this._enhanceDetail(kind, o.id);
    if (kind === 'author' && title) {
      this._loadAuthorPoems(true);
    }
    this._recordView();
  },

  /** 触底加载诗人下一页作品 */
  onReachBottom() {
    if (this.data.kind !== 'author') return;
    if (this.data.authorPoemsLoading || this.data.authorPoemsLoadingMore) return;
    if (!this.data.authorPoemsHasMore || this.data.authorPoems.length === 0) return;
    this._loadAuthorPoems(false);
  },

  // ── 诗人全部诗词（分页）────────────────────
  /**
   * 加载该诗人的全部诗词
   * ⚠️ /poems 的 author 筛选被服务端忽略，此处用 /search?type=author 分页拉取（page 实测生效）
   */
  async _loadAuthorPoems(reset) {
    const author = this.data.title;
    if (!author) return;
    if (this.data.authorPoemsLoading || this.data.authorPoemsLoadingMore) return;

    const nextPage = reset ? 1 : this.data.authorPoemsPage + 1;
    const patch = reset
      ? { authorPoemsLoading: true, authorPoemsLoadingMore: false, authorPoemsPage: 0, authorPoemsHasMore: true }
      : { authorPoemsLoadingMore: true };
    this.setData(patch);

    try {
      const r = await poetry.getAuthorPoems(author, { page: nextPage, pageSize: AUTHOR_POEM_PAGE_SIZE });
      const poems = reset ? r.poems : this._dedupe(this.data.authorPoems.concat(r.poems));
      this.setData({
        authorPoems: poems,
        authorPoemsPage: nextPage,
        authorPoemsHasMore: r.hasMore,
        authorPoemsLoading: false,
        authorPoemsLoadingMore: false,
        authorPoemsLoaded: true
      });
    } catch (e) {
      console.warn('[PoetryDetail] author poems failed:', e.message || e.code);
      this.setData({
        authorPoemsLoading: false,
        authorPoemsLoadingMore: false,
        authorPoemsLoaded: true
      });
    }
  },

  /** 「加载更多」按钮点击（触底之外的手动加载入口） */
  loadMoreAuthorPoems() {
    if (this.data.kind !== 'author') return;
    if (this.data.authorPoemsLoading || this.data.authorPoemsLoadingMore) return;
    if (!this.data.authorPoemsHasMore || this.data.authorPoems.length === 0) return;
    this._loadAuthorPoems(false);
  },

  /** 点击诗人作品 → 跳转诗词详情（seed 跳转，规避 /poems/:id 500 故障） */
  goAuthorPoem(e) {
    const poem = e.currentTarget.dataset.poem;
    if (!poem || (!poem.title && !poem.content)) return;
    wx.navigateTo({ url: this._buildPoemUrl(poem) });
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

  /** 按 id（空 id 退化到 title|author）去重合并 */
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

  /**
   * 用 /poems/:id、/authors/:id 尝试补全详情
   * ⚠️ /poems/:id 生产环境存在 500 故障 → 失败时静默使用 seed 数据
   */
  async _enhanceDetail(kind, id) {
    if (!id) return;
    this.setData({ loading: true });
    try {
      if (kind === 'author') {
        const d = await poetry.getAuthorDetail(id);
        // 实测仅返回 dynasty/description/poemCount，缺 id/name
        const patch = {};
        if (d.dynasty) patch.dynasty = d.dynasty;
        if (d.description) patch.description = d.description;
        if (d.poemCount != null) {
          patch.poemCount = d.poemCount;
          patch.countText = poetry.fmtCount(d.poemCount);
        }
        this.setData(patch);
      } else {
        const p = await poetry.getPoemDetail(id);
        if (!p) throw new Error('empty detail');
        const patch = {};
        if (p.content && !this.data.content) patch.content = p.content;
        if (p.author) patch.author = p.author;
        if (p.dynasty) patch.dynasty = p.dynasty;
        if (p.type) patch.type = p.type;
        this.setData(patch);
      }
    } catch (e) {
      console.warn('[PoetryDetail] enhance failed, use seed:', e.message || e.code);
    } finally {
      this.setData({ loading: false });
    }
  },

  /** 本地记录浏览历史（最多 30 条，按 title+author 去重） */
  _recordView() {
    if (this.data.kind !== 'poem' || !this.data.title) return;
    try {
      const list = wx.getStorageSync('viewed_poems') || [];
      const item = {
        title: this.data.title,
        author: this.data.author,
        dynasty: this.data.dynasty,
        type: this.data.type,
        content: this.data.content,
        time: Date.now()
      };
      const filtered = list.filter((v) => v.title !== item.title || v.author !== item.author);
      filtered.unshift(item);
      wx.setStorageSync('viewed_poems', filtered.slice(0, 30));
    } catch (_) {}
  },

  // ── 收藏 ──────────────────────────────
  toggleFavorite() {
    if (this.data.kind !== 'poem' || !this.data.title) return;
    const poem = {
      title: this.data.title,
      author: this.data.author,
      dynasty: this.data.dynasty,
      type: this.data.type,
      content: this.data.content
    };
    const fav = storage.toggleFavoritePoem(poem);
    this.setData({ isFavorited: fav });
    wx.showToast({ title: fav ? '已收藏' : '已取消收藏', icon: 'success', duration: 1200 });
  },

  // ── 海报（完整展示诗词正文）──────────────────
  noop() {},

  async createPoster() {
    if (this.data.kind !== 'poem') {
      wx.showToast({ title: '仅诗词支持生成海报', icon: 'none' });
      return;
    }
    if (!this.data.content && !this.data.title) {
      wx.showToast({ title: '缺少诗词内容', icon: 'none' });
      return;
    }
    if (this.data.posterLoading) return;

    this.setData({ showPoster: true, posterLoading: true, posterPath: '' });

    try {
      const path = await share.generatePoemPoster(this, {
        title: this.data.title || '无题',
        author: this.data.author || '',
        dynasty: this.data.dynasty || '',
        type: this.data.type || '',
        content: this.data.content || '',
        canvasId: 'posterCanvas'
      });
      this.setData({ posterPath: path, posterLoading: false });
    } catch (e) {
      console.error('[PoetryDetail] poster failed:', e);
      this.setData({ posterLoading: false });
      wx.showToast({ title: '海报生成失败，请重试', icon: 'none' });
    }
  },

  closePoster() {
    this.setData({ showPoster: false, posterPath: '', posterLoading: false });
  },

  async savePoster() {
    if (!this.data.posterPath) return;
    try {
      await share.savePosterToAlbum(this.data.posterPath);
    } catch (_) {
      // 权限拒绝/取消等已在 savePosterToAlbum 内提示
    }
  },

  // ── 复制 ──────────────────────────────
  copyContent() {
    const text = this.data.kind === 'author'
      ? (this.data.title + '\n' + (this.data.description || ''))
      : (this.data.content || this.data.title);
    if (!text) return;
    wx.setClipboardData({
      data: text,
      success: () => wx.showToast({ title: '已复制', icon: 'success' })
    });
  },

  // ── 返回 ──────────────────────────────
  goBack() {
    const pages = getCurrentPages();
    if (pages.length > 1) {
      wx.navigateBack({ delta: 1 });
    } else {
      wx.switchTab({ url: '/pages/home/index' });
    }
  },

  // ── 分享 ──────────────────────────────
  onShareAppMessage() {
    const d = this.data;
    return {
      title: d.kind === 'author'
        ? (d.title + ' · ' + (d.dynasty || '诗人'))
        : ('《' + d.title + '》—— ' + (d.author || '中华诗词')),
      path: '/pages/chinesepoetry_detail/index?kind=' + d.kind + '&title=' + encodeURIComponent(d.title)
    };
  },

  onShareTimeline() {
    const d = this.data;
    return {
      title: d.kind === 'author'
        ? (d.title + ' · ' + (d.dynasty || '诗人'))
        : ('《' + d.title + '》—— ' + (d.author || '中华诗词')),
      query: 'kind=' + d.kind + '&title=' + encodeURIComponent(d.title) + '&from=timeline'
    };
  }
});
