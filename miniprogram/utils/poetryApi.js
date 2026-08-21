/**
 * utils/poetryApi.js - Poetry Gateway API 客户端
 *
 * 数据源：https://www.chinesepoetry.space（接口文档见项目根目录 api.md）
 * 该网关为独立 HTTP 服务（非微信云函数），小程序端通过 wx.request 调用。
 *
 * ⚠️ 生产环境注意事项：
 *   1. 需在小程序后台「开发管理 → 服务器域名 → request 合法域名」添加
 *      https://www.chinesepoetry.space，否则真机无法请求。
 *   2. 开发工具中请勾选「不校验合法域名、web-view（业务域名）、TLS 版本以及 HTTPS 证书」。
 *   3. 所有接口在请求失败时提供内置兜底数据（FALLBACK_*），保证页面可正常展示。
 *
 * 已按 api.md「生产环境实测勘误（2026-08）」适配：
 *   - /categories、/discover 的 dynasties/types 包裹为 { data: [...] }，此处做解包
 *   - /poems 的 dynasty/type/author 筛选参数被忽略 → 分类浏览改用 /poems/random（筛选真实生效）
 *   - /poems/random 零匹配返回 HTTP 500 → 由页面归类为「分类暂不可用」
 *   - /poems/:id 存在 500 故障 → 详情页使用列表页 seed 数据兜底渲染
 *   - /authors id 为字符串 → 原样透传，不做强转
 */

const BASE_URL = 'https://www.chinesepoetry.space/api/v1';
// 实测 /categories 等聚合接口响应可达 6s+，8s 超时在服务端负载高时频繁触发兜底，放宽到 15s
const TIMEOUT = 15000;

class PoetryError extends Error {
  constructor(code, message) {
    super(message || '请求失败');
    this.name = 'PoetryError';
    this.code = code;
  }
}

/**
 * 统一请求封装
 * 成功：resolve(data)（已剥离 { success, data } 包裹）
 * 失败：reject(PoetryError)，code 为 HTTP_xxx / NETWORK_ERROR / PARSE_ERROR
 */
function request(path, options = {}) {
  const { method = 'GET', data = {} } = options;
  return new Promise((resolve, reject) => {
    wx.request({
      url: BASE_URL + path,
      method,
      data,
      timeout: TIMEOUT,
      header: { 'Content-Type': 'application/json' },
      success(res) {
        const { statusCode, data: body } = res;
        if (statusCode >= 200 && statusCode < 300) {
          try {
            const payload = (body && body.data !== undefined) ? body.data : body;
            resolve(payload);
          } catch (e) {
            reject(new PoetryError('PARSE_ERROR', '响应解析失败'));
          }
          return;
        }
        reject(new PoetryError('HTTP_' + statusCode, '服务异常（' + statusCode + '）'));
      },
      fail(err) {
        reject(new PoetryError('NETWORK_ERROR', (err && err.errMsg) || '网络请求失败'));
      }
    });
  });
}

// ─── 数据归一化 ──────────────────────────────────────────────

/** 诗词对象统一字段（兼容 id 为数字/字符串、字段缺失等情况） */
function normalizePoem(p) {
  if (!p || typeof p !== 'object') return null;
  const id = p.id !== undefined && p.id !== null ? p.id : (p.title || '') + '|' + (p.author || '');
  const content = p.content || '';
  return {
    id,
    title: p.title || '',
    content,
    author: p.author || '',
    dynasty: p.dynasty || '',
    type: p.type || '',
    preview: (content || '').replace(/\s+/g, '').slice(0, 26)
  };
}

/** 作者对象统一字段（id 保持原样：实测为字符串）
 * 实测 /authors 多数作者的 poemCount/description 为 null，此处用知名作者 seed 补全，
 * 保证列表卡片与详情页有可用简介、作品数不显示「0首」。
 */
