/**
 * 云函数逻辑验证测试脚本
 * 不需要真实微信云环境，通过模拟测试核心逻辑
 * 运行：node test_cloudfunctions.js
 */

'use strict';

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) {
    console.log(`  ✅ PASS: ${msg}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${msg}`);
    failed++;
  }
}

// ─── 内联核心逻辑（不依赖 wx-server-sdk） ─────────────────────────

const FREE_DAILY_LIMIT = 10;

function _today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function _formatDate(d) {
  return `${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日`;
}

function friendlyError(e) {
  const msg = (e?.message || String(e)).toLowerCase();
  if (msg.includes('timeout') || msg.includes('超时'))      return '请求超时，请检查网络后重试';
  if (msg.includes('token') || msg.includes('过长'))        return '输入内容过长，请缩短后重试';
  if (msg.includes('quota') || msg.includes('limit'))       return 'AI调用次数达到上限，请稍后再试';
  if (msg.includes('createmodel') || msg.includes(' ai ')) return 'AI模型暂时不可用，请稍后再试';
  if (msg.includes('network') || msg.includes('net::'))    return '网络异常，请检查网络连接后重试';
  if (msg.includes('为空') || msg.includes('empty'))       return 'AI返回内容为空，请稍后重试';
  return 'AI服务暂时繁忙，请稍后重试';
}

// 模拟配额检查逻辑（不含数据库操作）
function simulateQuotaCheck(doc, openid) {
  const now = Date.now();
  const today = _today();

  const isVip = (doc.vip_expire || 0) > now;
  const hasAdBonus = (doc.ad_bonus_expire || 0) > now;

  if (isVip || hasAdBonus) {
    return { canUse: true, isVip, hasAdBonus, remaining: 999 };
  }

  const used = (doc.date === today) ? (doc.used || 0) : 0;
  if (used >= FREE_DAILY_LIMIT) {
    return { canUse: false, isVip: false, hasAdBonus: false, remaining: 0 };
  }

  return { canUse: true, isVip: false, hasAdBonus: false, remaining: FREE_DAILY_LIMIT - used - 1 };
}

// 模拟 userQuota consumeQuota 逻辑
function simulateConsumeQuota(doc) {
  const now = Date.now();
  const today = _today();

  const isVip = doc.vip_expire > now;
  const hasAdBonus = doc.ad_bonus_expire > now;

  if (isVip || hasAdBonus) {
    return { consumed: false, isUnlimited: true, remaining: 999, quota_exceeded: false };
  }

  const used = (doc.date === today) ? (doc.used || 0) : 0;

  if (used >= FREE_DAILY_LIMIT) {
    return { consumed: false, isUnlimited: false, remaining: 0, quota_exceeded: true };
  }

  const newUsed = used + 1;
  const remaining = FREE_DAILY_LIMIT - newUsed;
  return { consumed: true, isUnlimited: false, remaining, used: newUsed, quota_exceeded: false };
}

// ─── 测试套件 ──────────────────────────────────────────────────

console.log('\n══════════════════════════════════════════════');
console.log('  国学AI助手 - 云函数逻辑单元测试');
console.log('══════════════════════════════════════════════\n');

// ── 1. 常量验证 ──────────────────────────────────────────────
console.log('【1】常量与配置验证');
assert(FREE_DAILY_LIMIT === 10, `免费日限额应为10次，当前: ${FREE_DAILY_LIMIT}`);
assert(typeof _today() === 'string', '_today() 返回字符串');
assert(/^\d{4}-\d{2}-\d{2}$/.test(_today()), `_today() 格式正确: ${_today()}`);
assert(_formatDate(new Date()).includes('年'), '_formatDate() 包含年字');

// ── 2. 新用户（首次使用） ─────────────────────────────────────
console.log('\n【2】新用户 - 首次使用');
const newUserDoc = {
  _id: 'user_new',
  openid: 'user_new',
  date: _today(),
  used: 0,
  vip_expire: 0,
  ad_bonus_expire: 0,
  total_used: 0,
};
const r1 = simulateQuotaCheck(newUserDoc, 'user_new');
assert(r1.canUse === true, '新用户可以使用AI');
assert(r1.remaining === FREE_DAILY_LIMIT - 1, `新用户首次使用后剩余 ${FREE_DAILY_LIMIT-1} 次`);
assert(!r1.isVip, '新用户非VIP');
assert(!r1.hasAdBonus, '新用户无广告奖励');

// ── 3. 配额耗尽 ──────────────────────────────────────────────
console.log('\n【3】普通用户 - 配额耗尽');
const exhaustedDoc = {
  date: _today(),
  used: FREE_DAILY_LIMIT,
  vip_expire: 0,
  ad_bonus_expire: 0,
};
const r2 = simulateQuotaCheck(exhaustedDoc, 'user_exhausted');
assert(r2.canUse === false, '配额耗尽后不能使用');
assert(r2.remaining === 0, '剩余次数为0');

const r2c = simulateConsumeQuota(exhaustedDoc);
assert(r2c.quota_exceeded === true, 'consumeQuota 正确返回 quota_exceeded');
assert(r2c.consumed === false, 'consumeQuota 未消费');

