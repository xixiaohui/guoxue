// pages/chinesepoetry_detail/index.js - 诗词/诗人详情页
const storage = require('../../utils/storage');
const poetry = require('../../utils/poetryApi');
const poemCache = require('../../utils/poemCache');
const share = require('../../utils/share');
const settings = require('../../utils/settings');
const seo = require('../../utils/seo');
const landing = require('../../utils/landing');

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
    contentMissing: false,   // 诗词正文缺失（分享落地时由接口补全，失败则展示空态）
    isSinglePage: false,     // 朋友圈单页模式：禁用交互/跳转类能力

    isFavorited: false,
    liked: false,

    // 阅读设置（主题/字号/字体）
    themeClass: '',
    fontSizeClass: 'fs-normal',
    fontFamilyClass: '',

    // 诗人全部诗词（分页，/search?type=author）
    authorPoems: [],
    authorPoemsLoading: false,     // 首屏加载中
    authorPoemsLoadingMore: false, // 触底加载更多中
    authorPoemsPage: 0,
    authorPoemsHasMore: true,
    authorPoemsLoaded: false,      // 是否已发起过请求（用于空态展示）

    // 诗词信息块（朝代/体裁/作者/名句，供搜一搜索引与阅读）
    poemInfo: [],

    // 海报
    showPoster: false,
    posterLoading: false,
    posterPath: '',

    // 海报样式选择
    showStylePicker: false,   // 样式选择弹层
    posterStyle: 1,           // 1 = 经典海报（Canvas 含小程序码）| 2 = 在线诗画海报（服务端 API）
    posterTheme: 'ink',       // ink 水墨 | sunset 落日 | night 夜月
    posterFilter: 'none',     // none/sepia/warm/cool/gray/vivid

    // 海报字体（仅作用于本次海报，不改变阅读设置）
    posterFont: 'default',
    posterFonts: share.POSTER_FONT_OPTIONS,
    posterFromServer: false   // 在线海报由服务端直接出图（服务端字体，本地无法更换）
  },

  onLoad(options) {
    const o = options || {};
    // 朋友圈单页模式：无登录态、不允许跳转、storage 与普通模式不共用，需据此收敛交互
    const single = landing.isSinglePage();
    const kind = o.kind === 'author' ? 'author' : 'poem';
    const title = landing.safeDecode(o.title);
    const author = landing.safeDecode(o.author);
    const dynasty = landing.safeDecode(o.dynasty);
    const poemCount = parseInt(o.poemCount, 10) || 0;
    // 分享链接只带短正文种子 seed（避免超出 URL/query 长度限制），此处一并作为兜底正文
    const content = landing.safeDecode(o.content) || landing.safeDecode(o.seed);

    // 优先使用列表页跳转前缓存的完整数据（规避 URL 长度截断导致的正文缺失）
    const cached = kind === 'poem'
      ? poemCache.getCachedPoem({ id: o.id || '', title, author, content })
      : null;
    const id = (cached && cached.id != null && cached.id !== '') ? String(cached.id) : (o.id || '');
    const fullTitle = (cached && cached.title) || title;
    const fullAuthor = (cached && cached.author) || author;
    const fullDynasty = (cached && cached.dynasty) || dynasty;
    const fullType = (cached && cached.type) || landing.safeDecode(o.type);
    const fullContent = (cached && cached.content) || content;

    // 诗词标识：title 可能为空（API 大量佚名/无题记录），用 id/正文前缀兜底
    const poemRef = { id, title: fullTitle, author: fullAuthor, content: fullContent };

    this.setData({
      kind,
      id,
      title: fullTitle,
      content: fullContent,
      author: fullAuthor,
      dynasty: fullDynasty,
      type: fullType,
      source: landing.safeDecode(o.source),
      description: landing.safeDecode(o.description),
      poemCount,
      countText: poetry.fmtCount(poemCount),
      authorChar: fullTitle.slice(0, 1),
      fromSeed: !!(o.title || o.content || o.seed),
      contentMissing: kind === 'poem' && !fullContent,
      isSinglePage: single,
      isFavorited: kind === 'poem' ? storage.isPoemFavorited(poemRef) : false,
      liked: kind === 'poem' ? this._isLiked(poemRef) : false
    });

    // 搜一搜优化：导航栏标题「诗词名 · 作者」+ 页面信息上报
    this._setupSeo();

    this._enhanceDetail(kind, o.id);
    if (kind === 'author' && title) {
      this._loadAuthorPoems(true);
    }
    this._recordView();

    // 进入页面即应用阅读设置（onShow 兜底，避免首次进入时字号/字体未生效）
    settings.applyToPage(this);
  },

  /** 每次进入页面时应用阅读主题、字号与正文字体设置 */
  onShow() {
    settings.applyToPage(this);
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
    // 单页模式禁止跳转，改为提示
    if (this.data.isSinglePage) { this._tipUnavailable(); return; }
    const poem = e.currentTarget.dataset.poem;
    if (!poem || (!poem.title && !poem.content)) return;
    poemCache.cachePoem(poem);
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
   * ⚠️ /poems/:id 生产环境存在 500 故障 → 改用 /search?type=title 按标题检索完整正文，
   * 确保详情页展示全部诗词内容（列表页 seed 可能被 URL 长度限制截断，此处覆盖补全）
   */
  async _enhanceDetail(kind, id) {
    this.setData({ loading: true });
    try {
      if (kind === 'author') {
        if (!id) return;
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
        // 优先 /poems/:id；失败或正文缺失时回退按标题检索全文
        let p = null;
        if (id) {
          try {
            p = await poetry.getPoemDetail(id);
          } catch (e) {
            p = null;
          }
        }
        if (!p || !p.content) {
          try {
            p = await poetry.getPoemByTitle(this.data.title, this.data.author, this.data.content);
          } catch (e2) {
            p = null;
          }
        }
        if (!p) throw new Error('empty detail');
        const patch = {};
        // 仅当检索结果与 seed 正文一致（前缀匹配）时才用全文覆盖截断的 seed，
        // 避免同题多作（如苏轼多首《水龙吟》）时被搜索接口返回的第一首同名作品顶替
        const seedContent = (this.data.content || '').replace(/\s+/g, '');
        const foundContent = (p.content || '').replace(/\s+/g, '');
        const consistent = !seedContent || !foundContent || foundContent.indexOf(seedContent.slice(0, 12)) === 0;
        // 检索到的完整正文应覆盖 URL 截断的 seed（全文长度 >= 截断长度才覆盖）
        if (consistent && p.content && (!this.data.content || p.content.length >= this.data.content.length)) {
          patch.content = p.content;
          patch.contentMissing = false;
        }
        if (p.author) patch.author = p.author;
        if (p.dynasty) patch.dynasty = p.dynasty;
        if (p.type) patch.type = p.type;
        this.setData(patch);
      }
      // 增强数据（作者/朝代/全文）返回后刷新 SEO 标题与关键词
      this._setupSeo();
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

  // ── 搜一搜（SEO）────────────────────────
  /**
   * 搜一搜优化：
   * 1. 导航栏标题采用「诗词名 · 作者」，提升「李白《静夜思》」等组合关键词命中率；
   * 2. wx.setPageInfo 上报标题/关键词/摘要，供搜索结果展示（基础库 2.2.2+）。
   */
  _setupSeo() {
    const d = this.data;
    const title = (d.title || '').trim() || '无题';
    const author = (d.author || '').trim();
    const dynasty = d.dynasty || '';
    const type = d.type || '';

    // 导航栏标题：诗词 →「静夜思 · 李白」；诗人 →「李白的诗」（直接命中「李白的诗/苏轼的诗」搜索词）
    let navTitle;
    if (d.kind === 'author') {
      navTitle = title + '的诗';
    } else if (author && author !== '佚名') {
      navTitle = title + ' · ' + author;
    } else {
      navTitle = title;
    }
    if (navTitle.length > 24) navTitle = navTitle.slice(0, 24);
    // 单页模式下 setNavigationBarTitle 无效且会静默失败，统一走安全封装
    landing.setNavTitle(navTitle);

    if (!wx.setPageInfo) return;

    let kwParts;
    let description;
    if (d.kind === 'author') {
      // 诗人页：命中「李白的诗」「苏轼的诗」「诗人简介」等词
      kwParts = [title + '的诗', title, '诗人', dynasty, '唐诗', '宋词', '古诗', '诗词', '国学', '超然古诗词'];
      const intro = (d.description || '').replace(/\s+/g, '').slice(0, 40);
      description = ((dynasty ? dynasty + ' · ' : '') + title + '的诗' + (intro ? '，' + intro : '')).slice(0, 60);
    } else {
      // 诗词页：标题、作者、朝代、题材 + 通用词
      kwParts = [title, author, dynasty, type, '古诗', '唐诗', '宋词', '诗词', '国学', '超然古诗词'];
      const firstLine = (d.content || '').replace(/\s+/g, '').slice(0, 28);
      const who = [dynasty, author].filter(Boolean).join(' · ');
      description = ((who ? who + '《' + title + '》' : title) + (firstLine ? '，' + firstLine : '')).slice(0, 60);
    }
    const keywords = seo.buildKeywords(kwParts);

    try {
      wx.setPageInfo({ title: navTitle, keywords, description });
    } catch (_) {}

    // 数据（含增强后朝代/体裁/作者/全文）就绪后重建「诗词信息」文本块
    this._buildPoemInfo();
  },

  /** 构造「诗词信息」文本块（朝代/体裁/作者/名句），增强页面文本量与搜索结果可抓取度 */
  _buildPoemInfo() {
    const d = this.data;
    if (d.kind !== 'poem') {
      if (this.data.poemInfo.length) this.setData({ poemInfo: [] });
      return;
    }
    const info = [];
    if (d.dynasty) info.push({ label: '朝代', value: d.dynasty });
    if (d.type) info.push({ label: '体裁', value: d.type });
    if (d.author && d.author !== '佚名') info.push({ label: '作者', value: d.author });
    const firstLine = String(d.content || '').split('\n')[0].trim().slice(0, 24);
    if (firstLine) info.push({ label: '名句', value: firstLine });
    this.setData({ poemInfo: info });
  },

  // ── 收藏 ──────────────────────────────
  /** 单页模式下交互类能力（存储/剪贴板/画布/跳转）被禁用，统一给出引导提示 */
  _tipUnavailable() {
    wx.showToast({ title: '请打开小程序体验此功能', icon: 'none' });
  },

  toggleFavorite() {
    if (this.data.isSinglePage) { this._tipUnavailable(); return; }
    if (this.data.kind !== 'poem') return;
    const poem = {
      id: this.data.id,
      title: this.data.title,
      author: this.data.author,
      dynasty: this.data.dynasty,
      type: this.data.type,
      content: this.data.content
    };
    const fav = storage.toggleFavoritePoem(poem);
    this.setData({ isFavorited: fav });
    wx.showToast({ title: fav ? '已收藏' : '已取消收藏', icon: 'success', duration: 1200 });
    // 已登录用户即时同步云端
    const app = getApp();
    if (app && app.globalData && app.globalData.isLogin && app.globalData.openid) {
      app._syncFavoritesToCloud(app.globalData.openid);
    }
  },

  // ── 点赞 ──────────────────────────────
  _isLiked(poem) {
    try {
      const list = wx.getStorageSync('liked_poems') || [];
      const key = storage.getPoemKey(poem);
      return list.some(p => storage.getPoemKey(p) === key);
    } catch (_) { return false; }
  },

  toggleLike() {
    if (this.data.isSinglePage) { this._tipUnavailable(); return; }
    if (this.data.kind !== 'poem') return;
    const poem = {
      id: this.data.id,
      title: this.data.title,
      author: this.data.author,
      content: this.data.content
    };
    const key = storage.getPoemKey(poem);
    try {
      let list = wx.getStorageSync('liked_poems') || [];
      const idx = list.findIndex(p => storage.getPoemKey(p) === key);
      let liked = false;
      if (idx >= 0) {
        list.splice(idx, 1);
      } else {
        list.unshift({ ...poem, likedAt: Date.now() });
        liked = true;
      }
      wx.setStorageSync('liked_poems', list.slice(0, 100));
      this.setData({ liked });
      wx.showToast({ title: liked ? '已点赞' : '已取消点赞', icon: 'none', duration: 1200 });
    } catch (_) {}
  },

  // ── 海报（样式选择 → 生成 → 预览）─────────────
  noop() {},

  /** 点击底部「海报」：先弹出样式选择（经典含小程序码 / 在线诗画海报） */
  createPoster() {
    if (this.data.isSinglePage) { this._tipUnavailable(); return; }
    if (this.data.kind !== 'poem') {
      wx.showToast({ title: '仅诗词支持生成海报', icon: 'none' });
      return;
    }
    if (!this.data.content && !this.data.title) {
      wx.showToast({ title: '缺少诗词内容', icon: 'none' });
      return;
    }
    if (this.data.posterLoading) return;
    this.setData({ showStylePicker: true });
  },

  /** 选择海报样式：1 = 经典（Canvas 含小程序码），2 = 在线诗画（服务端 API） */
  pickPosterStyle(e) {
    const v = Number((e.currentTarget.dataset && e.currentTarget.dataset.style) || 1);
    this.setData({ posterStyle: v === 2 ? 2 : 1 });
  },

  pickPosterTheme(e) {
    const v = (e.currentTarget.dataset && e.currentTarget.dataset.theme) || 'ink';
    this.setData({ posterTheme: v });
  },

  pickPosterFilter(e) {
    const v = (e.currentTarget.dataset && e.currentTarget.dataset.filter) || 'none';
    this.setData({ posterFilter: v });
  },

  closeStylePicker() {
    this.setData({ showStylePicker: false });
  },

  /** 切换海报字体：本地重绘预览（经典海报 / 在线海报的 svg 降级产物） */
  async pickPosterFont(e) {
    const key = (e.currentTarget.dataset && e.currentTarget.dataset.font) || 'default';
    if (this.data.posterLoading || key === this.data.posterFont) return;
    if (this.data.posterFromServer) {
      wx.showToast({ title: '在线海报由服务端出图，字体不可更换', icon: 'none', duration: 1800 });
      return;
    }
    this.setData({ posterFont: key });
    // 复用已获取的 svg（字体重绘无需再次请求接口，避免触发 10 次/分钟限流）
    await this._buildPoster(true);
  },

  /** 按所选样式生成海报并进入预览弹层 */
  async confirmPoster() {
    if (this.data.posterLoading) return;
    this.setData({ showStylePicker: false, showPoster: true });
    // 主题/滤镜可能已变更，不复用上次 svg，重新请求服务端
    await this._buildPoster(false);
  },

  /**
   * 按当前参数生成（或重绘）海报预览
   * @param {boolean} reuseSvg 是否复用上次的 svg（仅字体切换时使用）
   */
  async _buildPoster(reuseSvg) {
    if (!reuseSvg) this._posterSvg = null;
    this.setData({ posterLoading: true, posterPath: '' });
    try {
      const path = this.data.posterStyle === 2
        ? await this._generateApiPoster()
        : await this._generateClassicPoster();
      this.setData({ posterPath: path, posterLoading: false });
    } catch (e) {
      console.error('[PoetryDetail] poster failed:', e);
      this.setData({ posterLoading: false });
      wx.showToast({ title: this._posterErrorText(e), icon: 'none' });
    }
  },

  /** 经典海报：Canvas 2D 本地绘制（完整正文 + 底部小程序码） */
  _generateClassicPoster() {
    return share.generatePoemPoster(this, {
      title: this.data.title || '无题',
      author: this.data.author || '',
      dynasty: this.data.dynasty || '',
      type: this.data.type || '',
      content: this.data.content || '',
      canvasId: 'posterCanvas',
      font: this.data.posterFont
    });
  },

  /**
   * 在线诗画海报：POST /poster（chinesepoetry.space 服务端渲染 1080×1440）
   * 优先按 poemId 使用库内正文；id 非数值/库内查无时回退为 title+content 自定内容渲染。
   * 产物策略（接口限流 10 次/分钟）：
   *   ① 服务端返回 pngBase64（已配中文字体）→ 直接写本地 PNG；
   *   ② 仅返回 svg（服务端缺字体）→ 用 Canvas 2D 本地栅格化导出 PNG。
   */
  async _generateApiPoster() {
    // 字体切换时复用上次拿到的 svg 本地重绘：不重复请求接口（限流 10 次/分钟）
    if (this._posterSvg) {
      const cached = this._posterSvg;
      return share.renderSvgToTempFile(this, cached.svg, {
        width: cached.width,
        height: cached.height,
        font: this.data.posterFont
      });
    }

    const d = this.data;
    const common = {
      theme: d.posterTheme || 'ink',
      filter: d.posterFilter || 'none',
      format: 'png'
    };
    const author = (d.author || '').trim();
    const dynasty = (d.dynasty || '').trim();
    if (author) common.author = author.length > 32 ? author.slice(0, 32) : author;
    if (dynasty) common.dynasty = dynasty.length > 16 ? dynasty.slice(0, 16) : dynasty;

    const content = (d.content || '').trim();
    const numericId = /^[1-9]\d*$/.test(String(d.id || '')) ? Number(d.id) : null;
    let res = null;
    if (numericId) {
      try {
        res = await poetry.createPoster(Object.assign({}, common, { poemId: numericId }));
      } catch (e) {
        // 限流不再重试；库内查无该 poemId 且有正文 → 回退自定正文渲染
        if ((e && e.code) === 'HTTP_429') throw e;
        if (!content) throw e;
      }
    }
    if (!res && content) {
      const title = ((d.title || '').trim() || this._safeTitle());
      res = await poetry.createPoster(Object.assign({}, common, {
        title: title.slice(0, 64),
        content: content.slice(0, 5000)
      }));
    }
    if (!res) throw new Error('poster empty response');

    // ① 服务端返回 PNG（已配置中文字体）→ 直接落盘为本地 PNG
    //    该路径由服务端渲染，字体由服务端决定，本地不可更换
    if (res.pngBase64) {
      this.setData({ posterFromServer: true });
      return share.persistPosterBase64(res.pngBase64);
    }

    // ② 服务端缺中文字体只返回 svg → 本地 Canvas 栅格化为 PNG（字体可本地切换）
    if (res.svg) {
      this._posterSvg = {
        svg: res.svg,
        width: res.width || 1080,
        height: res.height || 1440
      };
      this.setData({ posterFromServer: false });
      try {
        return await share.renderSvgToTempFile(this, res.svg, {
          width: res.width || 1080,
          height: res.height || 1440,
          font: this.data.posterFont
        });
      } catch (e) {
        console.error('[PoetryDetail] svg rasterize failed:', e);
        const err = new Error('svg raster failed');
        err.code = 'SVG_RASTER_FAIL';
        throw err;
      }
    }
    throw new Error('poster empty png');
  },

  /** 海报生成失败提示（区分 API 限流/服务端错误与本地画布失败） */
  _posterErrorText(e) {
    const code = (e && e.code) || '';
    if (code === 'HTTP_429') return '生成太频繁，请稍后再试';
    if (code === 'HTTP_404' || code === 'NOT_FOUND') return '未找到该诗词，请换种样式试试';
    if (code === 'HTTP_500' || code === 'HTTP_502' || code === 'HTTP_504') return '海报服务繁忙，请稍后重试';
    if (code === 'SVG_RASTER_FAIL') return '在线海报渲染失败，请改用经典海报样式';
    return '海报生成失败，请重试';
  },

  closePoster() {
    this.setData({ showPoster: false, posterPath: '', posterLoading: false });
  },

  async savePoster() {
    if (this.data.isSinglePage) { this._tipUnavailable(); return; }
    if (!this.data.posterPath) return;
    try {
      await share.savePosterToAlbum(this.data.posterPath);
    } catch (_) {
      // 权限拒绝/取消等已在 savePosterToAlbum 内提示
    }
  },

  // ── 复制 ──────────────────────────────
  copyContent() {
    if (this.data.isSinglePage) { this._tipUnavailable(); return; }
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
    // 单页模式禁止一切页面跳转
    if (this.data.isSinglePage) { this._tipUnavailable(); return; }
    const pages = getCurrentPages();
    if (pages.length > 1) {
      wx.navigateBack({ delta: 1 });
    } else {
      wx.switchTab({ url: '/pages/home/index' });
    }
  },

  // ── 分享 ──────────────────────────────
  /** 提取可分享标题：title 为空时用正文首句兜底，仍无则用「无名诗」 */
  _safeTitle() {
    const d = this.data;
    let title = (d.title || '').trim();
    if (!title) {
      const m = (d.content || '').match(/[^\n。！？!?]+[。！？!?]?/);
      title = (m && m[0] ? m[0].trim() : '').slice(0, 20);
    }
    return title || '无名诗';
  },

  /** 组装分享标题：佚名/空作者不署名，避免「《》—— 佚名」的奇怪文案 */
  _shareTitle() {
    const d = this.data;
    if (d.kind === 'author') {
      return d.title + ' · ' + (d.dynasty || '诗人');
    }
    const title = this._safeTitle();
    const author = (d.author || '').trim();
    const authorText = author && author !== '佚名' ? '—— ' + author : '';
    return '《' + title + '》' + authorText;
  },

  /**
   * 组装分享落地 URL：携带完整 seed（id/title/author/dynasty/type/content），
   * 确保单页模式（朋友圈）下接收方仅凭 query 即可渲染正文，不依赖登录态/本地存储。
   * 正文超长时逐轮截断，保证 path/query 不超微信上限。
   * @param {string} [from] 分享来源标记（timeline = 朋友圈单页模式）
   * @returns {string} 完整落地路径（含 query）
   */
  _buildSharePath(from) {
    const d = this.data;
    const qs = [
      'kind=' + d.kind,
      'id=' + encodeURIComponent(d.id == null ? '' : String(d.id)),
      'title=' + encodeURIComponent(d.title || this._safeTitle()),
      'author=' + encodeURIComponent(d.author || ''),
      'dynasty=' + encodeURIComponent(d.dynasty || ''),
      'type=' + encodeURIComponent(d.type || '')
    ];
    if (from) qs.push('from=' + from);
    const base = '/pages/chinesepoetry_detail/index?' + qs.join('&');
    // 诗人页无需正文 seed；诗词页正文缺失时也无需携带
    if (d.kind !== 'poem' || !d.content) return base;
    let content = d.content;
    let url = base;
    for (let i = 0; i < 3; i++) {
      url = base + '&content=' + encodeURIComponent(content);
      if (url.length <= 1500) break; // 朋友圈 query 上限更严格，留余量
      content = content.slice(0, Math.floor(content.length * 0.7));
    }
    return url;
  },

  onShareAppMessage() {
    return {
      title: this._shareTitle(),
      path: this._buildSharePath()
    };
  },

  onShareTimeline() {
    const path = this._buildSharePath('timeline');
    const qIndex = path.indexOf('?');
    return {
      title: this._shareTitle(),
      query: qIndex >= 0 ? path.slice(qIndex + 1) : 'from=timeline'
    };
  }
});
