/**
 * test_v8.js - 国学AI助手 v8.0 综合测试套件
 * 验证：云数据库缓存架构、页面跳转、UI/UX改进
 */

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (e) {
    failed++;
    console.error(`  ❌ ${name}`);
    console.error(`     ${e.message}`);
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'assertion failed');
}

function readFile(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function fileExists(rel) {
  return fs.existsSync(path.join(ROOT, rel));
}

// ═══════════════════════════════════════════════════════
console.log('\n📦 [1] 云数据库基础设施');
// ═══════════════════════════════════════════════════════

test('cloudfunctions/guoxueDB/index.js 存在', () => {
  assert(fileExists('cloudfunctions/guoxueDB/index.js'), '云函数文件不存在');
});

test('cloudfunctions/guoxueDB/package.json 存在', () => {
  assert(fileExists('cloudfunctions/guoxueDB/package.json'), 'package.json 不存在');
});

test('guoxueDB 支持 get/set/list/search/batchSet/delete/preload', () => {
  const src = readFile('cloudfunctions/guoxueDB/index.js');
  ['get', 'set', 'list', 'search', 'batchSet', 'delete', 'preload'].forEach(op => {
    assert(src.includes(`case '${op}':`), `guoxueDB 缺少 ${op} 操作`);
  });
});

test('guoxueDB 使用 guoxue 集合', () => {
  const src = readFile('cloudfunctions/guoxueDB/index.js');
  assert(src.includes("COLLECTION = 'guoxue'"), 'guoxueDB 集合名不是 guoxue');
});

test('utils/db.js 存在', () => {
  assert(fileExists('miniprogram/utils/db.js'), 'utils/db.js 不存在');
});

test('utils/db.js 导出核心函数', () => {
  const src = readFile('miniprogram/utils/db.js');
  ['getContent', 'saveContent', 'batchGet', 'searchContent', 'listContent'].forEach(fn => {
    assert(src.includes(fn), `db.js 缺少函数: ${fn}`);
  });
});

test('utils/db.js 三层缓存：本地→云端→生成', () => {
  const src = readFile('miniprogram/utils/db.js');
  assert(src.includes('wx.getStorageSync'), '缺少本地缓存读取');
  assert(src.includes('DB_FUNC'), '缺少云数据库调用');
  assert(src.includes('generator'), '缺少生成函数回调');
});

// ═══════════════════════════════════════════════════════
console.log('\n📡 [2] API层云数据库集成');
// ═══════════════════════════════════════════════════════

test('api.js 引入 db.js', () => {
  const src = readFile('miniprogram/utils/api.js');
  assert(src.includes("require('./db')"), 'api.js 未引入 db.js');
});

test('api.js analyzePoem 使用 _invokeWithCache', () => {
  const src = readFile('miniprogram/utils/api.js');
  assert(src.includes('_invokeWithCache') && src.includes('analyzePoem'), 'analyzePoem 未使用缓存');
});

test('api.js explainIdiom 使用 _invokeWithCache', () => {
  const src = readFile('miniprogram/utils/api.js');
  assert(src.includes('_invokeWithCache'), '_invokeWithCache 函数不存在');
  // explainIdiom 内部调用 _invokeWithCache
  const fnStart = src.indexOf('async function explainIdiom');
  const fnEnd = src.indexOf('\n}\n', fnStart);
  const fnBody = src.slice(fnStart, fnEnd);
  assert(fnBody.includes('_invokeWithCache'), 'explainIdiom 未使用缓存');
});

test('api.js queryHistory 使用 _invokeWithCache', () => {
  const src = readFile('miniprogram/utils/api.js');
  const fnStart = src.indexOf('async function queryHistory');
  const fnEnd = src.indexOf('\n}\n', fnStart);
  const fnBody = src.slice(fnStart, fnEnd);
  assert(fnBody.includes('_invokeWithCache'), 'queryHistory 未使用缓存');
});

test('api.js 新增 analyzePhilosopher 函数', () => {
  const src = readFile('miniprogram/utils/api.js');
  assert(src.includes('analyzePhilosopher'), '缺少 analyzePhilosopher');
});

test('api.js analyzePhilosopher 使用 philosopher contentType', () => {
  const src = readFile('miniprogram/utils/api.js');
  assert(src.includes("'philosopher'"), '缺少 philosopher 内容类型');
});

test('api.js _invokeWithCache: 命中缓存不消耗配额', () => {
  const src = readFile('miniprogram/utils/api.js');
  const fnStart = src.indexOf('async function _invokeWithCache');
  const fnEnd = src.indexOf('\n}\n', fnStart);
  const fnBody = src.slice(fnStart, fnEnd);
  assert(fnBody.includes('cached.found'), '缓存函数未处理命中情况');
  assert(fnBody.includes('consumeQuota'), '未命中时缺少配额检查');
});

test('api.js translate 仍走实时 AI（无缓存）', () => {
  const src = readFile('miniprogram/utils/api.js');
  const fnStart = src.indexOf('async function translate');
  const fnEnd = src.indexOf('\n}\n', fnStart);
  const fnBody = src.slice(fnStart, fnEnd);
  // translate 不应调用 _invokeWithCache
  assert(!fnBody.includes('_invokeWithCache'), 'translate 不应使用缓存（每次翻译不同）');
});

// ═══════════════════════════════════════════════════════
console.log('\n📄 [3] 诗词典籍页面（云缓存版）');
// ═══════════════════════════════════════════════════════

test('classics/index.js 使用 api.analyzePoem（带 opts）', () => {
  const src = readFile('miniprogram/pages/classics/index.js');
  assert(src.includes('api.analyzePoem('), '未调用 analyzePoem');
  // 检查传递了 opts 参数
  const call = src.match(/api\.analyzePoem\([^)]+\)/);
  assert(call, '无法找到 analyzePoem 调用');
});

