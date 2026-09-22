// pages/week_hot/index.js - 本周最热门诗词（榜单页）
// 数据源：/stats/reading 的 topPoems（服务端暂无阅读记录时返回空，见 api.md 勘误），
// 此处优先尝试实时热度，失败/为空时优雅降级为内置精选名篇榜。
const poetry = require('../../utils/poetryApi');
const poemCache = require('../../utils/poemCache');
const settings = require('../../utils/settings');
const seo = require('../../utils/seo');

// 兜底榜单：精选传世名篇（count 为模拟本周阅读量，仅作展示排序）
const WEEK_HOT_FALLBACK = [
  { id: 1, title: '静夜思', author: '李白', dynasty: '唐', type: '五言绝句', count: 12345, content: '床前明月光，疑是地上霜。\n举头望明月，低头思故乡。', preview: '床前明月光，疑是地上霜' },
  { id: 2, title: '水调歌头·明月几时有', author: '苏轼', dynasty: '宋', type: '宋词', count: 11086, content: '明月几时有？把酒问青天。\n不知天上宫阙，今夕是何年。\n我欲乘风归去，又恐琼楼玉宇，高处不胜寒。\n起舞弄清影，何似在人间。\n转朱阁，低绮户，照无眠。\n不应有恨，何事长向别时圆？\n人有悲欢离合，月有阴晴圆缺，此事古难全。\n但愿人长久，千里共婵娟。', preview: '明月几时有？把酒问青天' },
  { id: 3, title: '春晓', author: '孟浩然', dynasty: '唐', type: '五言绝句', count: 9862, content: '春眠不觉晓，处处闻啼鸟。\n夜来风雨声，花落知多少。', preview: '春眠不觉晓，处处闻啼鸟' },
  { id: 4, title: '望岳', author: '杜甫', dynasty: '唐', type: '五言律诗', count: 9210, content: '岱宗夫如何？齐鲁青未了。\n造化钟神秀，阴阳割昏晓。\n荡胸生曾云，决眦入归鸟。\n会当凌绝顶，一览众山小。', preview: '会当凌绝顶，一览众山小' },
  { id: 5, title: '登鹳雀楼', author: '王之涣', dynasty: '唐', type: '五言绝句', count: 8876, content: '白日依山尽，黄河入海流。\n欲穷千里目，更上一层楼。', preview: '白日依山尽，黄河入海流' },
  { id: 6, title: '满江红·怒发冲冠', author: '岳飞', dynasty: '宋', type: '宋词', count: 8452, content: '怒发冲冠，凭栏处、潇潇雨歇。\n抬望眼，仰天长啸，壮怀激烈。\n三十功名尘与土，八千里路云和月。\n莫等闲、白了少年头，空悲切。\n靖康耻，犹未雪。臣子恨，何时灭。\n驾长车，踏破贺兰山缺。\n壮志饥餐胡虏肉，笑谈渴饮匈奴血。\n待从头、收拾旧山河，朝天阙。', preview: '怒发冲冠，凭栏处、潇潇雨歇' },
  { id: 7, title: '念奴娇·赤壁怀古', author: '苏轼', dynasty: '宋', type: '宋词', count: 8137, content: '大江东去，浪淘尽，千古风流人物。\n故垒西边，人道是，三国周郎赤壁。\n乱石穿空，惊涛拍岸，卷起千堆雪。\n江山如画，一时多少豪杰。\n遥想公瑾当年，小乔初嫁了，雄姿英发。\n羽扇纶巾，谈笑间，樯橹灰飞烟灭。\n故国神游，多情应笑我，早生华发。\n人生如梦，一尊还酹江月。', preview: '大江东去，浪淘尽，千古风流人物' },
  { id: 8, title: '如梦令·常记溪亭日暮', author: '李清照', dynasty: '宋', type: '宋词', count: 7960, content: '常记溪亭日暮，沉醉不知归路。\n兴尽晚回舟，误入藕花深处。\n争渡，争渡，惊起一滩鸥鹭。', preview: '常记溪亭日暮，沉醉不知归路' },
  { id: 9, title: '锦瑟', author: '李商隐', dynasty: '唐', type: '七言律诗', count: 7654, content: '锦瑟无端五十弦，一弦一柱思华年。\n庄生晓梦迷蝴蝶，望帝春心托杜鹃。\n沧海月明珠有泪，蓝田日暖玉生烟。\n此情可待成追忆？只是当时已惘然。', preview: '此情可待成追忆？只是当时已惘然' },
  { id: 10, title: '出塞', author: '王昌龄', dynasty: '唐', type: '七言绝句', count: 7312, content: '秦时明月汉时关，万里长征人未还。\n但使龙城飞将在，不教胡马度阴山。', preview: '秦时明月汉时关，万里长征人未还' },
  { id: 11, title: '将进酒', author: '李白', dynasty: '唐', type: '乐府诗', count: 7089, content: '君不见，黄河之水天上来，奔流到海不复回。\n君不见，高堂明镜悲白发，朝如青丝暮成雪。\n人生得意须尽欢，莫使金樽空对月。\n天生我材必有用，千金散尽还复来。\n烹羊宰牛且为乐，会须一饮三百杯。\n岑夫子，丹丘生，将进酒，杯莫停。\n与君歌一曲，请君为我倾耳听。\n钟鼓馔玉不足贵，但愿长醉不复醒。\n古来圣贤皆寂寞，惟有饮者留其名。\n陈王昔时宴平乐，斗酒十千恣欢谑。\n主人何为言少钱，径须沽取对君酌。\n五花马，千金裘，呼儿将出换美酒，与尔同销万古愁。', preview: '君不见，黄河之水天上来' },
  { id: 12, title: '声声慢·寻寻觅觅', author: '李清照', dynasty: '宋', type: '宋词', count: 6721, content: '寻寻觅觅，冷冷清清，凄凄惨惨戚戚。\n乍暖还寒时候，最难将息。\n三杯两盏淡酒，怎敌他、晚来风急！\n雁过也，正伤心，却是旧时相识。\n满地黄花堆积，憔悴损，如今有谁堪摘？\n守着窗儿，独自怎生得黑！\n梧桐更兼细雨，到黄昏、点点滴滴。\n这次第，怎一个愁字了得！', preview: '寻寻觅觅，冷冷清清' },
  { id: 13, title: '青玉案·元夕', author: '辛弃疾', dynasty: '宋', type: '宋词', count: 6415, content: '东风夜放花千树，更吹落、星如雨。\n宝马雕车香满路。\n凤箫声动，玉壶光转，一夜鱼龙舞。\n蛾儿雪柳黄金缕，笑语盈盈暗香去。\n众里寻他千百度，蓦然回首，那人却在，灯火阑珊处。', preview: '东风夜放花千树，更吹落星如雨' },
  { id: 14, title: '长恨歌（节选）', author: '白居易', dynasty: '唐', type: '乐府诗', count: 6198, content: '汉皇重色思倾国，御宇多年求不得。\n杨家有女初长成，养在深闺人未识。\n天生丽质难自弃，一朝选在君王侧。\n回眸一笑百媚生，六宫粉黛无颜色。\n春寒赐浴华清池，温泉水滑洗凝脂。\n侍儿扶起娇无力，始是新承恩泽时。', preview: '回眸一笑百媚生，六宫粉黛无颜色' },
  { id: 15, title: '望庐山瀑布', author: '李白', dynasty: '唐', type: '七言绝句', count: 5874, content: '日照香炉生紫烟，遥看瀑布挂前川。\n飞流直下三千尺，疑是银河落九天。', preview: '飞流直下三千尺，疑是银河落九天' },
  { id: 16, title: '江雪', author: '柳宗元', dynasty: '唐', type: '五言绝句', count: 5632, content: '千山鸟飞绝，万径人踪灭。\n孤舟蓑笠翁，独钓寒江雪。', preview: '千山鸟飞绝，万径人踪灭' },
  { id: 17, title: '相思', author: '王维', dynasty: '唐', type: '五言绝句', count: 5410, content: '红豆生南国，春来发几枝。\n愿君多采撷，此物最相思。', preview: '红豆生南国，春来发几枝' },
  { id: 18, title: '题西林壁', author: '苏轼', dynasty: '宋', type: '七言绝句', count: 5198, content: '横看成岭侧成峰，远近高低各不同。\n不识庐山真面目，只缘身在此山中。', preview: '不识庐山真面目，只缘身在此山中' },
  { id: 19, title: '木兰诗（节选）', author: '佚名', dynasty: '南北朝', type: '乐府诗', count: 4986, content: '唧唧复唧唧，木兰当户织。\n不闻机杼声，唯闻女叹息。\n问女何所思，问女何所忆。\n女亦无所思，女亦无所忆。\n昨夜见军帖，可汗大点兵。\n军书十二卷，卷卷有爷名。', preview: '唧唧复唧唧，木兰当户织' },
  { id: 20, title: '敕勒歌', author: '佚名', dynasty: '南北朝', type: '乐府诗', count: 4621, content: '敕勒川，阴山下。天似穹庐，笼盖四野。\n天苍苍，野茫茫，风吹草低见牛羊。', preview: '天苍苍，野茫茫，风吹草低见牛羊' }
].map((p, i) => Object.assign({}, p, {
  rank: i + 1,
  countText: poetry.fmtCount(p.count)
}));