function normalizeAuthor(a) {
  if (!a || typeof a !== 'object') return null;
  const name = a.name || '';
  const seed = name ? (FALLBACK_AUTHORS.find((s) => s.name === name) || null) : null;

  const count =
    a.poemCount !== undefined && a.poemCount !== null
      ? a.poemCount
      : (a.poem_count !== undefined && a.poem_count !== null ? a.poem_count : 0);
  const poemCount = count || (seed ? seed.poemCount : 0);

  return {
    id: a.id,
    name,
    dynasty: a.dynasty || (seed ? seed.dynasty : ''),
    description: a.description || (seed ? seed.description : ''),
    poemCount,
    countText: poemCount > 0 ? fmtCount(poemCount) : '',
    char: name.slice(0, 1)
  };
}

/** 数字格式化：371313 → 37.1万 */
function fmtCount(n) {
  const num = Number(n) || 0;
  if (num >= 100000000) return (num / 100000000).toFixed(1) + '亿';
  if (num >= 10000) return (num / 10000).toFixed(1) + '万';
  return String(num);
}

// ─── 接口：聚合 ──────────────────────────────────────────────

/** GET /quote 每日一句 */
async function getQuote() {
  const d = await request('/quote');
  return {
    content: d.content || '',
    author: d.author || '',
    source: d.source || '',
    date: d.date || ''
  };
}

/** GET /solar-term 节气推荐 */
async function getSolarTerm() {
  const d = await request('/solar-term');
  return {
    termName: d.termName || '',
    termDescription: d.termDescription || '',
    poem: normalizePoem(d.poem),
    reason: d.reason || ''
  };
}

/** GET /recommend 为你推荐（5 首/批 + reason，翻页可能重复，由页面去重） */
async function getRecommend() {
  const d = await request('/recommend');
  const poems = (Array.isArray(d.poems) ? d.poems : [])
    .map(normalizePoem)
    .filter(Boolean);
  return { poems, reason: d.reason || '' };
}

/** GET /categories 分类聚合（实测 dynasties/types 包裹为 { data: [...] }，此处解包） */
async function getCategories() {
  const d = await request('/categories');
  const unwrap = (v) => (Array.isArray(v) ? v : (v && Array.isArray(v.data) ? v.data : []));
  const dynasties = unwrap(d.dynasties).map((it) => ({
    id: it.id,
    name: it.name || '',
    start_year: it.start_year !== undefined ? it.start_year : (it.startYear || null),
    end_year: it.end_year !== undefined ? it.end_year : (it.endYear || null),
    poemCount: it.poem_count !== undefined ? it.poem_count : it.poemCount || 0,
    authorCount: it.author_count !== undefined ? it.author_count : it.authorCount || 0,
    countText: fmtCount(it.poem_count !== undefined ? it.poem_count : it.poemCount || 0)
  }));
  const types = unwrap(d.types).map((it) => ({
    id: it.id,
    name: it.name || '',
    poemCount: it.poem_count !== undefined ? it.poem_count : it.poemCount || 0,
    countText: fmtCount(it.poem_count !== undefined ? it.poem_count : it.poemCount || 0)
  }));
  return { dynasties, types };
}

/** GET /home 首页聚合（实测仅 featuredPoem + featuredAuthor） */
async function getHome() {
  const d = await request('/home');
  return {
    featuredPoem: normalizePoem(d.featuredPoem),
    featuredAuthor: normalizeAuthor(d.featuredAuthor)
  };
}

// ─── 接口：诗词 ──────────────────────────────────────────────

/** GET /poems 诗词列表（实测筛选参数被忽略，仅分页生效；"是否到底"用条数 < pageSize 判断） */
async function getPoems(options = {}) {
  const { page = 1, pageSize = 20 } = options;
  const d = await request('/poems', { data: { page, pageSize } });
  const poems = (Array.isArray(d.poems) ? d.poems : [])
    .map(normalizePoem)
    .filter(Boolean);
  return { poems, page, pageSize, hasMore: poems.length >= pageSize };
}

/** GET /poems/random 随机诗词（唯一筛选真实生效的端点；零匹配会 500） */
async function getRandomPoem(filters = {}) {
  const data = {};
  if (filters.dynasty) data.dynasty = filters.dynasty;
  if (filters.type) data.type = filters.type;
  if (filters.author) data.author = filters.author;
  if (filters.char) data.char = filters.char;
  const d = await request('/poems/random', { data });
  return normalizePoem(d && d.poem ? d.poem : d);
}

