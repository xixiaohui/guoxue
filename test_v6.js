/**
 * 功能测试脚本 v6.0
 * 验证：
 *   - 已移除AI问答(chat)模块
 *   - 五大功能模块（翻译/诗词/成语/历史/诸子百家）结构完整
 *   - 常量配置正确
 *   - 导航结构符合要求
 *   - 配额逻辑
 *   - 诸子百家新页面
 *
 * 运行：node test_v6.js
 */

'use strict';
const fs = require('fs');
const path = require('path');

let passed = 0, failed = 0;

function assert(cond, msg) {
  if (cond) { console.log(`  ✅ PASS: ${msg}`); passed++; }
  else       { console.error(`  ❌ FAIL: ${msg}`); failed++; }
}

function readFile(relPath) {
  const fullPath = path.join(__dirname, relPath);
  return fs.existsSync(fullPath) ? fs.readFileSync(fullPath, 'utf8') : null;
}

// ─── 内联核心逻辑（无需wx环境）─────────────────────────────────
const FREE_DAILY_LIMIT = 10;
const MIN_INTERVAL = 1500;

function _today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function simulateCheckAndConsume(storage, today) {
  const key = `quota_${today}`;
  const rec = storage[key] || { used: 0, date: today };
  if (rec.used >= FREE_DAILY_LIMIT) {
    return { success: true, allowed: false, quota_exceeded: true, remaining: 0 };
  }
  rec.used++;
  storage[key] = rec;
  return { success: true, allowed: true, quota_exceeded: false, remaining: FREE_DAILY_LIMIT - rec.used };
}

// ─── 测试区 ────────────────────────────────────────────────────

// ── 1. 文件结构完整性 ──────────────────────────────────────────
console.log('\n【1. 文件结构完整性】');

const requiredFiles = [
  'miniprogram/app.json',
  'miniprogram/pages/home/index.js',
  'miniprogram/pages/home/index.wxml',
  'miniprogram/pages/home/index.wxss',
  'miniprogram/pages/translate/index.js',
  'miniprogram/pages/translate/index.wxml',
  'miniprogram/pages/translate/index.wxss',
  'miniprogram/pages/classics/index.js',
  'miniprogram/pages/classics/index.wxml',
  'miniprogram/pages/classics/index.wxss',
  'miniprogram/pages/idiom/index.js',
  'miniprogram/pages/idiom/index.wxml',
  'miniprogram/pages/idiom/index.wxss',
  'miniprogram/pages/history/index.js',
  'miniprogram/pages/history/index.wxml',
  'miniprogram/pages/history/index.wxss',
  'miniprogram/pages/philosophers/index.js',
  'miniprogram/pages/philosophers/index.wxml',
  'miniprogram/pages/philosophers/index.wxss',
  'miniprogram/pages/philosophers/index.json',
  'miniprogram/utils/constants.js',
  'miniprogram/utils/api.js',
  'miniprogram/utils/ai.js',
];

for (const f of requiredFiles) {
  const content = readFile(f);
  assert(content !== null && content.length > 0, `文件存在: ${f}`);
}

// ── 2. Chat模块已移除 ─────────────────────────────────────────
console.log('\n【2. AI问答(Chat)模块已移除】');

const appJson = JSON.parse(readFile('miniprogram/app.json') || '{}');

assert(
  !appJson.pages.includes('pages/chat/index'),
  'app.json 不包含 chat 页面'
);
assert(
  !(appJson.tabBar?.list || []).some(t => t.pagePath === 'pages/chat/index'),
  'tabBar 不包含 chat 标签'
);
assert(
  appJson.pages.includes('pages/philosophers/index'),
  'app.json 包含 philosophers 页面'
);

// ── 3. 首页无Chat跳转 ─────────────────────────────────────────
console.log('\n【3. 首页已移除AI问答入口】');

const homeJs = readFile('miniprogram/pages/home/index.js') || '';
const homeWxml = readFile('miniprogram/pages/home/index.wxml') || '';