Page({
  data: {
    list: [],
    loading: true,
    loaded: false,
    isSeed: false     // true = 使用内置精选榜（实时热度不可用）
  },

  onLoad() {
    // 搜一搜优化：榜单页上报标题/关键词/摘要（优质内容页，利于收录与展示）
    seo.reportPageInfo({
      title: '本周最热门诗词榜 · 超然古诗词',
      keywords: seo.buildKeywords(['热门诗词', '诗词排行榜', '本周热门', '唐诗', '宋词', '名句', '古诗词', '超然古诗词']),
      description: '本周最热门诗词排行榜：静夜思、水调歌头、将进酒等传世名篇人气榜单，实时更新。'
    });
    this._load();
  },

  onShow() {
    settings.applyToPage(this);
  },

  onPullDownRefresh() {
    this._load().finally(() => wx.stopPullDownRefresh());
  },

  /** 加载榜单：优先实时热度（/stats/reading），失败/为空时降级为精选名篇榜 */
  async _load() {
    this.setData({ loading: true });
    try {
      const stats = await poetry.getReadingStats();
      const raw = (stats.topPoems || [])
        .filter((t) => t && t.poemTitle && Number(t.count) > 0)
        .slice(0, 10);
      if (raw.length) {
        const enriched = await this._enrich(raw);
        if (enriched.length) {
          this.setData({ list: enriched, isSeed: false, loading: false, loaded: true });
          return;
        }
      }
    } catch (e) {
      console.warn('[WeekHot] load stats failed:', (e && e.message) || e);
    }
    this.setData({ list: WEEK_HOT_FALLBACK, isSeed: true, loading: false, loaded: true });
  },

  /** 按标题补齐实时热门诗词的完整数据（/search 兜底；解析失败的条目跳过） */
  async _enrich(topPoems) {
    const results = await Promise.allSettled(topPoems.map(async (t, i) => {
      try {
        const p = await poetry.getPoemByTitle(t.poemTitle, '', '');
        if (!p || (!p.title && !p.content)) return null;
        return {
          rank: i + 1,
          id: p.id != null ? p.id : t.poemId,
          title: p.title || t.poemTitle,
          content: p.content || '',
          author: p.author || '',
          dynasty: p.dynasty || '',
          type: p.type || '',
          preview: p.preview || '',
          count: Number(t.count) || 0,
          countText: poetry.fmtCount(t.count)
        };
      } catch (err) {
        return null;
      }
    }));
    return results
      .filter((r) => r.status === 'fulfilled' && r.value)
      .map((r) => r.value);
  },

  /** 诗词 → 详情（seed 跳转，规避 /poems/:id 500 故障） */
  goDetail(e) {
    const poem = e.currentTarget.dataset.poem;
    if (!poem || (!poem.title && !poem.content)) return;
    poemCache.cachePoem(poem);
    wx.navigateTo({ url: this._buildPoemUrl(poem) });
  },

  /** 组装诗词详情页 URL（超长时截断 content 保证跳转可用） */
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
    const p = (this.data.list || [])[0];
    return {
      title: p
        ? '本周最热门诗词 · Top1《' + (p.title || '无题') + '》'
        : '本周最热门诗词 · 超然古诗词',
      path: '/pages/week_hot/index'
    };
  },

  onShareTimeline() {
    return {
      title: '本周最热门诗词 · 超然古诗词',
      query: 'from=timeline'
    };
  }
});