/** GET /poems/:id 诗词详情（⚠️ 生产环境此端点 500 故障，调用方需兜底） */
async function getPoemDetail(id) {
  const d = await request('/poems/' + id);
  return normalizePoem(d && d.poem ? d.poem : d);
}

// ─── 接口：作者 ──────────────────────────────────────────────

/** GET /authors 作者列表（实测 id 为字符串，无分页元数据）
 * 过滤空名/「无名氏」等无展示价值的作者，保留其余供横向滚动展示 */
async function getAuthors(options = {}) {
  const { page = 1, pageSize = 20 } = options;
  const d = await request('/authors', { data: { page, pageSize } });
  const authors = (Array.isArray(d.authors) ? d.authors : [])
    .map(normalizeAuthor)
    .filter((a) => a && a.name && a.name !== '无名氏');
  return { authors, page, pageSize, hasMore: authors.length >= pageSize };
}

/** GET /authors/:id 作者详情（实测仅返回 dynasty/description/poemCount，缺 id/name） */
async function getAuthorDetail(id) {
  const d = await request('/authors/' + id);
  return {
    dynasty: d.dynasty || '',
    description: d.description || '',
    poemCount: d.poemCount !== undefined ? d.poemCount : 0
  };
}

// ─── 接口：搜索 ──────────────────────────────────────────────

/** GET /search 全文搜索（实测无 total，用条数 < pageSize 判断是否到底） */
async function getSearch(q, options = {}) {
  const { type = 'all', page = 1, pageSize = 20 } = options;
  const d = await request('/search', { data: { q, type, page, pageSize } });
  const poems = (Array.isArray(d.poems) ? d.poems : [])
    .map(normalizePoem)
    .filter(Boolean);
  return { poems, query: d.query || q, page, pageSize, hasMore: poems.length >= pageSize };
}

/**
 * GET /search?type=author 某作者的全部诗词（分页）
 * ⚠️ /poems 的 author 筛选被服务端忽略；唯一能按作者分页拉取全部作品的是 /search 的 type=author
 * 实测 page 参数生效，无 total 元数据 → 用「条数 < pageSize」判断是否到底
 */
async function getAuthorPoems(author, options = {}) {
  const { page = 1, pageSize = 20 } = options;
  const d = await request('/search', { data: { q: author, type: 'author', page, pageSize } });
  const poems = (Array.isArray(d.poems) ? d.poems : [])
    .map(normalizePoem)
    .filter(Boolean);
  return { poems, query: d.query || author, page, pageSize, hasMore: poems.length >= pageSize };
}

// ─── 接口：统计 ──────────────────────────────────────────────

/** GET /stats/reading 阅读统计（实测当前数据全为 0/空数组，页面需优雅降级） */
async function getReadingStats() {
  const d = await request('/stats/reading');
  return {
    totalReads: d.totalReads || 0,
    totalPoems: d.totalPoems || 0,
    topPoems: Array.isArray(d.topPoems) ? d.topPoems : [],
    topAuthors: Array.isArray(d.topAuthors) ? d.topAuthors : [],
    readsByDay: Array.isArray(d.readsByDay) ? d.readsByDay : []
  };
}

// ─── 内置兜底数据（请求失败时使用，保证页面可展示）─────────────

const FALLBACK_QUOTE = {
  content: '海上生明月，天涯共此时。',
  author: '张九龄',
  source: '望月怀远',
  date: ''
};

const FALLBACK_SOLAR = {
  termName: '处暑',
  termDescription: '暑气渐消，秋意初生，五谷丰登时节。',
  poem: {
    id: 'fallback-qiu',
    title: '山居秋暝',
    content: '空山新雨后，天气晚来秋。\n明月松间照，清泉石上流。\n竹喧归浣女，莲动下渔舟。\n随意春芳歇，王孙自可留。',
    author: '王维',
    dynasty: '唐',
    type: '五言律诗',
    preview: '空山新雨后，天气晚来秋'
  },
  reason: '时值处暑，为你精选一首秋日山水诗'
};

