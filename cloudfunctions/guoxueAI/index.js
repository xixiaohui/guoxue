/**
 * 国学AI助手 - 云函数 guoxueAI v4.0
 *
 * ★ 架构说明 ★
 * AI 模型调用 (wx.cloud.extend.AI) 只能在【小程序端】使用，
 * 云函数端（wx-server-sdk）没有 cloud.extend.AI 接口。
 *
 * 因此本云函数职责单一：
 *   1. 配额检查 & 消费  (checkAndConsume)
 *   2. 激励广告授予     (adBonus)
 *   3. 会员激活         (activateVip)
 *   4. 状态查询         (getStatus)
 *
 * AI 调用在小程序端 utils/ai.js 中通过
 *   wx.cloud.extend.AI.createModel("hunyuan-exp")
 * 直接完成，无需经过云函数。
 *
 * 数据库集合: user_quota
 * 字段:
 *   _id / openid       string   用户标识
 *   date               string   "YYYY-MM-DD" 当日日期
 *   used               number   当日已用次数
 *   vip_expire         number   会员到期时间戳(ms)，0=非会员
 *   ad_bonus_expire    number   广告奖励到期时间戳(ms)
 *   total_used         number   历史累计调用
 *   created_at         number
 *   updated_at         number
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db   = cloud.database();
const _cmd = db.command;

const COLLECTION      = 'user_quota';
const FREE_DAILY_LIMIT = 10;   // 每日免费 AI 调用次数

// ─── 入口 ────────────────────────────────────────────────────
exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return _err('无法获取用户标识，请重新进入小程序');

  const { type } = event;
  if (!type) return _err('缺少操作类型参数');

  console.log(`[guoxueAI-cf] type=${type} uid=${OPENID.slice(0, 8)}`);

  try {
    switch (type) {
      case 'getStatus':        return await getStatus(OPENID);
      case 'checkAndConsume':  return await checkAndConsume(OPENID);
      case 'adBonus':          return await grantAdBonus(OPENID);
      case 'activateVip':      return await activateVip(OPENID, event.months || 1, event.tradeNo);
      case 'checkVip':         return await checkVip(OPENID);
      // 兼容旧版调用（前端可能仍发 consume）
      case 'consume':          return await checkAndConsume(OPENID);
      default:                 return _err('未知操作类型: ' + type);
    }
  } catch (e) {
    console.error('[guoxueAI-cf]', type, e.message || e);
    return _err('服务异常，请稍后重试');
  }
};

// ─── 1. 获取配额状态 ─────────────────────────────────────────
async function getStatus(openid) {
  const doc   = await _getOrCreate(openid);
  const today = _today();
  const now   = Date.now();

  const used       = doc.date === today ? (doc.used || 0) : 0;
  const isVip      = (doc.vip_expire || 0) > now;
  const hasAdBonus = (doc.ad_bonus_expire || 0) > now;
  const isUnlimited = isVip || hasAdBonus;
  const remaining  = isUnlimited ? 999 : Math.max(0, FREE_DAILY_LIMIT - used);

  console.log(`[getStatus] uid=${openid.slice(0,8)} used=${used} vip=${isVip} ad=${hasAdBonus}`);

  return _ok({
    isVip, hasAdBonus, isUnlimited,
    used, remaining,
    canUse:       remaining > 0,
    freeLimit:    FREE_DAILY_LIMIT,
    vipExpire:    doc.vip_expire    || 0,
    adBonusExpire:doc.ad_bonus_expire || 0,
    totalUsed:    doc.total_used    || 0,
  });
}

// ─── 2. 检查并消费一次配额（AI 调用前由小程序端调用） ────────────
async function checkAndConsume(openid) {
  const doc = await _getOrCreate(openid);
  const today = _today();
  const now   = Date.now();

  const isVip      = (doc.vip_expire || 0) > now;
  const hasAdBonus = (doc.ad_bonus_expire || 0) > now;

  // VIP / 广告奖励 → 不消耗配额，仅记录总次数
  if (isVip || hasAdBonus) {
    _updateAsync(openid, { total_used: _cmd.inc(1), updated_at: now });
    return _ok({ consumed: false, isUnlimited: true, remaining: 999, canUse: true });
  }

  // 跨日重置
  const used = doc.date === today ? (doc.used || 0) : 0;

  if (used >= FREE_DAILY_LIMIT) {
    console.log(`[checkAndConsume] exceeded uid=${openid.slice(0,8)} used=${used}`);
    return _ok({
      consumed: false, isUnlimited: false,
      remaining: 0,   canUse: false,
      quota_exceeded: true,
    });
  }

  // 消费一次
  const newUsed   = used + 1;
  const remaining = FREE_DAILY_LIMIT - newUsed;
  await db.collection(COLLECTION).doc(openid).update({
    data: { date: today, used: newUsed, total_used: _cmd.inc(1), updated_at: now }
  });

  console.log(`[checkAndConsume] ok uid=${openid.slice(0,8)} used=${newUsed} left=${remaining}`);
  return _ok({ consumed: true, isUnlimited: false, remaining, canUse: true });
}

// ─── 3. 激励广告奖励 +1天无限 ────────────────────────────────
async function grantAdBonus(openid) {
  const now = Date.now();
  const doc = await _getOrCreate(openid);
  // 若已有奖励且未过期，续期；否则从现在起24h
  const base      = (doc.ad_bonus_expire || 0) > now ? doc.ad_bonus_expire : now;
  const newExpire = base + 24 * 60 * 60 * 1000;

  await db.collection(COLLECTION).doc(openid).update({
    data: { ad_bonus_expire: newExpire, updated_at: now }
  });
  console.log(`[adBonus] uid=${openid.slice(0,8)} expire=${_fmtTs(newExpire)}`);
  return _ok({ ad_bonus_expire: newExpire, expireText: _fmtTs(newExpire) });
}

// ─── 4. 激活会员 ──────────────────────────────────────────────
async function activateVip(openid, months, tradeNo) {
  months = Math.max(1, parseInt(months) || 1);
  const now = Date.now();
  const doc = await _getOrCreate(openid);
  const base      = (doc.vip_expire || 0) > now ? doc.vip_expire : now;
  const newExpire = base + months * 30 * 24 * 60 * 60 * 1000;

  await db.collection(COLLECTION).doc(openid).update({
    data: { vip_expire: newExpire, last_trade_no: tradeNo || '', updated_at: now }
  });
  console.log(`[activateVip] uid=${openid.slice(0,8)} months=${months} expire=${_fmtTs(newExpire)}`);
  return _ok({ vip_expire: newExpire, expireText: _fmtTs(newExpire), months });
}

// ─── 5. 检查会员状态 ──────────────────────────────────────────
async function checkVip(openid) {
  const doc = await _getOrCreate(openid);
  const now = Date.now();
  return _ok({ isVip: (doc.vip_expire || 0) > now, vip_expire: doc.vip_expire || 0 });
}

// ─── 工具：获取或创建用户文档 ────────────────────────────────
async function _getOrCreate(openid) {
  try {
    const res = await db.collection(COLLECTION).doc(openid).get();
    return res.data;
  } catch (e) {
    const now    = Date.now();
    const newDoc = {
      _id: openid, openid,
      date: _today(), used: 0,
      vip_expire: 0, ad_bonus_expire: 0,
      total_used: 0, created_at: now, updated_at: now
    };
    try {
      await db.collection(COLLECTION).add({ data: newDoc });
      console.log(`[_getOrCreate] new user uid=${openid.slice(0,8)}`);
    } catch (addErr) {
      // 并发冲突：尝试重新读取
      console.warn('[_getOrCreate] add conflict, re-fetch:', addErr.message);
      try {
        const retry = await db.collection(COLLECTION).doc(openid).get();
        return retry.data;
      } catch (_) { /* 最终兜底 */ }
    }
    return newDoc;
  }
}

// 异步更新（不阻塞响应，失败静默）
function _updateAsync(openid, data) {
  db.collection(COLLECTION).doc(openid).update({ data })
    .catch(e => console.warn('[_updateAsync] failed:', e.message));
}

function _today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function _fmtTs(ts) {
  const d = new Date(ts);
  return `${d.getMonth()+1}月${d.getDate()}日 ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

function _ok(data)  { return { success: true,  ...data }; }
function _err(msg)  { return { success: false, error: msg }; }