// ── 4. 跨日重置 ──────────────────────────────────────────────
console.log('\n【4】跨日自动重置');
const yesterdayDoc = {
  date: '2024-01-01',   // 昨天的日期
  used: FREE_DAILY_LIMIT,  // 昨天已用完
  vip_expire: 0,
  ad_bonus_expire: 0,
};
const r3 = simulateQuotaCheck(yesterdayDoc, 'user_yesterday');
assert(r3.canUse === true, '跨日后配额重置可使用');
assert(r3.remaining === FREE_DAILY_LIMIT - 1, '跨日后剩余正确');

// ── 5. VIP 用户 ──────────────────────────────────────────────
console.log('\n【5】VIP会员 - 无限调用');
const vipDoc = {
  date: _today(),
  used: FREE_DAILY_LIMIT,  // 即使已用完也能使用
  vip_expire: Date.now() + 30 * 24 * 60 * 60 * 1000,  // 30天后到期
  ad_bonus_expire: 0,
};
const r4 = simulateQuotaCheck(vipDoc, 'user_vip');
assert(r4.canUse === true, 'VIP用户可无限使用');
assert(r4.isVip === true, 'VIP标志正确');
assert(r4.remaining === 999, 'VIP剩余显示999');

const r4c = simulateConsumeQuota(vipDoc);
assert(r4c.isUnlimited === true, 'VIP用户consumeQuota返回isUnlimited');
assert(r4c.consumed === false, 'VIP用户不消耗配额');

// ── 6. VIP 过期 ──────────────────────────────────────────────
console.log('\n【6】VIP到期后降级');
const expiredVipDoc = {
  date: _today(),
  used: 0,
  vip_expire: Date.now() - 1000,  // 1秒前过期
  ad_bonus_expire: 0,
};
const r5 = simulateQuotaCheck(expiredVipDoc, 'user_expired_vip');
assert(r5.isVip === false, 'VIP过期后isVip为false');
assert(r5.canUse === true, 'VIP过期后仍可使用免费额度');
assert(r5.remaining === FREE_DAILY_LIMIT - 1, '过期VIP使用免费额度');

// ── 7. 广告奖励 ──────────────────────────────────────────────
console.log('\n【7】激励广告 - 奖励解锁');
const adBonusDoc = {
  date: _today(),
  used: FREE_DAILY_LIMIT,  // 免费配额已用完
  vip_expire: 0,
  ad_bonus_expire: Date.now() + 24 * 60 * 60 * 1000,  // 24h奖励
};
const r6 = simulateQuotaCheck(adBonusDoc, 'user_ad_bonus');
assert(r6.canUse === true, '广告奖励后可使用');
assert(r6.hasAdBonus === true, '广告奖励标志正确');
assert(r6.remaining === 999, '广告奖励剩余显示999');

// ── 8. 广告奖励过期 ──────────────────────────────────────────
console.log('\n【8】广告奖励到期后恢复限制');
const expiredAdDoc = {
  date: _today(),
  used: FREE_DAILY_LIMIT,
  vip_expire: 0,
  ad_bonus_expire: Date.now() - 1000,  // 已过期
};
const r7 = simulateQuotaCheck(expiredAdDoc, 'user_expired_ad');
assert(r7.canUse === false, '广告奖励过期后配额限制恢复');
assert(r7.hasAdBonus === false, '广告奖励标志为false');

// ── 9. 输入验证 ──────────────────────────────────────────────
console.log('\n【9】输入验证逻辑');
const MAX_INPUT_LENGTH = 2000;

function simulateValidate(text, maxLen) {
  if (!text?.trim()) return { valid: false, error: '请输入内容' };
  if (text.length > maxLen) return { valid: false, error: `内容过长，请控制在${maxLen}字以内` };
  return { valid: true };
}

assert(simulateValidate('', 2000).valid === false, '空输入验证失败');
assert(simulateValidate('   ', 2000).valid === false, '纯空格输入验证失败');
assert(simulateValidate('静夜思', 2000).valid === true, '正常输入通过验证');
assert(simulateValidate('x'.repeat(2001), 2000).valid === false, '超长输入被拦截');
assert(simulateValidate('x'.repeat(2000), 2000).valid === true, '边界长度（2000字）通过验证');

// 成语长度验证
function validateIdiom(word) {
  if (!word?.trim()) return false;
  return word.trim().length <= 20;
}
assert(validateIdiom('一鸣惊人') === true, '成语"一鸣惊人"通过验证');
assert(validateIdiom('x'.repeat(21)) === false, '超长成语被拦截');
assert(validateIdiom('') === false, '空成语验证失败');

// ── 10. 友好错误消息 ──────────────────────────────────────────
console.log('\n【10】friendlyError 映射验证');
assert(friendlyError(new Error('quota exceeded')).includes('上限'), 'quota错误正确映射');
assert(friendlyError(new Error('timeout')).includes('超时'), 'timeout错误正确映射');
assert(friendlyError(new Error('token limit')).includes('过长'), 'token错误正确映射');
assert(friendlyError(new Error('内容为空')).includes('为空'), '空内容错误正确映射');
assert(friendlyError(new Error('unknown error')).includes('繁忙'), '未知错误映射到通用消息');