const FALLBACK_DYNASTIES = [
  { id: 1, name: '唐', poemCount: 337874, authorCount: 11843, countText: '33.8万' },
  { id: 2, name: '宋', poemCount: 20600, authorCount: 1100, countText: '2.1万' },
  { id: 3, name: '元', poemCount: 3800, authorCount: 210, countText: '3800' },
  { id: 4, name: '明', poemCount: 3500, authorCount: 190, countText: '3500' },
  { id: 5, name: '清', poemCount: 4400, authorCount: 230, countText: '4400' },
  { id: 6, name: '先秦', poemCount: 1800, authorCount: 90, countText: '1800' },
  { id: 7, name: '魏晋', poemCount: 2800, authorCount: 140, countText: '2800' },
  { id: 8, name: '五代', poemCount: 500, authorCount: 40, countText: '500' }
];

const FALLBACK_TYPES = [
  { id: 1, name: '五言绝句', poemCount: 12800, countText: '1.3万' },
  { id: 2, name: '七言绝句', poemCount: 24600, countText: '2.5万' },
  { id: 3, name: '五言律诗', poemCount: 8800, countText: '8800' },
  { id: 4, name: '七言律诗', poemCount: 13500, countText: '1.4万' },
  { id: 5, name: '宋词', poemCount: 21000, countText: '2.1万' },
  { id: 6, name: '元曲', poemCount: 3600, countText: '3600' },
  { id: 7, name: '乐府诗', poemCount: 2400, countText: '2400' },
  { id: 8, name: '诗经', poemCount: 305, countText: '305' },
  { id: 9, name: '楚辞', poemCount: 370, countText: '370' },
  { id: 10, name: '四书五经', poemCount: 560, countText: '560' }
];

const FALLBACK_POEMS = [
  { id: 1, title: '静夜思', author: '李白', dynasty: '唐', type: '五言绝句', content: '床前明月光，疑是地上霜。\n举头望明月，低头思故乡。', preview: '床前明月光，疑是地上霜' },
  { id: 2, title: '登鹳雀楼', author: '王之涣', dynasty: '唐', type: '五言绝句', content: '白日依山尽，黄河入海流。\n欲穷千里目，更上一层楼。', preview: '白日依山尽，黄河入海流' },
  { id: 3, title: '春晓', author: '孟浩然', dynasty: '唐', type: '五言绝句', content: '春眠不觉晓，处处闻啼鸟。\n夜来风雨声，花落知多少。', preview: '春眠不觉晓，处处闻啼鸟' },
  { id: 4, title: '望岳', author: '杜甫', dynasty: '唐', type: '五言律诗', content: '岱宗夫如何？齐鲁青未了。\n造化钟神秀，阴阳割昏晓。\n荡胸生曾云，决眦入归鸟。\n会当凌绝顶，一览众山小。', preview: '会当凌绝顶，一览众山小' },
  { id: 5, title: '出塞', author: '王昌龄', dynasty: '唐', type: '七言绝句', content: '秦时明月汉时关，万里长征人未还。\n但使龙城飞将在，不教胡马度阴山。', preview: '秦时明月汉时关，万里长征人未还' },
  { id: 6, title: '水调歌头·明月几时有', author: '苏轼', dynasty: '宋', type: '宋词', content: '明月几时有？把酒问青天。\n不知天上宫阙，今夕是何年。\n我欲乘风归去，又恐琼楼玉宇，高处不胜寒。\n起舞弄清影，何似在人间。\n转朱阁，低绮户，照无眠。\n不应有恨，何事长向别时圆？\n人有悲欢离合，月有阴晴圆缺，此事古难全。\n但愿人长久，千里共婵娟。', preview: '明月几时有，把酒问青天' },
  { id: 7, title: '如梦令·常记溪亭日暮', author: '李清照', dynasty: '宋', type: '宋词', content: '常记溪亭日暮，沉醉不知归路。\n兴尽晚回舟，误入藕花深处。\n争渡，争渡，惊起一滩鸥鹭。', preview: '常记溪亭日暮，沉醉不知归路' },
  { id: 8, title: '念奴娇·赤壁怀古', author: '苏轼', dynasty: '宋', type: '宋词', content: '大江东去，浪淘尽，千古风流人物。\n故垒西边，人道是，三国周郎赤壁。\n乱石穿空，惊涛拍岸，卷起千堆雪。\n江山如画，一时多少豪杰。\n遥想公瑾当年，小乔初嫁了，雄姿英发。\n羽扇纶巾，谈笑间，樯橹灰飞烟灭。\n故国神游，多情应笑我，早生华发。\n人生如梦，一尊还酹江月。', preview: '大江东去，浪淘尽，千古风流人物' },
  { id: 9, title: '锦瑟', author: '李商隐', dynasty: '唐', type: '七言律诗', content: '锦瑟无端五十弦，一弦一柱思华年。\n庄生晓梦迷蝴蝶，望帝春心托杜鹃。\n沧海月明珠有泪，蓝田日暖玉生烟。\n此情可待成追忆？只是当时已惘然。', preview: '此情可待成追忆？只是当时已惘然' },
  { id: 10, title: '满江红·怒发冲冠', author: '岳飞', dynasty: '宋', type: '宋词', content: '怒发冲冠，凭栏处、潇潇雨歇。\n抬望眼，仰天长啸，壮怀激烈。\n三十功名尘与土，八千里路云和月。\n莫等闲、白了少年头，空悲切。\n靖康耻，犹未雪。臣子恨，何时灭。\n驾长车，踏破贺兰山缺。\n壮志饥餐胡虏肉，笑谈渴饮匈奴血。\n待从头、收拾旧山河，朝天阙。', preview: '怒发冲冠，凭栏处、潇潇雨歇' }
];

