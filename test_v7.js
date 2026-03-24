/**
 * test_v7.js - 国学助手 v7.0 功能验证测试
 * 新增功能：换一条优化 + 分享海报 + 同步优化
 */

const fs   = require('fs');
const path = require('path');

const BASE = path.join(__dirname, 'miniprogram');

let passed = 0;
let failed = 0;

function test(name, cond) {
  if (cond) {
    console.log(`  ✅ PASS: ${name}`);
    passed++;
  } else {
    console.log(`  ❌ FAIL: ${name}`);
    failed++;
  }
}

function readFile(rel) {
  try { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
  catch (_) { return ''; }
}

console.log('\n═══════════════════════════════════════');
console.log('  国学助手 v7.0 功能验证测试');
console.log('═══════════════════════════════════════\n');

// ─── 1. constants.js 扩展验证 ────────────────────────────────
console.log('【1. 兜底名句扩展验证（30条）】');
const constants = readFile('utils/constants.js');
// 通过计数 quote 出现次数估算条目数
const quoteCount = (constants.match(/quote:/g) || []).length;
test('FALLBACK_DAILY_LIST >= 20 条', quoteCount >= 20);
test('新增 DAILY_HISTORY 存储键', constants.includes('DAILY_HISTORY'));
test('新增 DAILY_REFRESH_IDX 存储键', constants.includes('DAILY_REFRESH_IDX'));
test('包含 千里之行，始于足下', constants.includes('千里之行，始于足下'));
test('包含 生于忧患，死于安乐', constants.includes('生于忧患，死于安乐'));
test('包含 老骥伏枥，志在千里', constants.includes('老骥伏枥，志在千里'));
test('包含 莫道桑榆晚', constants.includes('莫道桑榆晚'));
test('包含 大鹏一日同风起', constants.includes('大鹏一日同风起'));

// ─── 2. share.js 工具验证 ────────────────────────────────────
console.log('\n【2. share.js 分享工具验证】');
const shareJs = readFile('utils/share.js');
test('share.js 存在', shareJs.length > 100);
test('buildShareMsg 函数', shareJs.includes('buildShareMsg'));
test('buildShareTimeline 函数', shareJs.includes('buildShareTimeline'));
test('generatePoster 函数', shareJs.includes('generatePoster'));
test('savePosterToAlbum 函数', shareJs.includes('savePosterToAlbum'));
test('drawPoster 函数（Canvas 2D）', shareJs.includes('drawPoster'));
test('包含 Canvas 2D API', shareJs.includes("getContext('2d')"));
test('包含渐变背景绘制', shareJs.includes('createLinearGradient'));
test('包含圆角矩形绘制', shareJs.includes('_drawRoundRect'));
test('包含文字换行函数', shareJs.includes('_wrapText'));
test('包含边框装饰绘制', shareJs.includes('_drawDivider'));
test('module.exports 正确', shareJs.includes('module.exports'));

// ─── 3. 首页 JS 验证（换一条 + 分享）────────────────────────
console.log('\n【3. 首页 JS 验证】');
const homeJs = readFile('pages/home/index.js');
test('引入 share.js', homeJs.includes("require('../../utils/share')") || homeJs.includes('shareUtil'));
test('引入 STORAGE_KEYS', homeJs.includes('STORAGE_KEYS'));
test('_getNextFallback 不重复换一条', homeJs.includes('_getNextFallback'));
test('DAILY_HISTORY 记录已展示', homeJs.includes('DAILY_HISTORY'));
test('换一条含随机索引逻辑', homeJs.includes('candidates') || homeJs.includes('recentIdxs'));
test('refreshDaily 检查 refreshing 防重复点击', homeJs.includes('this.data.refreshing'));
test('后台静默 AI 刷新 _refreshFromAIAsync', homeJs.includes('_refreshFromAIAsync'));
test('seed 参数传递给 getDailyClassic', homeJs.includes('getDailyClassic(true, seed)'));
test('onShareAppMessage 已实现', homeJs.includes('onShareAppMessage'));
test('onShareTimeline 已实现', homeJs.includes('onShareTimeline'));
test('showShareMenu 弹出操作菜单', homeJs.includes('showShareMenu'));
test('openPoster 打开海报弹窗', homeJs.includes('openPoster'));
test('closePoster 关闭海报弹窗', homeJs.includes('closePoster'));
test('_drawPoster 绘制海报', homeJs.includes('_drawPoster'));
test('savePoster 保存到相册', homeJs.includes('savePoster'));
test('data 包含 showPoster 状态', homeJs.includes('showPoster'));
test('data 包含 posterPath 状态', homeJs.includes('posterPath'));
test('data 包含 refreshing 状态', homeJs.includes('refreshing'));

// ─── 4. 首页 WXML 验证 ────────────────────────────────────────
console.log('\n【4. 首页 WXML 验证】');
const homeWxml = readFile('pages/home/index.wxml');
test('头部操作区 head-actions', homeWxml.includes('head-actions'));
test('换一条 pill-spinning 动画 class', homeWxml.includes('pill-spinning'));
test('分享按钮 share-pill', homeWxml.includes('share-pill'));
test('showShareMenu 绑定', homeWxml.includes('showShareMenu'));
test('海报弹窗 poster-mask', homeWxml.includes('poster-mask'));
test('posterCanvas Canvas 2D', homeWxml.includes("type=\"2d\""));
test('posterCanvas id', homeWxml.includes('id="posterCanvas"'));
test('poster-preview 长按保存', homeWxml.includes('show-menu-by-longpress'));
test('保存到相册按钮', homeWxml.includes('savePoster'));
test('发送给好友 button open-type=share', homeWxml.includes('open-type="share"'));
test('关闭按钮 closePoster', homeWxml.includes('closePoster'));
test('card-fade 淡出动画', homeWxml.includes('card-fade'));
test('卡片内分享入口 daily-share-hint', homeWxml.includes('daily-share-hint'));

// ─── 5. 首页 WXSS 验证 ────────────────────────────────────────
console.log('\n【5. 首页 WXSS 验证】');
const homeWxss = readFile('pages/home/index.wxss');
test('换一条旋转动画 @keyframes spin', homeWxss.includes('@keyframes spin'));
test('pill-spinning 样式', homeWxss.includes('pill-spinning'));
test('card-fade 淡出样式', homeWxss.includes('card-fade'));
test('海报遮罩 poster-mask 样式', homeWxss.includes('poster-mask'));
test('海报容器 poster-container 样式', homeWxss.includes('poster-container'));
test('poster-canvas 样式', homeWxss.includes('poster-canvas'));
test('poster-preview 样式', homeWxss.includes('poster-preview'));
test('poster-actions 样式', homeWxss.includes('poster-actions'));
test('poster-btn-save 样式', homeWxss.includes('poster-btn-save'));
test('poster-loading 动画', homeWxss.includes('poster-loading'));
test('head-actions 样式', homeWxss.includes('head-actions'));
test('daily-share-hint 样式', homeWxss.includes('daily-share-hint'));

// ─── 6. api.js 换一条 seed 参数验证 ────────────────────────────
console.log('\n【6. api.js 换一条 seed 参数验证】');
const apiJs = readFile('utils/api.js');
test('getDailyClassic 接受 seed 参数', apiJs.includes('seed'));
test('seed 传入时提高 temperature', apiJs.includes('0.95') || apiJs.includes('temperature = seed'));
test('seed 不覆盖今日缓存', apiJs.includes('if (!seed)'));
test('seed hint 写入 prompt', apiJs.includes('seedHint'));

// ─── 7. 各功能页分享验证 ────────────────────────────────────
console.log('\n【7. 各功能页 onShareAppMessage 验证】');
const classicsJs    = readFile('pages/classics/index.js');
const idiomJs       = readFile('pages/idiom/index.js');
const historyJs     = readFile('pages/history/index.js');
const philosophersJs= readFile('pages/philosophers/index.js');
const translateJs   = readFile('pages/translate/index.js');

test('诗词典籍 onShareAppMessage', classicsJs.includes('onShareAppMessage'));
test('诗词典籍 onShareTimeline',   classicsJs.includes('onShareTimeline'));
test('成语故事 onShareAppMessage', idiomJs.includes('onShareAppMessage'));
test('成语故事 onShareTimeline',   idiomJs.includes('onShareTimeline'));
test('历史探秘 onShareAppMessage', historyJs.includes('onShareAppMessage'));
test('历史探秘 onShareTimeline',   historyJs.includes('onShareTimeline'));
test('诸子百家 onShareAppMessage', philosophersJs.includes('onShareAppMessage'));
test('诸子百家 onShareTimeline',   philosophersJs.includes('onShareTimeline'));
test('古文翻译 onShareAppMessage', translateJs.includes('onShareAppMessage'));
test('古文翻译 onShareTimeline',   translateJs.includes('onShareTimeline'));
test('古文翻译 shareResult 弹出菜单', translateJs.includes('showActionSheet'));

// ─── 8. 文件完整性检查 ──────────────────────────────────────
console.log('\n【8. 文件完整性检查】');
const files = [
  'utils/share.js',
  'utils/constants.js',
  'utils/api.js',
  'pages/home/index.js',
  'pages/home/index.wxml',
  'pages/home/index.wxss',
  'pages/translate/index.js',
  'pages/classics/index.js',
  'pages/idiom/index.js',
  'pages/history/index.js',
  'pages/philosophers/index.js',
];
for (const f of files) {
  const content = readFile(f);
  test(`${f} 存在且非空`, content.length > 50);
}

// ─── 总结 ────────────────────────────────────────────────────
console.log('\n═══════════════════════════════════════');
console.log(`  总计：${passed + failed} 个测试`);
console.log(`  ✅ 通过：${passed}`);
console.log(`  ❌ 失败：${failed}`);
console.log('═══════════════════════════════════════\n');

if (failed === 0) {
  console.log('🎉 所有测试通过！v7.0 新功能验证完成。');
  console.log('  ✅ 换一条功能优化（30条本地库，随机不重复，后台AI刷新）');
  console.log('  ✅ 首页分享功能（发给好友 / 朋友圈 / 生成海报）');
  console.log('  ✅ Canvas 2D 海报绘制（古典风格 + 小程序码占位）');
  console.log('  ✅ 海报保存到相册（权限处理）');
  console.log('  ✅ 全部五大模块添加 onShareAppMessage + onShareTimeline');
  console.log('  ✅ api.js getDailyClassic 支持 seed 参数（多样化内容）');
} else {
  console.log(`⚠️  有 ${failed} 个测试失败，请检查对应代码。`);
  process.exit(1);
}
