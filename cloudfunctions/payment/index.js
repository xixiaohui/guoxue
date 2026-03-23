/**
 * payment 云函数 - 微信支付（云调用）
 *
 * 功能：
 * 1. createOrder   - 创建支付订单（9.9元/月会员）
 * 2. queryOrder    - 查询订单状态
 * 3. payCallback   - 支付成功回调（激活会员）
 *
 * 使用微信云托管云调用能力，无需商户号直接配置
 * 文档：https://developers.weixin.qq.com/miniprogram/dev/wxcloud/guide/wechatpay/wechatpay.html
 *
 * 数据库集合：orders
 * 文档结构：
 * {
 *   _id: trade_no,
 *   openid,
 *   product: 'vip_1month',
 *   amount: 990,          // 单位：分
 *   months: 1,
 *   status: 'pending' | 'paid' | 'refunded',
 *   trade_no,
 *   wx_trade_no,          // 微信支付订单号
 *   created_at,
 *   paid_at
 * }
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

// 商品定义
const PRODUCTS = {
  vip_1month: { name: '国学AI助手会员·1个月', price: 990, months: 1 },   // 单位分
  vip_3month: { name: '国学AI助手会员·3个月', price: 2490, months: 3 },  // 8.3元/月
  vip_12month: { name: '国学AI助手会员·12个月', price: 7900, months: 12 } // 6.58元/月
};

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return err('用户未登录');

  const { type } = event;

  try {
    switch (type) {
      case 'createOrder': return await createOrder(OPENID, event.product || 'vip_1month');
      case 'queryOrder':  return await queryOrder(OPENID, event.tradeNo);
      case 'getProducts': return ok({ products: PRODUCTS });
      default: return err('未知操作: ' + type);
    }
  } catch (e) {
    console.error('[payment]', type, e);
    return err(e.message || '支付服务异常，请稍后重试');
  }
};

// ─── 创建支付订单 ────────────────────────────────────────────────
async function createOrder(openid, productId) {
  const product = PRODUCTS[productId];
  if (!product) return err('商品不存在');

  const tradeNo = `GX${Date.now()}${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;
  const now = Date.now();

  // 写入订单（待支付）
  await db.collection('orders').add({
    data: {
      _id: tradeNo,
      openid,
      product: productId,
      amount: product.price,
      months: product.months,
      status: 'pending',
      trade_no: tradeNo,
      wx_trade_no: '',
      created_at: now,
      paid_at: 0
    }
  });

  // 调用微信云调用统一下单
  try {
    const payResult = await cloud.cloudPay.unifiedOrder({
      body: product.name,
      outTradeNo: tradeNo,
      spbillCreateIp: '127.0.0.1',
      subMchId: '',                    // 填入你的子商户ID（若有）
      totalFee: product.price,
      envId: cloud.DYNAMIC_CURRENT_ENV,
      functionName: 'payment',         // 支付成功回调此云函数
      nonceStr: _randomStr(16),
      tradeType: 'JSAPI',
      openid
    });

    if (payResult.resultCode !== 'SUCCESS') {
      return err(`下单失败：${payResult.errCodeDes || payResult.returnMsg}`);
    }

    return ok({
      tradeNo,
      payment: payResult.payment,    // 前端 wx.requestPayment 所需参数
      productName: product.name,
      amount: product.price,
      months: product.months
    });
  } catch (e) {
    // 若未配置商户号，返回演示模式
    console.warn('[payment] cloudPay.unifiedOrder failed (可能未配置商户号):', e.message);
    return ok({
      tradeNo,
      payment: null,
      demo: true,
      message: '请在微信商户平台配置支付参数',
      productName: product.name,
      amount: product.price,
      months: product.months
    });
  }
}

// ─── 查询订单（前端轮询使用） ────────────────────────────────────────────────
async function queryOrder(openid, tradeNo) {
  if (!tradeNo) return err('订单号不能为空');

  const res = await db.collection('orders').doc(tradeNo).get().catch(() => null);
  if (!res || !res.data) return err('订单不存在');

  const order = res.data;
  if (order.openid !== openid) return err('无权查询此订单');

  return ok({
    status: order.status,
    paid: order.status === 'paid',
    months: order.months,
    paidAt: order.paid_at
  });
}

// ─── 支付回调（微信云调用自动触发） ────────────────────────────────────────────────
// 注意：此函数由微信云调用直接调用，event 结构由微信定义
exports.payCallback = async (event) => {
  const { tradeNo, resultCode, openid } = event;
  if (resultCode !== 'SUCCESS') {
    console.log('[payment] callback failed:', event);
    return;
  }

  const now = Date.now();

  // 更新订单状态
  await db.collection('orders').doc(tradeNo).update({
    data: {
      status: 'paid',
      wx_trade_no: event.transactionId || '',
      paid_at: now
    }
  });

  // 激活会员（调用 userQuota 云函数）
  try {
    const order = await db.collection('orders').doc(tradeNo).get();
    const months = order.data.months || 1;
    await cloud.callFunction({
      name: 'userQuota',
      data: { type: 'activateVip', months, tradeNo }
    });
    console.log(`[payment] VIP activated for ${openid}, months: ${months}`);
  } catch (e) {
    console.error('[payment] activateVip failed:', e);
  }
};

// ─── 工具函数 ────────────────────────────────────────────────
function _randomStr(len) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < len; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function ok(data) { return { success: true, ...data }; }
function err(msg) { return { success: false, error: msg }; }