const FALLBACK_AUTHORS = [
  { id: 'li-bai', name: '李白', dynasty: '唐', description: '字太白，号青莲居士，唐代伟大的浪漫主义诗人，被誉为"诗仙"。', poemCount: 1010, countText: '1010', char: '李' },
  { id: 'du-fu', name: '杜甫', dynasty: '唐', description: '字子美，自号少陵野老，唐代伟大的现实主义诗人，被誉为"诗圣"。', poemCount: 1458, countText: '1458', char: '杜' },
  { id: 'su-shi', name: '苏轼', dynasty: '宋', description: '字子瞻，号东坡居士，北宋文学家、书画家，"唐宋八大家"之一。', poemCount: 3459, countText: '3459', char: '苏' },
  { id: 'xin-qi-ji', name: '辛弃疾', dynasty: '宋', description: '字幼安，号稼轩，南宋豪放派词人，与苏轼并称"苏辛"。', poemCount: 629, countText: '629', char: '辛' },
  { id: 'li-qing-zhao', name: '李清照', dynasty: '宋', description: '号易安居士，宋代女词人，婉约词派代表，有"千古第一才女"之称。', poemCount: 88, countText: '88', char: '李' },
  { id: 'wang-wei', name: '王维', dynasty: '唐', description: '字摩诘，号摩诘居士，唐代诗人、画家，诗中有画，画中有诗。', poemCount: 400, countText: '400', char: '王' },
  { id: 'bai-ju-yi', name: '白居易', dynasty: '唐', description: '字乐天，号香山居士，唐代现实主义诗人，"新乐府运动"倡导者。', poemCount: 2741, countText: '2741', char: '白' },
  { id: 'li-shang-yin', name: '李商隐', dynasty: '唐', description: '字义山，号玉溪生，晚唐著名诗人，与杜牧合称"小李杜"。', poemCount: 597, countText: '597', char: '李' }
];

// ─── 导出 ────────────────────────────────────────────────────

module.exports = {
  BASE_URL,
  PoetryError,
  fmtCount,
  // 接口
  getQuote,
  getSolarTerm,
  getRecommend,
  getCategories,
  getHome,
  getPoems,
  getRandomPoem,
  getPoemDetail,
  getAuthors,
  getAuthorDetail,
  getSearch,
  getAuthorPoems,
  getReadingStats,
  // 兜底数据
  FALLBACK_QUOTE,
  FALLBACK_SOLAR,
  FALLBACK_DYNASTIES,
  FALLBACK_TYPES,
  FALLBACK_POEMS,
  FALLBACK_AUTHORS
};
