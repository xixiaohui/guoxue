/**
 * userQuota 云函数 - 用户配额管理
 *
 * 免费层：每天 FREE_DAILY_LIMIT 次 AI 调用（按自然日重置，当前10次）
 * 广告层：看完激励视频 +1 天无限次（ad_bonus_expire 字段）
 *
 * 数据库集合：user_quota
 * 文档结构：
 * {
 *   _id: openid,
 *   openid: string,
 *   date: "2024-01-01",        // 当日日期字符串（自然日重置用）
 *   used: number,              // 当日已用次数
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
const FREE_DAILY_LIMIT = 10;      // 免费每日配额（10次/天）

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
  console.log(`[userQuota] getStatus openid=${openid.slice(0,8)} date=${doc.date} today=${today} used=${doc.used}`);

  // 超过自然日重置当日计数
  const used = (doc.date === today) ? (doc.used || 0) : 0;

  const hasAdBonus = doc.ad_bonus_expire > now;
  const isUnlimited = hasAdBonus;
  const remaining = isUnlimited ? 999 : Math.max(0, FREE_DAILY_LIMIT - used);
  const canUse = remaining > 0;

  return ok({
    hasAdBonus,
    isUnlimited,
    used,
    remaining,
    canUse,
    freeLimit: FREE_DAILY_LIMIT,
    adBonusExpire: doc.ad_bonus_expire || 0,
    totalUsed: doc.total_used || 0,
  });
}

// ─── 消费一次配额（AI调用前调用） ────────────────────────────────────────────────
async function consumeQuota(openid) {
  const doc = await _getOrCreate(openid);
  const today = _today();
  const now = Date.now();
  console.log(`[userQuota] consume openid=${openid.slice(0,8)} ad_bonus=${doc.ad_bonus_expire}`);

  const hasAdBonus = doc.ad_bonus_expire > now;

  // 激励广告免费，不消耗配额
  if (hasAdBonus) {
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

// ─── 工具：获取或创建用户文档 ────────────────────────────────────────────────
async function _getOrCreate(openid) {
  try {
    const res = await db.collection(COLLECTION).doc(openid).get();
    return res.data;
  } catch (e) {
    // 文档不存在，创建新用户记录
    const now = Date.now();
    const newDoc = {
      _id: openid,
      openid,
      date: _today(),
      used: 0,
      ad_bonus_expire: 0,
      total_used: 0,
      created_at: now,
      updated_at: now
    };
    try {
      await db.collection(COLLECTION).add({ data: newDoc });
      console.log(`[userQuota] created new user doc for ${openid.slice(0,8)}`);
    } catch (addErr) {
      // 并发创建时可能冲突，忽略并重新读取
      console.warn('[userQuota] add conflict, re-fetching:', addErr.message);
      try {
        const retry = await db.collection(COLLECTION).doc(openid).get();
        return retry.data;
      } catch (retryErr) {
        return newDoc; // 最终降级返回内存中的默认对象
      }
    }
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
