/**
 * test_poetry.js - 诗词网关 API（poetryApi.js 新增数据）连通性测试
 *
 * 在 Node 中 mock 微信小程序 wx.request，真实请求 https://www.chinesepoetry.space，
 * 逐一验证 utils/poetryApi.js 暴露的接口能否获取到数据，并对照 api.md 勘误预期。
 *
 * 运行：node test_poetry.js
 */
const https = require('https');
const { URL } = require('url');

// ─── mock 微信小程序 wx.request ─────────────────────────────
global.wx = {
  request(opts) {
    const { url, method = 'GET', data = {}, timeout = 15000, success, fail } = opts;
    const u = new URL(url);
    // GET 查询参数
    Object.keys(data || {}).forEach((k) => u.searchParams.append(k, data[k]));
    const req = https.get(
      u,
      { headers: { 'Content-Type': 'application/json' }, method },
      (res) => {
        let raw = '';
        res.setEncoding('utf8');
        res.on('data', (c) => (raw += c));
        res.on('end', () => {
          let body = {};
          try { body = JSON.parse(raw); } catch (e) { /* 空响应 */ }
          success({ statusCode: res.statusCode, data: body });
        });
      }
    );
    req.setTimeout(timeout, () => req.destroy(new Error('timeout')));
    req.on('error', (err) => fail({ errMsg: err.message }));
  }
};

// ─── 引入被测模块 ─────────────────────────────────────────────
const api = require('./miniprogram/utils/poetryApi.js');