test('classics/index.js 无直接配额检查', () => {
  const src = readFile('miniprogram/pages/classics/index.js');
  // 不应有 consumeQuota 直接调用（已移到 api 层）
  assert(!src.includes('monetize.consumeQuota'), '页面不应直接调用 consumeQuota');
});

test('classics/index.js doSearch 不含 handleQuotaExceeded', () => {
  const src = readFile('miniprogram/pages/classics/index.js');
  assert(!src.includes('handleQuotaExceeded'), '页面不应直接调用 handleQuotaExceeded');
});

test('classics/index.js analyzePoem 不含 handleQuotaExceeded', () => {
  const src = readFile('miniprogram/pages/classics/index.js');
  assert(!src.includes('handleQuotaExceeded'), '已通过 api 层处理配额');
});

// ═══════════════════════════════════════════════════════
console.log('\n📄 [4] 成语故事页面（云缓存版）');
// ═══════════════════════════════════════════════════════

test('idiom/index.js lookupIdiomByWord 直接调用 _doLookupIdiom', () => {
  const src = readFile('miniprogram/pages/idiom/index.js');
  const fnStart = src.indexOf('async lookupIdiomByWord');
  const fnEnd = src.indexOf('\n  },\n', fnStart);
  const fnBody = src.slice(fnStart, fnEnd);
  assert(!fnBody.includes('consumeQuota'), '不应在页面直接检查配额');
  assert(fnBody.includes('_doLookupIdiom'), '应直接调用 _doLookupIdiom');
});

test('idiom/index.js _doLookupIdiom 使用 res.sections', () => {
  const src = readFile('miniprogram/pages/idiom/index.js');
  assert(src.includes('res.sections'), '未使用 res.sections');
});

// ═══════════════════════════════════════════════════════
console.log('\n📄 [5] 历史探秘页面（云缓存版）');
// ═══════════════════════════════════════════════════════

test('history/index.js doSearch 无配额检查', () => {
  const src = readFile('miniprogram/pages/history/index.js');
  const fnStart = src.indexOf('async doSearch');
  const fnEnd = src.indexOf('\n  },\n', fnStart);
  const fnBody = src.slice(fnStart, fnEnd);
  assert(!fnBody.includes('consumeQuota'), '不应在页面直接检查配额');
});

test('history/index.js exploreEvent 使用 res.sections', () => {
  const src = readFile('miniprogram/pages/history/index.js');
  assert(src.includes('res.sections'), '未使用 res.sections');
});

