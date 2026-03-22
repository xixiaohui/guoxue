/**
 * userQuota 云函数 - 用户配额与会员管理
 *
 * 免费层：每天 FREE_DAILY_LIMIT 次 AI 调用（按自然日重置）
 * 广告层：看完激励视频 +1 天无限次（ad_bonus_expire 字段）
 * 会员层：9.9元/月，vip_expire 字段控制到期时间
 *
 * 数据库集合：user_quota
 * 文档结构：
 * {
 *   _id: openid,
 *   openid: string,
 *   date: "2024-01-01",        // 当日日期字符串（自然日重置用）
 *   used: number,              // 当日已用次数
 *   vip_expire: number,        // 会员到期时间戳（ms），0=非会员
 *   ad_bonus_expire: number,   // 激励广告奖励到期时间戳（ms）
 *   total_used: number,        // 历史累计调用次数
 *   created_at: number,
 *   updated_at: number
 * }
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const COLLECTION = 'user_quota';
const FREE_DAILY_LIMIT = 5;       // 免费每日配额
const VIP_MONTHLY_PRICE = 9.9;    // 会员月费（元）

// ─── 入口 ────────────────────────────────────────────────
exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return err('无法获取用户标识');

  const { type } = event;

  try {
    switch (type) {
      case 'getStatus':    return await getStatus(OPENID);
      case 'consume':      return await consumeQuota(OPENID);
      case 'adBonus':      return await grantAdBonus(OPENID);
      case 'activateVip':  return await activateVip(OPENID, event.months || 1, event.tradeNo);
      case 'checkVip':     return await checkVip(OPENID);
      default:             return err('未知操作类型: ' + type);
    }
  } catch (e) {
    console.error('[userQuota]', type, e);
    return err('服务异常：' + (e.message || '请稍后重试'));
  }
};

// ─── 获取当前配额状态 ────────────────────────────────────────────────
async function getStatus(openid) {
  const doc = await _getOrCreate(openid);
  const today = _today();
  const now = Date.now();

  // 超过自然日重置当日计数
  const used = (doc.date === today) ? (doc.used || 0) : 0;

  const isVip = doc.vip_expire > now;
  const hasAdBonus = doc.ad_bonus_expire > now;
  const isUnlimited = isVip || hasAdBonus;
  const remaining = isUnlimited ? 999 : Math.max(0, FREE_DAILY_LIMIT - used);
  const canUse = remaining > 0;

  return ok({
    isVip,
    hasAdBonus,
    isUnlimited,
    used,
    remaining,
    canUse,
    freeLimit: FREE_DAILY_LIMIT,
    vipExpire: doc.vip_expire || 0,
    adBonusExpire: doc.ad_bonus_expire || 0,
    totalUsed: doc.total_used || 0,
  });
}

// ─── 消费一次配额（AI调用前调用） ────────────────────────────────────────────────
async function consumeQuota(openid) {
  const doc = await _getOrCreate(openid);
  const today = _today();
  const now = Date.now();

  const isVip = doc.vip_expire > now;
  const hasAdBonus = doc.ad_bonus_expire > now;

  // 会员或激励广告免费，不消耗配额
  if (isVip || hasAdBonus) {
    await _incrementTotal(openid);
    return ok({ consumed: false, isUnlimited: true, remaining: 999 });
  }

  // 跨日重置
  const used = (doc.date === today) ? (doc.used || 0) : 0;

  if (used >= FREE_DAILY_LIMIT) {
    return ok({ consumed: false, isUnlimited: false, remaining: 0, quota_exceeded: true });
  }

  // 消费一次
  const newUsed = used + 1;
  const remaining = FREE_DAILY_LIMIT - newUsed;

  await db.collection(COLLECTION).doc(openid).update({
    data: {
      date: today,
      used: newUsed,
      total_used: _.inc(1),
      updated_at: now
    }
  });

  return ok({ consumed: true, isUnlimited: false, remaining, used: newUsed });
}

// ─── 激励广告奖励：+1 天无限次 ────────────────────────────────────────────────
async function grantAdBonus(openid) {
  const now = Date.now();
  // 若之前有奖励且未过期，在此基础上续24小时；否则从现在起24小时
  const doc = await _getOrCreate(openid);
  const currentExpire = (doc.ad_bonus_expire || 0) > now ? doc.ad_bonus_expire : now;
  const newExpire = currentExpire + 24 * 60 * 60 * 1000; // +24h

  await db.collection(COLLECTION).doc(openid).update({
    data: {
      ad_bonus_expire: newExpire,
      updated_at: now
    }
  });

  return ok({
    ad_bonus_expire: newExpire,
    expireText: _formatExpire(newExpire)
  });
}

// ─── 激活会员 ────────────────────────────────────────────────
async function activateVip(openid, months, tradeNo) {
  const now = Date.now();
  const doc = await _getOrCreate(openid);

  // 若当前是有效会员，在到期时间上续费；否则从现在开始
  const currentExpire = (doc.vip_expire || 0) > now ? doc.vip_expire : now;
  const MS_PER_MONTH = 30 * 24 * 60 * 60 * 1000;
  const newExpire = currentExpire + months * MS_PER_MONTH;

  await db.collection(COLLECTION).doc(openid).update({
    data: {
      vip_expire: newExpire,
      last_trade_no: tradeNo || '',
      updated_at: now
    }
  });

  return ok({
    vip_expire: newExpire,
    expireText: _formatExpire(newExpire),
    months
  });
}

// ─── 检查会员状态（简版，供支付回调使用） ────────────────────────────────────────────────
async function checkVip(openid) {
  const doc = await _getOrCreate(openid);
  const now = Date.now();
  return ok({
    isVip: (doc.vip_expire || 0) > now,
    vip_expire: doc.vip_expire || 0
  });
}

// ─── 工具：获取或创建用户文档 ────────────────────────────────────────────────
async function _getOrCreate(openid) {
  try {
    const res = await db.collection(COLLECTION).doc(openid).get();
    return res.data;
  } catch (e) {
    // 文档不存在，创建
    const now = Date.now();
    const newDoc = {
      _id: openid,
      openid,
      date: _today(),
      used: 0,
      vip_expire: 0,
      ad_bonus_expire: 0,
      total_used: 0,
      created_at: now,
      updated_at: now
    };
    await db.collection(COLLECTION).add({ data: newDoc });
    return newDoc;
  }
}

async function _incrementTotal(openid) {
  try {
    await db.collection(COLLECTION).doc(openid).update({
      data: { total_used: _.inc(1), updated_at: Date.now() }
    });
  } catch (e) { /* ignore */ }
}

function _today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function _formatExpire(ts) {
  const d = new Date(ts);
  return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function ok(data) { return { success: true, ...data }; }
function err(msg) { return { success: false, error: msg }; }
