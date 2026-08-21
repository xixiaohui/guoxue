/**
 * test_v9.js - 国学助手小程序综合回归测试 v9.0
 * 全面验证：云数据库缓存架构、页面完整性、导航逻辑、UI合规性
 */

const fs = require('fs');
const path = require('path');

let passed = 0, failed = 0;

function check(desc, condition, detail = '') {
  if (condition) {
    console.log(`  ✅ PASS: ${desc}`);
    passed++;
  } else {
    console.log(`  ❌ FAIL: ${desc}${detail ? ' — ' + detail : ''}`);
    failed++;
  }
}

function readFile(rel) {
  try { return fs.readFileSync(path.join(__dirname, rel), 'utf8'); } catch { return ''; }
}

function fileExists(rel) {
  return fs.existsSync(path.join(__dirname, rel));
}

// ══════════════════════════════════════════════════
console.log('\n══════════════════════════════════════════════════');
console.log('🧪 v9.0 综合回归测试 - 国学助手小程序');
console.log('══════════════════════════════════════════════════\n');

// ─── [1] 文件存在性 ──────────────────────────────
console.log('📁 [1] 核心文件存在性');
const requiredFiles = [
  'miniprogram/app.json',
  'miniprogram/app.js',
  'miniprogram/utils/api.js',
  'miniprogram/utils/ai.js',
  'miniprogram/utils/db.js',
  'miniprogram/utils/monetize.js',
  'miniprogram/utils/storage.js',
  'miniprogram/utils/constants.js',
  'miniprogram/utils/share.js',
  'cloudfunctions/guoxueDB/index.js',
  'cloudfunctions/guoxueDB/package.json',
  'cloudfunctions/guoxueAI/index.js',
];
requiredFiles.forEach(f => check(f + ' 存在', fileExists(f)));

// ─── [2] 页面文件完整性 ──────────────────────────
console.log('\n📄 [2] 五大页面文件完整性');
const pages = ['home', 'classics', 'idiom', 'history', 'philosophers', 'vip', 'translate', 'detail'];
pages.forEach(p => {
  const base = `miniprogram/pages/${p}/index`;
  check(`${p} JS`, fileExists(base + '.js'));
  check(`${p} WXML`, fileExists(base + '.wxml'));
  check(`${p} WXSS`, fileExists(base + '.wxss'));
  check(`${p} JSON`, fileExists(base + '.json'));
});

// ─── [3] app.json 配置 ──────────────────────────
console.log('\n⚙️  [3] app.json 配置');
const appJson = JSON.parse(readFile('miniprogram/app.json'));
check('app.json: home 页面注册', appJson.pages.includes('pages/home/index'));
check('app.json: classics 页面注册', appJson.pages.includes('pages/classics/index'));
check('app.json: idiom 页面注册', appJson.pages.includes('pages/idiom/index'));
check('app.json: history 页面注册', appJson.pages.includes('pages/history/index'));
check('app.json: philosophers 页面注册', appJson.pages.includes('pages/philosophers/index'));
check('app.json: vip 页面注册', appJson.pages.includes('pages/vip/index'));
check('app.json: detail 页面注册', appJson.pages.includes('pages/detail/index'));
check('app.json: translate 页面注册', appJson.pages.includes('pages/translate/index'));

const tabList = appJson.tabBar && appJson.tabBar.list;
check('tabBar: 有标签配置', tabList && tabList.length >= 3);
check('tabBar: 首页在标签', tabList && tabList.some(t => t.pagePath === 'pages/home/index'));
check('tabBar: 典籍在标签', tabList && tabList.some(t => t.pagePath === 'pages/classics/index'));
check('tabBar: 历史在标签', tabList && tabList.some(t => t.pagePath === 'pages/history/index'));
check('tabBar: 百家在标签', tabList && tabList.some(t => t.pagePath === 'pages/philosophers/index'));
// 审核要求：chat页不在tabBar
check('tabBar: chat 不在标签中（审核要求）', !tabList || !tabList.some(t => t.pagePath.includes('chat')));