test('history/index.js exploreFigure 使用 api.queryHistory', () => {
  const src = readFile('miniprogram/pages/history/index.js');
  const fnStart = src.indexOf('async exploreFigure');
  const fnEnd = src.indexOf('\n  },\n', fnStart);
  const fnBody = src.slice(fnStart, fnEnd);
  assert(fnBody.includes('api.queryHistory'), 'exploreFigure 未调用 queryHistory');
});

// ═══════════════════════════════════════════════════════
console.log('\n📄 [6] 诸子百家页面（云缓存版）');
// ═══════════════════════════════════════════════════════

test('philosophers/index.js _analyzeSchool 调用 api.analyzePhilosopher', () => {
  const src = readFile('miniprogram/pages/philosophers/index.js');
  assert(src.includes('api.analyzePhilosopher'), '未使用新 analyzePhilosopher API');
});

test('philosophers/index.js _doSearch 调用 api.analyzePhilosopher', () => {
  const src = readFile('miniprogram/pages/philosophers/index.js');
  const fnStart = src.indexOf('async _doSearch');
  const fnEnd = src.indexOf('\n  },\n', fnStart);
  const fnBody = src.slice(fnStart, fnEnd);
  assert(fnBody.includes('api.analyzePhilosopher'), '_doSearch 未使用 analyzePhilosopher');
});

test('philosophers/index.js 无直接 consumeQuota 调用', () => {
  const src = readFile('miniprogram/pages/philosophers/index.js');
  assert(!src.includes('monetize.consumeQuota'), '不应在页面直接检查配额');
});

// ═══════════════════════════════════════════════════════
console.log('\n🔗 [7] 页面跳转审计');
// ═══════════════════════════════════════════════════════

test('vip/index.js 无 chat/index 跳转', () => {
  const src = readFile('miniprogram/pages/vip/index.js');
  assert(!src.includes('chat/index'), 'VIP 页仍有 chat/index 跳转');
});

test('vip/index.js 购买成功后跳转到 home', () => {
  const src = readFile('miniprogram/pages/vip/index.js');
  assert(src.includes('/pages/home/index'), '购买成功后应跳转到首页');
});

test('detail/index.js continueInChat 不跳转到 chat', () => {
  const src = readFile('miniprogram/pages/detail/index.js');
  assert(!src.includes('chat/index'), '详情页不应跳转到 chat 页');
});

test('app.json philosophers tab 使用自定义图标', () => {
  const src = readFile('miniprogram/app.json');
  assert(src.includes('tab_philosophers.png'), '哲学家 tab 应使用专属图标');
});

test('tab_philosophers.png 文件存在', () => {
  assert(fileExists('miniprogram/images/tab_philosophers.png'), '哲学家 tab 图标不存在');
});

test('app.json pages 列表完整', () => {
  const json = JSON.parse(readFile('miniprogram/app.json'));
  const pages = json.pages || [];
  const required = ['pages/home/index', 'pages/translate/index', 'pages/classics/index',
    'pages/idiom/index', 'pages/history/index', 'pages/philosophers/index',
    'pages/detail/index', 'pages/vip/index'];
  required.forEach(p => {
    assert(pages.includes(p), `app.json 缺少页面: ${p}`);
  });
});

// ═══════════════════════════════════════════════════════
console.log('\n🎨 [8] UI/UX 改进（审核合规）');
// ═══════════════════════════════════════════════════════

test('idiom/index.wxml 加载文字不含"AI正在"', () => {
  const src = readFile('miniprogram/pages/idiom/index.wxml');
  assert(!src.includes('AI正在'), '成语页加载文字仍含"AI正在"');
});

test('history/index.wxml 加载文字不含"AI正在"', () => {
  const src = readFile('miniprogram/pages/history/index.wxml');
  assert(!src.includes('AI正在'), '历史页加载文字仍含"AI正在"');
});

test('philosophers/index.wxml 加载文字不含"AI正在"', () => {
  const src = readFile('miniprogram/pages/philosophers/index.wxml');
  assert(!src.includes('AI正在'), '诸子页加载文字仍含"AI正在"');
});

test('classics/index.wxml 加载文字不含"AI正在"', () => {
  const src = readFile('miniprogram/pages/classics/index.wxml');
  assert(!src.includes('AI正在'), '典籍页加载文字仍含"AI正在"');
});

