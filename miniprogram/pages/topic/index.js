// pages/topic/index.js - 静态专题页（唐诗三百首/宋词精选/古诗词名句/唐诗鉴赏）
// 数据内置在 utils/topicData.js，无网络依赖，正文随包渲染，爬虫 100% 可抓。
const topicData = require('../../utils/topicData');
const poemCache = require('../../utils/poemCache');
const settings = require('../../utils/settings');
const seo = require('../../utils/seo');

Page({
  data: {
    type: 'tangshi300',
    title: '',
    subtitle: '',
    desc: '',
    badge: '',
    items: []
  },

  onLoad(options) {
    const o = options || {};
    const topic = topicData.getTopic(o.type);

    // 全文按行拆分，WXML 逐行渲染（爬虫可抓正文）
    const items = (topic.items || []).map((it) => {
      const p = Object.assign({}, it);
      p.lines = String(p.content || '').split('\n').filter((l) => l.trim());
      p.preview = (p.content || '').replace(/\s+/g, '').slice(0, 30);
      return p;
    });

    this.setData({
      type: topic.type,
      title: topic.title,
      subtitle: topic.subtitle,
      desc: topic.desc,
      badge: topic.badge,
      items
    });

    this._setupSeo(topic);
  },

  onShow() {
    settings.applyToPage(this);
  },

  /** 搜一搜优化：按专题上报标题与关键词（命中「唐诗三百首/宋词/古诗词名句/唐诗鉴赏」） */
  _setupSeo(topic) {
    const topics = topicData.getTopics();
    const allTitles = topics.map((t) => t.title);
    const keywordParts = (topic.keywords || []).concat(allTitles, ['诗词', '古诗', '唐诗', '宋词', '国学', '超然古诗词']);
    seo.reportPageInfo({
      title: topic.title + ' · 全文赏析',
      navTitle: topic.title,
      keywords: seo.buildKeywords(keywordParts),
      description: topic.seoDesc
    });
  },

  /** 卡片点击 → 诗词详情页（先缓存完整数据，规避 URL 截断） */
  goDetail(e) {
    const p = e.currentTarget.dataset.poem;
    if (!p || (!p.title && !p.content)) return;
    poemCache.cachePoem(p);
    wx.navigateTo({ url: this._buildPoemUrl(p) });
  },

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

  onShareAppMessage() {
    const d = this.data;
    const first = d.items && d.items[0];
    const title = first && first.sentence
      ? `「${first.sentence}」${first.title} · ${first.author}`
      : (first ? `${first.title} · ${first.author}` : d.title);
    return {
      title: `${title}｜${d.title} · 超然古诗词`,
      path: '/pages/topic/index?type=' + d.type
    };
  },

  onShareTimeline() {
    const d = this.data;
    return {
      title: `${d.title}｜${d.subtitle} · 超然古诗词`,
      query: 'type=' + d.type
    };
  }
});