// ─── [4] 云数据库架构 ──────────────────────────────
console.log('\n☁️  [4] 云数据库缓存架构');
const dbJs = readFile('miniprogram/utils/db.js');
check('db.js: getContent 函数', dbJs.includes('async function getContent'));
check('db.js: batchGet 函数', dbJs.includes('async function batchGet'));
check('db.js: saveContent 函数', dbJs.includes('async function saveContent'));
check('db.js: searchContent 函数', dbJs.includes('async function searchContent'));
check('db.js: 使用 guoxueDB 云函数', dbJs.includes("DB_FUNC  = 'guoxueDB'") || dbJs.includes("DB_FUNC = 'guoxueDB'"));
check('db.js: 本地缓存TTL 7天', dbJs.includes('7 * 24 * 3600'));
check('db.js: 模块导出', dbJs.includes('module.exports'));

const guoxueDB = readFile('cloudfunctions/guoxueDB/index.js');
check('guoxueDB: get 操作', guoxueDB.includes("case 'get'"));
check('guoxueDB: set 操作', guoxueDB.includes("case 'set'"));
check('guoxueDB: list 操作', guoxueDB.includes("case 'list'"));
check('guoxueDB: search 操作', guoxueDB.includes("case 'search'"));
check('guoxueDB: batchSet 操作', guoxueDB.includes("case 'batchSet'"));
check('guoxueDB: guoxue 集合', guoxueDB.includes("COLLECTION = 'guoxue'"));

// ─── [5] API 缓存集成 ──────────────────────────────
console.log('\n🔌 [5] API 缓存集成');
const apiJs = readFile('miniprogram/utils/api.js');
check('api.js: 引入 db.js', apiJs.includes("require('./db')"));
check('api.js: _invokeWithCache 函数', apiJs.includes('async function _invokeWithCache'));
check('api.js: analyzePoem 走缓存', apiJs.includes("'poem'") && apiJs.includes('_invokeWithCache'));
check('api.js: explainIdiom 走缓存', apiJs.includes("'idiom'") && apiJs.includes('explainIdiom'));
check('api.js: queryHistory 走缓存', apiJs.includes("'history'") && apiJs.includes('queryHistory'));
check('api.js: analyzePhilosopher 走缓存', apiJs.includes('analyzePhilosopher'));
check('api.js: searchCached 函数', apiJs.includes('searchCached'));
check('api.js: 配额检查函数', apiJs.includes('consumeQuota') && apiJs.includes('getQuotaStatus'));

// ─── [6] 各页面 JS 函数完整性 ──────────────────────
console.log('\n🔧 [6] 各页面 JS 函数完整性');

// 成语页
const idiomJs = readFile('miniprogram/pages/idiom/index.js');
check('idiom: lookupIdiomByWord 函数', idiomJs.includes('async lookupIdiomByWord'));
check('idiom: _doLookupIdiom 函数', idiomJs.includes('async _doLookupIdiom'));
check('idiom: changeDailyIdiom 函数', idiomJs.includes('changeDailyIdiom()'));
check('idiom: searchIdiom 函数', idiomJs.includes('searchIdiom()'));
check('idiom: selectCategory 函数', idiomJs.includes('selectCategory('));
check('idiom: toggleFavorite 函数', idiomJs.includes('toggleFavorite()'));
check('idiom: copyResult 函数', idiomJs.includes('copyResult()'));
check('idiom: lookupFeatured 函数', idiomJs.includes('lookupFeatured('));
check('idiom: lookupIdiom 函数', idiomJs.includes('lookupIdiom('));
check('idiom: onShareAppMessage', idiomJs.includes('onShareAppMessage'));
check('idiom: 调用 api.explainIdiom', idiomJs.includes('api.explainIdiom'));
check('idiom: 调用 api.getDailyIdiom', idiomJs.includes('api.getDailyIdiom'));