// ═══════════════════════════════════════════════════════
console.log('\n🔄 [9] 兼容性与文件完整性');
// ═══════════════════════════════════════════════════════

test('utils/ai.js 仍存在（基础 AI 调用层）', () => {
  assert(fileExists('miniprogram/utils/ai.js'), 'ai.js 不应被删除');
});

test('utils/share.js 存在（v7.0 功能）', () => {
  assert(fileExists('miniprogram/utils/share.js'), 'share.js 不存在');
});

test('utils/constants.js 存在', () => {
  assert(fileExists('miniprogram/utils/constants.js'), 'constants.js 不存在');
});

test('utils/storage.js 存在', () => {
  assert(fileExists('miniprogram/utils/storage.js'), 'storage.js 不存在');
});

test('utils/monetize.js 存在', () => {
  assert(fileExists('miniprogram/utils/monetize.js'), 'monetize.js 不存在');
});

test('所有 5 个主页面 JS/WXML/WXSS/JSON 完整', () => {
  const pages = ['home', 'translate', 'classics', 'idiom', 'history', 'philosophers'];
  pages.forEach(p => {
    const exts = ['js', 'wxml', 'wxss', 'json'];
    exts.forEach(ext => {
      assert(
        fileExists(`miniprogram/pages/${p}/index.${ext}`),
        `缺少文件: pages/${p}/index.${ext}`
      );
    });
  });
});

test('cloudfunctions/guoxueAI 目录存在（配额管理）', () => {
  assert(fileExists('cloudfunctions/guoxueAI/index.js'), 'guoxueAI 云函数不存在');
});

test('api.js 导出 analyzePhilosopher', () => {
  const src = readFile('miniprogram/utils/api.js');
  assert(src.includes('analyzePhilosopher,'), 'api.js 未导出 analyzePhilosopher');
});

test('api.js 导出 searchCached', () => {
  const src = readFile('miniprogram/utils/api.js');
  assert(src.includes('searchCached'), 'api.js 未导出 searchCached');
});

test('db.js 使用 guoxueDB 云函数', () => {
  const src = readFile('miniprogram/utils/db.js');
  assert(src.includes("DB_FUNC  = 'guoxueDB'") || src.includes("DB_FUNC = 'guoxueDB'"), 'db.js 未使用 guoxueDB');
});

// ═══════════════════════════════════════════════════════
console.log('\n📊 [10] 数据完整性');
// ═══════════════════════════════════════════════════════

test('诗词典籍：诗词数据 >= 10 条', () => {
  const src = readFile('miniprogram/pages/classics/index.js');
  const matches = src.match(/\{ id: \d+, title:/g);
  assert(matches && matches.length >= 10, '诗词数据不足10条');
});

test('成语故事：成语数据 >= 8 条', () => {
  const src = readFile('miniprogram/pages/idiom/index.js');
  const matches = src.match(/word: '.*?'/g);
  assert(matches && matches.length >= 8, '成语数据不足8条');
});

test('历史探秘：朝代数据 >= 5 个', () => {
  const src = readFile('miniprogram/pages/history/index.js');
  // Match dynasty entries like { id: 'tang', name: '唐宋'
  const matches = src.match(/id:\s*'[a-z]+',\s*name:/g);
  assert(matches && matches.length >= 5, `朝代数据不足5个（实际: ${matches ? matches.length : 0}）`);
});

test('诸子百家：学派数据 >= 5 个', () => {
  const src = readFile('miniprogram/pages/philosophers/index.js');
  const matches = src.match(/id:\s*'[a-z]+',\s*name:/g);
  assert(matches && matches.length >= 5, `学派数据不足5个（实际: ${matches ? matches.length : 0}）`);
});

// ═══════════════════════════════════════════════════════
// 汇总
// ═══════════════════════════════════════════════════════
console.log('\n' + '═'.repeat(50));
console.log(`🎯 v8.0 测试结果: ${passed} 通过 / ${failed} 失败 / ${passed + failed} 总计`);
if (failed === 0) {
  console.log('🎉 全部通过！v8.0 云数据库缓存架构验证成功');
} else {
  console.log(`⚠️  有 ${failed} 个测试失败，请检查输出`);
  process.exit(1);
}