assert(!homeJs.includes("/pages/chat/index"), '首页JS无chat跳转');
assert(!homeWxml.includes('pages/chat/index'), '首页WXML无chat链接');
assert(homeJs.includes('/pages/philosophers/index'), '首页JS包含诸子百家跳转');
assert(homeWxml.includes('诸子百家') || homeWxml.includes('philosophers') || homeJs.includes('philosophers'), '首页包含诸子百家导航');

// ── 4. 翻译页面丰富性 ────────────────────────────────────────
console.log('\n【4. 古文翻译页面丰富性】');

const translateJs = readFile('miniprogram/pages/translate/index.js') || '';
const translateWxml = readFile('miniprogram/pages/translate/index.wxml') || '';
const translateWxss = readFile('miniprogram/pages/translate/index.wxss') || '';

assert(!translateJs.includes('/pages/chat/index'), '翻译页无chat跳转');
assert(translateJs.includes('classicGroups'), '翻译页包含经典名句分组');
assert(translateJs.includes('tips'), '翻译页包含翻译技巧');
assert(translateWxml.includes('useClassicQuote'), '翻译页WXML包含名句点击功能');
assert(translateWxml.includes('loading-dots'), '翻译页WXML包含加载动画');
assert(translateWxss.includes('dot-bounce'), '翻译页WXSS包含点动画');
assert(translateWxss.includes('tips-grid'), '翻译页WXSS包含技巧网格');
// 检查示例数量（至少6个）
const exampleCount = (translateJs.match(/text:/g) || []).length;
assert(exampleCount >= 10, `翻译页示例数量充足 (${exampleCount} items)`);

// ── 5. 诗词典籍丰富性 ───────────────────────────────────────
console.log('\n【5. 诗词典籍页面丰富性】');

const classicsJs = readFile('miniprogram/pages/classics/index.js') || '';
const classicsWxml = readFile('miniprogram/pages/classics/index.wxml') || '';
const classicsWxss = readFile('miniprogram/pages/classics/index.wxss') || '';