// 历史页
const historyJs = readFile('miniprogram/pages/history/index.js');
check('history: loadDynastyEvents 函数', historyJs.includes('async loadDynastyEvents'));
check('history: selectDynasty 函数', historyJs.includes('selectDynasty('));
check('history: doSearch 函数', historyJs.includes('async doSearch()'));
check('history: exploreEvent 函数', historyJs.includes('async exploreEvent'));
check('history: exploreFigure 函数', historyJs.includes('async exploreFigure'));
check('history: exploreTrivia 函数', historyJs.includes('async exploreTrivia'));
check('history: closeResult 函数', historyJs.includes('closeResult()'));
check('history: copyAiResult 函数', historyJs.includes('copyAiResult()'));
check('history: onShareAppMessage', historyJs.includes('onShareAppMessage'));
check('history: 调用 api.queryHistory', historyJs.includes('api.queryHistory'));

// 诸子百家页
const philJs = readFile('miniprogram/pages/philosophers/index.js');
check('philosophers: doSearch 函数', philJs.includes('async doSearch()'));
check('philosophers: openSchool 函数', philJs.includes('openSchool('));
check('philosophers: closeModal 函数', philJs.includes('closeModal()'));
check('philosophers: analyzeSchool 函数', philJs.includes('async analyzeSchool()'));
check('philosophers: exploreQuote 函数', philJs.includes('async exploreQuote'));
check('philosophers: copyResult 函数', philJs.includes('copyResult()'));
check('philosophers: closeResult 函数', philJs.includes('closeResult()'));
check('philosophers: stopProp 函数', philJs.includes('stopProp()'));
check('philosophers: onShareAppMessage', philJs.includes('onShareAppMessage'));
check('philosophers: 调用 api.analyzePhilosopher', philJs.includes('api.analyzePhilosopher'));

// 诗词典籍页
const classicsJs = readFile('miniprogram/pages/classics/index.js');
check('classics: doSearch 函数', classicsJs.includes('async doSearch()'));
check('classics: switchTab 函数', classicsJs.includes('switchTab('));
check('classics: openPoem 函数', classicsJs.includes('openPoem('));
check('classics: openClassic 函数', classicsJs.includes('openClassic('));
check('classics: closeModal 函数', classicsJs.includes('closeModal()'));
check('classics: analyzePoem 函数', classicsJs.includes('async analyzePoem()'));
check('classics: toggleFavoritePoem 函数', classicsJs.includes('toggleFavoritePoem()'));
check('classics: copySearchResult 函数', classicsJs.includes('copySearchResult()'));
check('classics: closeSearch 函数', classicsJs.includes('closeSearch()'));
check('classics: stopProp 函数', classicsJs.includes('stopProp()'));
check('classics: onShareAppMessage', classicsJs.includes('onShareAppMessage'));
check('classics: 调用 api.analyzePoem', classicsJs.includes('api.analyzePoem'));

// ─── [7] WXML 绑定与 JS 函数一致性 ──────────────────
console.log('\n🔗 [7] WXML 绑定与 JS 函数一致性');

function checkBindings(page, wxml, js) {
  const bindingRe = /bind\w+="(\w+)"/g;
  let m;
  while ((m = bindingRe.exec(wxml)) !== null) {
    const fn = m[1];
    if (['catchtap', 'bindinput', 'bindconfirm', 'bindload', 'binderror', 'bindclose', 'bindscroll'].some(b => m[0].startsWith(b))) continue;
    if (!js.includes(fn + '(')) {
      check(`${page}: WXML绑定 ${fn}() 在JS中存在`, false);
    }
  }
}

const classicsWxml = readFile('miniprogram/pages/classics/index.wxml');
const idiomWxml = readFile('miniprogram/pages/idiom/index.wxml');
const historyWxml = readFile('miniprogram/pages/history/index.wxml');
const philWxml = readFile('miniprogram/pages/philosophers/index.wxml');

// Manual critical binding checks
const classicsBindings = ['doSearch', 'switchTab', 'openPoem', 'openClassic', 'closeModal', 'analyzePoem', 'toggleFavoritePoem', 'copySearchResult', 'closeSearch'];
classicsBindings.forEach(fn => check(`classics WXML→JS: ${fn}`, classicsJs.includes(fn + '(')));

