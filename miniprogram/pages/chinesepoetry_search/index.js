// pages/chinesepoetry_search/index.js - 诗词搜索（分页加载全部结果）
const poetry = require('../../utils/poetryApi');

const PAGE_SIZE = 10;

Page({
  data: {
    keyword: '',
    poems: [],
    page: 0,
    hasMore: false,
    loading: false,       // 首屏/整页搜索中
    loadingMore: false,   // 触底加载更多中
    searched: false,      // 是否已执行过搜索
    searchedText: ''      // 已搜索的关键词（用于展示）
  },

  onLoad(options) {
    const o = options || {};
    const q = o.q ? String(o.q).trim() : '';
    if (q) {
      this.setData({ keyword: q });
      this._search(true);
    }
  },

  onPullDownRefresh() {
    this._search(true).finally(() => wx.stopPullDownRefresh());
  },

  /** 触底加载下一页 */
  onReachBottom() {
    if (!this.data.searched || this.data.loading || this.data.loadingMore) return;
    if (!this.data.hasMore || this.data.poems.length === 0) return;
    this._search(false);
  },

  // ── 交互 ──────────────────────────────────
  onInput(e) {
    this.setData({ keyword: e.detail.value });
  },

  onClear() {
    this.setData({ keyword: '', poems: [], page: 0, hasMore: false, searched: false, searchedText: '' });
  },

  onSearch() {
    const q = (this.data.keyword || '').trim();
    if (!q) {
      wx.showToast({ title: '请输入关键词', icon: 'none' });
      return;
    }
    if (this.data.loading || this.data.loadingMore) return;
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

  // ── 分享 ──────────────────────────────────
  onShareAppMessage() {
    return {
      title: '「' + this.data.searchedText + '」相关诗词',
      path: '/pages/chinesepoetry/index'
    };
  }
});