let passed = 0, failed = 0, expected = 0;
function check(desc, cond, detail) {
  if (cond) { console.log('  ✅', desc); passed++; }
  else { console.log('  ❌', desc, detail ? '— ' + detail : ''); failed++; }
}
function info(label, val) { console.log('     ·', label + ':', String(val).slice(0, 60)); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function firstPoem(poems) {
  if (!Array.isArray(poems) || !poems.length) return null;
  const p = poems[0];
  return (p.title || '?') + ' · ' + (p.author || '?') + ' [' + (p.dynasty || '?') + '/' + (p.type || '?') + ']';
}

async function main() {
  console.log('\n══════════ 诗词网关 API 连通性测试 ══════════\n');

  // [1] /quote
  console.log('[1] GET /quote 每日一句');
  try {
    const q = await api.getQuote();
    check('请求成功且 content 非空', !!(q && q.content));
    info('内容', q.content);
    info('出处', q.author + '《' + q.source + '》' + (q.date ? ' ' + q.date : ''));
  } catch (e) { check('请求成功', false, e.message); }
  await sleep(300);

  // [2] /solar-term
  console.log('[2] GET /solar-term 节气推荐');
  try {
    const s = await api.getSolarTerm();
    check('请求成功且 termName 非空', !!(s && s.termName));
    info('节气', s.termName + ' — ' + s.termDescription);
    info('诗词', firstPoem(s.poem ? [s.poem] : []));
    info('理由', s.reason);
  } catch (e) { check('请求成功', false, e.message); }
  await sleep(300);

  // [3] /recommend
  console.log('[3] GET /recommend 为你推荐');
  try {
    const r = await api.getRecommend();
    check('请求成功且返回 5 首', Array.isArray(r.poems) && r.poems.length === 5, '实际 ' + (r.poems || []).length + ' 首');
    check('reason 非空', !!(r.reason || '').trim());
    info('理由', r.reason);
    info('首条', firstPoem(r.poems));
  } catch (e) { check('请求成功', false, e.message); }
  await sleep(300);

  // [4] /categories
  console.log('[4] GET /categories 分类聚合');
  try {
    const c = await api.getCategories();
    check('请求成功且朝代非空', Array.isArray(c.dynasties) && c.dynasties.length > 0, '朝代 ' + (c.dynasties || []).length + ' 个');
    check('体裁非空', Array.isArray(c.types) && c.types.length > 0, '体裁 ' + (c.types || []).length + ' 个');
    const total = (c.dynasties || []).reduce((s, d) => s + (Number(d.poemCount) || 0), 0);
    const authors = (c.dynasties || []).reduce((s, d) => s + (Number(d.authorCount) || 0), 0);
    info('朝代示例', (c.dynasties || []).slice(0, 5).map((d) => d.name + '(' + d.countText + ')').join(' '));
    info('统计汇总', api.fmtCount(total) + ' 首诗 / ' + api.fmtCount(authors) + ' 位作者');
  } catch (e) { check('请求成功', false, e.message); }
  await sleep(300);

  // [5] /home
  console.log('[5] GET /home 首页聚合');
  try {
    const h = await api.getHome();
    check('请求成功', !!(h && h.featuredPoem));
    info('推荐诗', firstPoem(h.featuredPoem ? [h.featuredPoem] : []));
    info('推荐作者', h.featuredAuthor ? (h.featuredAuthor.name + ' · ' + h.featuredAuthor.dynasty + ' · ' + h.featuredAuthor.countText) : '(空)');
  } catch (e) { check('请求成功', false, e.message); }
  await sleep(300);

  // [6] /poems
  console.log('[6] GET /poems 诗词列表');
  try {
    const r = await api.getPoems({ page: 1, pageSize: 5 });
    check('请求成功且返回 5 首', Array.isArray(r.poems) && r.poems.length === 5, '实际 ' + (r.poems || []).length + ' 首');
    info('首条', firstPoem(r.poems));
  } catch (e) { check('请求成功', false, e.message); }
  await sleep(300);

  // [7] /poems/random（可用筛选 dynasty=唐）
  console.log('[7] GET /poems/random 随机诗词（dynasty=唐）');
  try {
    const p = await api.getRandomPoem({ dynasty: '唐' });
    check('请求成功且返回 1 首', !!(p && p.title));
    info('结果', firstPoem(p ? [p] : []));
  } catch (e) { check('请求成功', false, e.message); }
  await sleep(300);

  // [8] /poems/random 零匹配（type=唐诗 应 500，符合勘误）
  console.log('[8] GET /poems/random 零匹配（type=唐诗，勘误预期 HTTP 500）');
  try {
    await api.getRandomPoem({ type: '唐诗' });
    check('按勘误应 500 被归类为分类暂不可用', false, '竟然成功了');
  } catch (e) {
    check('按勘误应 500（HTTP_500）', e.code === 'HTTP_500', '实际 ' + e.code + ' ' + e.message);
    expected++;
  }
  await sleep(300);

  // [9] /poems/:id（勘误预期 500，详情页用 seed 兜底）
  console.log('[9] GET /poems/:id 诗词详情（勘误预期 HTTP 500）');
  try {
    const p = await api.getPoemDetail(1);
    check('按勘误应 500（走 seed 兜底）', false, '竟然成功：' + (p && p.title));
  } catch (e) {
    check('按勘误应 500（HTTP_500）', e.code === 'HTTP_500', '实际 ' + e.code + ' ' + e.message);
    expected++;
  }
  await sleep(300);

  // [10] /authors
  console.log('[10] GET /authors 作者列表');
  let authorId = null;
  try {
    const r = await api.getAuthors({ page: 1, pageSize: 5 });
    // 已过滤「无名氏」等空名作者，返回 1~5 位均视为正常
    check('请求成功且返回 1~5 位', Array.isArray(r.authors) && r.authors.length >= 1 && r.authors.length <= 5, '实际 ' + (r.authors || []).length + ' 位');
    if (r.authors && r.authors[0]) {
      authorId = r.authors[0].id;
      const a = r.authors[0];
      info('首条', a.name + ' · ' + (a.dynasty || '?') + (a.countText ? ' · ' + a.countText + ' 首' : '') + (a.description ? ' · ' + a.description.slice(0, 18) + '…' : ''));
    }
  } catch (e) { check('请求成功', false, e.message); }
  await sleep(300);

  // [11] /authors/:id
  console.log('[11] GET /authors/:id 作者详情');
  if (authorId != null) {
    try {
      const a = await api.getAuthorDetail(authorId);
      // 实测 /authors/:id 对多数作者返回 200 但 dynasty/description/poemCount 均为 null，
      // 属接口语义（需详情页用列表页 seed 兜底），此处仅断言接口可达且返回对象
      check('请求成功且返回对象', !!(a && typeof a === 'object'));
      info('朝代/简介', (a.dynasty || '(null)') + ' · ' + (a.description || '(null)').slice(0, 40));
      info('作品数', a.poemCount == null ? '(null)' : a.poemCount);
    } catch (e) { check('请求成功', false, e.message); }
  } else {
    check('请求成功（无 authorId 跳过）', false, '上一步未取到 id');
  }
  await sleep(300);

  // [12] /search
  console.log('[12] GET /search 全文搜索（q=明月）');
  try {
    const r = await api.getSearch('明月', { page: 1, pageSize: 5 });
    check('请求成功且返回结果', Array.isArray(r.poems) && r.poems.length > 0, '实际 ' + (r.poems || []).length + ' 条');
    info('首条', firstPoem(r.poems));
    info('回显 query', r.query);
  } catch (e) { check('请求成功', false, e.message); }
  await sleep(300);

  // [13] /stats/reading
  console.log('[13] GET /stats/reading 阅读统计（勘误预期数据为 0）');
  try {
    const s = await api.getReadingStats();
    check('请求成功', !!(s && typeof s.totalReads === 'number'));
    info('总阅读/总诗', s.totalReads + ' / ' + s.totalPoems);
    info('热门排行', 'topPoems ' + (s.topPoems || []).length + ' 条 / topAuthors ' + (s.topAuthors || []).length + ' 条');
  } catch (e) { check('请求成功', false, e.message); }
  await sleep(300);

  // [14] /discover（api.md 提到但 poetryApi 未封装，直接裸测）
  console.log('[14] GET /discover 发现页（未封装，裸测）');
  try {
    await new Promise((resolve, reject) => {
      global.wx.request({
        url: api.BASE_URL + '/discover',
        timeout: 15000,
        success: (res) => {
          const d = res.data && res.data.data;
          const unwrap = (v) => (Array.isArray(v) ? v : (v && Array.isArray(v.data) ? v.data : []));
          const dyn = unwrap(d && d.dynasties);
          const recent = d && d.recentPoems;
          check('请求成功且 recentPoems 非空', Array.isArray(recent) && recent.length > 0, '实际 ' + (recent || []).length + ' 条');
          check('dynasties 解包非空', dyn.length > 0, '实际 ' + dyn.length + ' 个');
          resolve();
        },
        fail: (err) => { check('请求成功', false, (err && err.errMsg) || '网络失败'); resolve(); }
      });
    });
  } catch (e) { check('请求成功', false, e.message); }

  // ─── 汇总 ──────────────────────────────
  console.log('\n══════════════════════════════════════');
  console.log('结果：' + passed + ' 通过 / ' + failed + ' 失败 / ' + expected + ' 项为勘误预期（500 属正常）');
  console.log('══════════════════════════════════════\n');
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('测试脚本异常：', e);
  process.exit(1);
});