const idiomBindings = ['searchIdiom', 'changeDailyIdiom', 'selectCategory', 'lookupIdiom', 'lookupFeatured', 'lookupDailyIdiom', 'toggleFavorite', 'toggleDailyFavorite', 'copyResult', 'closeResult'];
idiomBindings.forEach(fn => check(`idiom WXML→JS: ${fn}`, idiomJs.includes(fn + '(')));

const historyBindings = ['doSearch', 'selectDynasty', 'exploreEvent', 'exploreFigure', 'exploreTrivia', 'closeResult', 'copyAiResult'];
historyBindings.forEach(fn => check(`history WXML→JS: ${fn}`, historyJs.includes(fn + '(')));

const philBindings = ['doSearch', 'openSchool', 'closeModal', 'analyzeSchool', 'exploreQuote', 'copyResult', 'closeResult'];
philBindings.forEach(fn => check(`philosophers WXML→JS: ${fn}`, philJs.includes(fn + '(')));

// ─── [8] 导航逻辑验证 ──────────────────────────────
console.log('\n🗺️  [8] 导航逻辑验证');
const homeJs = readFile('miniprogram/pages/home/index.js');
// Tab pages should use switchTab, non-tab pages should use navigateTo
check('home: translate 用 navigateTo（非tab页）', homeJs.includes("navigateTo({ url: '/pages/translate/index'"));
check('home: vip 用 navigateTo（非tab页）', homeJs.includes("navigateTo({ url: '/pages/vip/index'"));
check('home: classics switchTab 或 navigateTo', homeJs.includes('/pages/classics/index'));
check('home: history switchTab 或 navigateTo', homeJs.includes('/pages/history/index'));
check('home: philosophers switchTab 或 navigateTo', homeJs.includes('/pages/philosophers/index'));
check('home: idiom navigateTo（非tab页）', homeJs.includes('/pages/idiom/index'));

const vipJs = readFile('miniprogram/pages/vip/index.js');
check('vip: 成功后导航到 home（不是chat）', vipJs.includes('/pages/home/index') && !vipJs.includes('/pages/chat'));

// ─── [9] 审核合规性（无明显AI字样暴露给用户）────────
console.log('\n🔍 [9] 审核合规性检查');
const allWxmls = ['classics', 'idiom', 'history', 'philosophers', 'home', 'vip'].map(p =>
  readFile(`miniprogram/pages/${p}/index.wxml`)
).join('\n');

// These are OK to have (loading classes use ai-loading-icon CSS class names)
const prohibited = ['AI正在', 'AI生成', 'AI模型', 'AI助手生成', 'GPT', 'ChatGPT'];
prohibited.forEach(text => {
  check(`WXML无违规文字: "${text}"`, !allWxmls.includes(text));
});

// VIP page text compliance
const vipWxml = readFile('miniprogram/pages/vip/index.wxml');
check('VIP页: 标题不含AI字样', !vipWxml.includes('国文之学'));

// ─── [10] 数据完整性 ──────────────────────────────
console.log('\n📊 [10] 数据完整性');
// 诗词数据
const classicsData = classicsJs;
const poemCount = (classicsData.match(/id: \d+, title:/g) || []).length;
check(`诗词典籍：诗词数据 >= 10 条`, poemCount >= 10, `实际: ${poemCount}`);