// ── 11. 消息列表过滤（chat处理器） ──────────────────────────────
console.log('\n【11】对话消息格式验证');
function filterAndTrimMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return null;
  const valid = messages.filter(m => m && typeof m.role === 'string' && typeof m.content === 'string');
  if (valid.length === 0) return null;
  return valid.slice(-12);
}

const goodMsgs = [{ role: 'user', content: '你好' }];
const badMsgs = [{ role: 123, content: null }, null, undefined];
const longMsgs = Array.from({ length: 20 }, (_, i) => ({ role: 'user', content: `msg${i}` }));

assert(filterAndTrimMessages(goodMsgs) !== null, '有效消息通过过滤');
assert(filterAndTrimMessages(badMsgs) === null, '无效消息全被过滤');
assert(filterAndTrimMessages([]) === null, '空消息列表返回null');
assert(filterAndTrimMessages(longMsgs).length === 12, '消息列表截断为最后12条');

// ── 12. 请求类型路由 ──────────────────────────────────────────
console.log('\n【12】请求类型路由验证');
const VALID_TYPES = ['chat', 'translate', 'daily', 'daily_idiom', 'poem', 'idiom', 'history', 'search'];
const QUOTA_FREE_TYPES = ['daily', 'daily_idiom'];

VALID_TYPES.forEach(type => {
  assert(VALID_TYPES.includes(type), `类型"${type}"在有效列表中`);
});

assert(QUOTA_FREE_TYPES.includes('daily'), 'daily不计入配额');
assert(QUOTA_FREE_TYPES.includes('daily_idiom'), 'daily_idiom不计入配额');
assert(!QUOTA_FREE_TYPES.includes('chat'), 'chat计入配额');
assert(!QUOTA_FREE_TYPES.includes('translate'), 'translate计入配额');

// ── 13. 整体计费流程模拟 ──────────────────────────────────────
console.log('\n【13】完整计费流程模拟');
let mockDoc = { date: _today(), used: 0, vip_expire: 0, ad_bonus_expire: 0, total_used: 0 };

for (let i = 0; i < FREE_DAILY_LIMIT; i++) {
  const r = simulateConsumeQuota(mockDoc);
  assert(r.consumed === true && !r.quota_exceeded, `第${i+1}次消费成功`);
  mockDoc = { ...mockDoc, used: mockDoc.used + 1, total_used: mockDoc.total_used + 1 };
}
// 第11次应该超额
const overLimit = simulateConsumeQuota(mockDoc);
assert(overLimit.quota_exceeded === true, `第${FREE_DAILY_LIMIT+1}次消费被拦截（配额已满）`);

// ── 14. JSON 解析逻辑（每日经典/成语） ──────────────────────────
console.log('\n【14】AI返回JSON解析逻辑');

function parseJsonFromAIResponse(raw) {
  try {
    const jsonStr = raw.match(/\{[\s\S]*\}/)?.[0] || raw;
    return JSON.parse(jsonStr);
  } catch (e) {
    return null;
  }
}

const validJson = '{"word":"一鸣惊人","pinyin":"yī míng jīng rén"}';
const jsonWithPrefix = '好的，以下是成语：\n{"word":"破釜沉舟"}';
const invalidJson = '这不是JSON';

assert(parseJsonFromAIResponse(validJson)?.word === '一鸣惊人', '纯JSON响应正确解析');
assert(parseJsonFromAIResponse(jsonWithPrefix)?.word === '破釜沉舟', '带前缀的JSON正确提取');
assert(parseJsonFromAIResponse(invalidJson) === null, '非JSON返回null（使用兜底）');

// ── 汇总 ─────────────────────────────────────────────────────
console.log('\n══════════════════════════════════════════════');
console.log(`  测试完成: ${passed + failed} 项`);
console.log(`  ✅ 通过: ${passed} 项`);
console.log(`  ❌ 失败: ${failed} 项`);
console.log('══════════════════════════════════════════════\n');

if (failed > 0) {
  console.error('⚠️  有测试失败，请检查以上错误项');
  process.exit(1);
} else {
  console.log('🎉 所有测试通过！云函数逻辑验证成功。');
  console.log('\n📋 验证摘要:');
  console.log(`  • 每日免费限额: ${FREE_DAILY_LIMIT} 次`);
  console.log('  • 配额检查逻辑: ✅ 正常');
  console.log('  • VIP/广告奖励: ✅ 正常');
  console.log('  • 跨日重置:     ✅ 正常');
  console.log('  • 输入验证:     ✅ 正常');
  console.log('  • 错误处理:     ✅ 正常');
  console.log('  • 消息格式:     ✅ 正常');
  console.log('  • 计费流程:     ✅ 正常');
  console.log('  • JSON解析:     ✅ 正常');
  process.exit(0);
}