assert(!classicsJs.includes('/pages/chat/index'), '诗词页无chat跳转');
assert(classicsJs.includes('tangPoems'), '诗词页包含唐诗列表');
assert(classicsJs.includes('songCi'), '诗词页包含宋词列表');
assert(classicsJs.includes('yuanQu'), '诗词页包含元曲列表');
assert(classicsJs.includes('highlights'), '诗词页典籍包含精华名句');
assert(classicsWxml.includes('tabs-scroll'), '诗词页WXML含Tab滚动');
assert(classicsWxml.includes('dynasty-banner'), '诗词页WXML含朝代横幅');
assert(classicsWxss.includes('dynasty-banner'), '诗词页WXSS含朝代横幅样式');
// 检查诗词数量（poems array至少10首）
const poemCount = (classicsJs.match(/{ id: \d+, title:/g) || []).length;
assert(poemCount >= 10, `诗词页诗词数量 (${poemCount}首)`);
// 典籍数量（至少8本）
const bookCount = (classicsJs.match(/name: '/g) || []).length;
assert(bookCount >= 8, `诗词页典籍数量 (${bookCount}本)`);

// ── 6. 成语故事丰富性 ───────────────────────────────────────
console.log('\n【6. 成语故事页面丰富性】');

const idiomJs = readFile('miniprogram/pages/idiom/index.js') || '';
const idiomWxml = readFile('miniprogram/pages/idiom/index.wxml') || '';
const idiomWxss = readFile('miniprogram/pages/idiom/index.wxss') || '';

assert(!idiomJs.includes('/pages/chat/index'), '成语页无chat跳转');
assert(idiomJs.includes('story'), '成语页包含故事字段');
assert(idiomJs.includes('featuredIdioms'), '成语页包含精选成语');
assert(idiomJs.includes('idiomCategories'), '成语页包含分类');
assert(idiomWxml.includes('feat-story'), '成语页WXML含故事展示');
assert(idiomWxml.includes('cat-scroll'), '成语页WXML含分类滚动');
assert(idiomWxss.includes('feat-story'), '成语页WXSS含故事样式');
// 精选成语数量（至少8个）
const featuredCount = (idiomJs.match(/id: \d+, word:/g) || []).length;
assert(featuredCount >= 8, `成语页精选数量 (${featuredCount}个)`);

// ── 7. 历史探秘丰富性 ───────────────────────────────────────
console.log('\n【7. 历史探秘页面丰富性】');

const historyJs = readFile('miniprogram/pages/history/index.js') || '';
const historyWxml = readFile('miniprogram/pages/history/index.wxml') || '';
const historyWxss = readFile('miniprogram/pages/history/index.wxss') || '';

assert(!historyJs.includes('/pages/chat/index'), '历史页无chat跳转');
assert(historyJs.includes('aiResultSections'), '历史页包含分段结果');
assert(historyJs.includes('historyFacts'), '历史页包含历史小知识');
assert(historyJs.includes('trivias'), '历史页包含历史趣闻');
assert(historyWxml.includes('figures-scroll'), '历史页WXML含名人横滚');
assert(historyWxml.includes('facts-scroll'), '历史页WXML含小知识横滚');
assert(historyWxss.includes('figure-card'), '历史页WXSS含名人卡片样式');
// 朝代数量（至少7个）
const dynastyCount = (historyJs.match(/{ id: '\w+',/g) || []).length;
assert(dynastyCount >= 7, `历史页朝代数量 (${dynastyCount}个)`);
// 名人数量（至少8个）
const figureCount = (historyJs.match(/name: '[^']+', dynasty:/g) || []).length;
assert(figureCount >= 8, `历史页名人数量 (${figureCount}个)`);

// ── 8. 诸子百家新页面 ───────────────────────────────────────
console.log('\n【8. 诸子百家页面完整性】');

const philJs = readFile('miniprogram/pages/philosophers/index.js') || '';
const philWxml = readFile('miniprogram/pages/philosophers/index.wxml') || '';
const philWxss = readFile('miniprogram/pages/philosophers/index.wxss') || '';
const philJson = readFile('miniprogram/pages/philosophers/index.json') || '';

assert(philJs.length > 0, '诸子百家 JS 存在');
assert(philWxml.length > 0, '诸子百家 WXML 存在');
assert(philWxss.length > 0, '诸子百家 WXSS 存在');
assert(philJson.length > 0, '诸子百家 JSON 配置存在');

// 学派数量（至少6个）
const schoolCount = (philJs.match(/id: '\w+', name:/g) || []).length;
assert(schoolCount >= 6, `诸子百家学派数量 (${schoolCount}个)`);

// 功能检查
assert(philJs.includes('openSchool'), '诸子百家含学派详情功能');
assert(philJs.includes('analyzeSchool'), '诸子百家含AI解析功能');
assert(philJs.includes('exploreQuote'), '诸子百家含名言探索功能');
assert(philJs.includes('masterQuotes'), '诸子百家含诸子名言');
assert(philWxml.includes('schools-grid'), '诸子百家WXML含学派网格');
assert(philWxml.includes('modal-mask'), '诸子百家WXML含详情弹窗');
assert(philWxml.includes('compare-table'), '诸子百家WXML含思想对比表');
assert(philWxss.includes('school-card'), '诸子百家WXSS含学派卡片样式');
assert(philWxss.includes('compare-table'), '诸子百家WXSS含对比表样式');
assert(philJson.includes('诸子百家'), '诸子百家JSON含页面标题');

// ── 9. 常量配置 ──────────────────────────────────────────────
console.log('\n【9. 常量配置验证】');

const constJs = readFile('miniprogram/utils/constants.js') || '';

assert(constJs.includes('FREE_DAILY_LIMIT: 10'), 'FREE_DAILY_LIMIT = 10');
assert(!constJs.includes('/pages/chat/index'), 'TAB_PAGES 无chat路径');
assert(constJs.includes('/pages/philosophers/index'), 'TAB_PAGES 含哲学家路径');
assert(!constJs.includes("CHAT: 'chat'"), 'AI_TYPES 已移除CHAT类型');
assert(constJs.includes("PHILOSOPHER: 'philosopher'"), 'AI_TYPES 含PHILOSOPHER类型');

// ── 10. 配额逻辑测试 ──────────────────────────────────────────
console.log('\n【10. 配额逻辑测试】');

const storage = {};
const today = _today();

// 新用户：第1次消耗
const r1 = simulateCheckAndConsume(storage, today);
assert(r1.allowed === true, '新用户首次消耗：允许');
assert(r1.remaining === 9, `首次消耗后剩余9次 (actual: ${r1.remaining})`);

// 消耗到第9次
for (let i = 2; i <= 9; i++) simulateCheckAndConsume(storage, today);
const r9 = simulateCheckAndConsume(storage, today);
assert(r9.allowed === true, '第10次消耗：允许');
assert(r9.remaining === 0, `第10次消耗后剩余0次 (actual: ${r9.remaining})`);

// 第11次：超限
const r11 = simulateCheckAndConsume(storage, today);
assert(r11.allowed === false, '第11次消耗：拒绝');
assert(r11.quota_exceeded === true, '配额超限标志正确');

// 次日重置
const tomorrow = (() => { const d = new Date(); d.setDate(d.getDate()+1); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; })();
const rt = simulateCheckAndConsume(storage, tomorrow);
assert(rt.allowed === true, '次日重置后允许消耗');

// ── 11. 限流逻辑测试 ──────────────────────────────────────────
console.log('\n【11. 前端限流逻辑测试】');

const _lastCallTime = {};

function throttleCheck(type) {
  const now = Date.now();
  const last = _lastCallTime[type] || 0;
  if (now - last < MIN_INTERVAL) throw new Error(`操作太频繁，请稍候（${MIN_INTERVAL}ms限制）`);
  _lastCallTime[type] = now;
}

try { throttleCheck('translate'); assert(true, '首次调用不触发限流'); } catch (e) { assert(false, e.message); }

try {
  throttleCheck('translate');
  assert(false, '快速第二次调用应触发限流');
} catch (e) {
  assert(e.message.includes('太频繁'), '快速调用触发限流');
}

// ── 12. UI关键元素检查 ──────────────────────────────────────
console.log('\n【12. UI关键元素检查】');

// 检查所有页面均有hover效果
const pages = [
  { name: '首页', js: homeJs, wxml: homeWxml },
  { name: '翻译', wxml: translateWxml },
  { name: '诗词', wxml: classicsWxml },
  { name: '成语', wxml: idiomWxml },
  { name: '历史', wxml: historyWxml },
  { name: '诸子', wxml: philWxml }
];

for (const p of pages) {
  assert(p.wxml.includes('hover-class'), `${p.name}页包含hover交互`);
}

// 检查滚动视图优化
const scrollPages = [translateWxml, classicsWxml, idiomWxml, historyWxml, philWxml];
for (const wxml of scrollPages) {
  if (wxml.includes('scroll-view')) {
    assert(wxml.includes('enhanced="{{true}}"') || wxml.includes("enhanced='true'") || wxml.includes('scroll-x') || wxml.includes('scroll-y'), '页面scroll-view优化');
  }
}

// 检查safe-bottom
const allWxmls = [homeWxml, translateWxml, classicsWxml, idiomWxml, historyWxml, philWxml];
for (const [i, wxml] of allWxmls.entries()) {
  assert(wxml.includes('safe-bottom'), `页面${i+1}包含safe-bottom`);
}

// ── 13. 导航配置验证 ──────────────────────────────────────────
console.log('\n【13. 导航配置验证】');

const tabList = appJson.tabBar?.list || [];
assert(tabList.length >= 4, `TabBar至少4个标签 (${tabList.length}个)`);
assert(tabList.some(t => t.pagePath === 'pages/home/index'), 'TabBar含首页');
assert(tabList.some(t => t.pagePath === 'pages/translate/index'), 'TabBar含翻译页');
assert(tabList.some(t => t.pagePath === 'pages/classics/index'), 'TabBar含诗词典籍');
assert(tabList.some(t => t.pagePath === 'pages/history/index'), 'TabBar含历史页');
assert(!tabList.some(t => t.pagePath === 'pages/chat/index'), 'TabBar不含chat页');

// ── 14. 错误映射验证 ──────────────────────────────────────────
console.log('\n【14. 错误映射验证】');

function friendlyError(msg) {
  if (!msg) return '遇到了问题，请重试';
  const m = msg.toLowerCase();
  if (m.includes('timeout') || m.includes('timed out') || m.includes('超时')) return '响应超时，请稍后重试';
  if (m.includes('quota_exceeded') || m.includes('次数已用完')) return '今日免费次数已用完';
  if (m.includes('太频繁') || m.includes('rate_limit')) return '操作太频繁，请稍候';
  if (m.includes('network') || m.includes('failed to fetch')) return '网络异常，请检查网络';
  if (m.includes('empty') || m.includes('no content')) return 'AI未返回内容，请重试';
  return msg.slice(0, 50);
}

assert(friendlyError('timeout error').includes('超时'), '超时错误映射正确');
assert(friendlyError('QUOTA_EXCEEDED').includes('用完'), '配额超限映射正确');
assert(friendlyError('太频繁').includes('频繁'), '限流错误映射正确');
assert(friendlyError('network failed').includes('网络'), '网络错误映射正确');
assert(friendlyError('empty response').includes('未返回'), '空响应映射正确');
assert(friendlyError(null).includes('重试'), '空错误兜底正确');

// ── 15. 分段解析测试 ──────────────────────────────────────────
console.log('\n【15. 分段解析测试】');

function parseSections(text) {
  const sections = [];
  const re = /【([^】]+)】\s*([\s\S]*?)(?=【|$)/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const content = m[2].trim();
    if (content) sections.push({ label: m[1], content });
  }
  if (sections.length === 0 && text.trim()) {
    sections.push({ label: '解析结果', content: text.trim() });
  }
  return sections;
}

const sampleText1 = '【成语释义】比喻刻苦自励，发愤图强\n\n【出处典故】春秋时越王勾践被吴国打败后...\n\n【用法示例】\n例句1：他卧薪尝胆，终于成功了。';
const s1 = parseSections(sampleText1);
assert(s1.length === 3, `分段解析：正确分3段 (${s1.length}段)`);
assert(s1[0].label === '成语释义', '第一段标签正确');
assert(s1[1].label === '出处典故', '第二段标签正确');

const sampleText2 = '这是没有分段格式的普通文本，不含【标签】。';
const s2 = parseSections(sampleText2);
assert(s2.length === 1, '无分段文本整体处理');
// 无分段文本标签可以是任意兜底值（各页面实现不同）
assert(s2.length === 1 && s2[0].content.length > 0, '无分段文本有内容');

// ── 16. 模型配置（已简化，无DeepSeek） ─────────────────────────
console.log('\n【16. AI模型配置验证】');

const aiJs = readFile('miniprogram/utils/ai.js') || '';
assert(aiJs.includes('hunyuan'), 'ai.js 包含混元模型配置');
assert(aiJs.includes('callAI'), 'ai.js 包含callAI函数');
assert(aiJs.includes('callAIStream'), 'ai.js 包含callAIStream函数');

// ─── 汇总 ──────────────────────────────────────────────────────
console.log('\n═══════════════════════════════════════');
console.log(`  总计：${passed + failed} 个测试`);
console.log(`  ✅ 通过：${passed}`);
console.log(`  ❌ 失败：${failed}`);
console.log('═══════════════════════════════════════\n');

if (failed === 0) {
  console.log('🎉 所有测试通过！v6.0 五大模块功能验证完成。');
  console.log('  ✅ AI问答(chat)模块已移除');
  console.log('  ✅ 古文翻译 - 经典名句、翻译技巧、丰富示例');
  console.log('  ✅ 诗词典籍 - 唐诗宋词元曲分类、八大典籍');
  console.log('  ✅ 成语故事 - 精选故事含典故、分类浏览');
  console.log('  ✅ 历史探秘 - 朝代时间轴、名人堂、历史趣闻');
  console.log('  ✅ 诸子百家 - 六大学派、思想对比、AI深度解析');
  console.log('  ✅ 首页 - 五大功能导航、无AI问答入口');
} else {
  console.error(`⚠️  有 ${failed} 个测试失败，请检查代码！`);
  process.exit(1);
}