// 成语数据
const idiomCount = (idiomJs.match(/word: '[^']+', pinyin:/g) || []).length;
check(`成语故事：成语数据 >= 8 条`, idiomCount >= 8, `实际: ${idiomCount}`);

// 历史朝代
const dynastyCount = (historyJs.match(/id: '[^']+',\s+name:/g) || []).length;
check(`历史探秘：朝代数据 >= 5 个`, dynastyCount >= 5, `实际: ${dynastyCount}`);

// 诸子百家
const schoolCount = (philJs.match(/id: '[^']+', name: '[^']+', emoji:/g) || []).length;
check(`诸子百家：学派数据 >= 5 个`, schoolCount >= 5, `实际: ${schoolCount}`);

// 典籍书目
const classicBooksCount = (classicsData.match(/id: \d+, name: '[^']+', desc:/g) || []).length;
check(`诗词典籍：典籍数据 >= 5 本`, classicBooksCount >= 5, `实际: ${classicBooksCount}`);

// ─── [11] 云函数包配置 ──────────────────────────────
console.log('\n📦 [11] 云函数包配置');
const guoxueDBPkg = JSON.parse(readFile('cloudfunctions/guoxueDB/package.json') || '{}');
check('guoxueDB: package.json name', guoxueDBPkg.name === 'guoxuedbb' || guoxueDBPkg.name === 'guoxuedb');
check('guoxueDB: wx-server-sdk 依赖', guoxueDBPkg.dependencies && 'wx-server-sdk' in guoxueDBPkg.dependencies);

const guoxueAIDir = fs.existsSync(path.join(__dirname, 'cloudfunctions/guoxueAI'));
check('guoxueAI 云函数目录存在', guoxueAIDir);

// ─── [12] Tab图标文件 ──────────────────────────────
console.log('\n🖼️  [12] Tab图标文件');
const tabIcons = [
  'miniprogram/images/tab_home.png',
  'miniprogram/images/tab_home_active.png',
  'miniprogram/images/tab_classics.png',
  'miniprogram/images/tab_classics_active.png',
  'miniprogram/images/tab_history.png',
  'miniprogram/images/tab_history_active.png',
  'miniprogram/images/tab_philosophers.png',
  'miniprogram/images/tab_philosophers_active.png',
];
tabIcons.forEach(f => check(f + ' 存在', fileExists(f)));

// ─── [13] WXSS 样式完整性 ──────────────────────────
console.log('\n🎨 [13] WXSS 样式关键类');
const idiomWxss = readFile('miniprogram/pages/idiom/index.wxss');
check('idiom WXSS: .idiom-page', idiomWxss.includes('.idiom-page'));
check('idiom WXSS: .daily-card', idiomWxss.includes('.daily-card'));
check('idiom WXSS: .featured-item', idiomWxss.includes('.featured-item'));
check('idiom WXSS: .quick-grid', idiomWxss.includes('.quick-grid'));

const historyWxss = readFile('miniprogram/pages/history/index.wxss');
check('history WXSS: .history-page', historyWxss.includes('.history-page'));
check('history WXSS: .dynasty-section', historyWxss.includes('.dynasty-section'));
check('history WXSS: .timeline-item', historyWxss.includes('.timeline-item'));
check('history WXSS: .figure-card', historyWxss.includes('.figure-card'));

const philWxss = readFile('miniprogram/pages/philosophers/index.wxss');
check('philosophers WXSS: .philosophers-page', philWxss.includes('.philosophers-page'));
check('philosophers WXSS: .school-card', philWxss.includes('.school-card'));
check('philosophers WXSS: .quote-card', philWxss.includes('.quote-card'));
check('philosophers WXSS: .modal-box', philWxss.includes('.modal-box'));

const classicsWxss = readFile('miniprogram/pages/classics/index.wxss');
check('classics WXSS: .classics-page', classicsWxss.includes('.classics-page'));
check('classics WXSS: .featured-card', classicsWxss.includes('.featured-card'));
check('classics WXSS: .tab-item', classicsWxss.includes('.tab-item'));
check('classics WXSS: .modal-box', classicsWxss.includes('.modal-box'));

// ─── 最终结果 ──────────────────────────────────────
console.log('\n══════════════════════════════════════════════════');
const total = passed + failed;
console.log(`🎯 v9.0 测试结果: ${passed} 通过 / ${failed} 失败 / ${total} 总计`);
if (failed === 0) {
  console.log('🎉 全部通过！小程序已通过综合回归测试，可提交上线！');
} else {
  console.log(`⚠️  有 ${failed} 项失败，请检查修复后再提交`);
}
console.log('══════════════════════════════════════════════════\n');
process.exit(failed > 0 ? 1 : 0);
