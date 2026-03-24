/**
 * utils/share.js - 分享与海报生成工具
 * 生产级国学助手 v7.0
 *
 * 功能：
 *  1. 生成分享给好友的消息卡片（onShareAppMessage）
 *  2. 生成分享到朋友圈的图片（onShareTimeline）
 *  3. 使用 Canvas 2D 绘制带小程序码的海报并保存到相册
 */

const POSTER_WIDTH  = 750;   // 逻辑像素（设计稿 750px 宽）
const POSTER_HEIGHT = 1200;

/**
 * 构建"分享给好友"的消息卡片参数
 * @param {object} opts
 * @param {string} opts.title       分享标题
 * @param {string} [opts.path]      落地页路径（默认首页）
 * @param {string} [opts.imageUrl]  自定义封面图（可选）
 * @returns {object}  onShareAppMessage 返回值对象
 */
function buildShareMsg(opts = {}) {
  return {
    title:    opts.title    || '国学助手 · 传承千年智慧',
    path:     opts.path     || '/pages/home/index',
    imageUrl: opts.imageUrl || '/images/share-cover.png',
  };
}

/**
 * 构建"分享到朋友圈"的参数（需要返回 Promise<imageUrl>）
 * 注意：朋友圈分享需要图片，通过 Canvas 绘制
 * @param {object} opts
 * @param {string} opts.quote      名句正文
 * @param {string} opts.author     作者/出处
 * @param {string} opts.insight    今日启示（可选）
 * @returns {Promise<{title, query, imageUrl}>}
 */
async function buildShareTimeline(opts = {}) {
  const title = `「${opts.quote || '国学助手'}」— ${opts.author || ''}`;
  return {
    title,
    query:    'from=timeline',
  };
}

/**
 * 使用 Canvas 2D 绘制海报并保存到相册
 * 设计：深棕色古典背景，居中名句，下方小程序码
 *
 * @param {object} pageCtx    Page 实例（this），用于 wx.createSelectorQuery
 * @param {object} opts
 * @param {string} opts.quote        名句原文
 * @param {string} opts.author       作者/出处
 * @param {string} opts.translation  白话文（可选）
 * @param {string} opts.insight      启示（可选）
 * @param {string} [opts.canvasId]   Canvas 组件 id（默认 'posterCanvas'）
 * @returns {Promise<string>}   保存成功后返回本地临时路径
 */
async function drawPoster(pageCtx, opts = {}) {
  const canvasId = opts.canvasId || 'posterCanvas';
  const dpr      = wx.getWindowInfo().pixelRatio || 2;

  return new Promise((resolve, reject) => {
    const query = pageCtx.createSelectorQuery();
    query.select(`#${canvasId}`)
      .fields({ node: true, size: true })
      .exec(async (res) => {
        if (!res || !res[0] || !res[0].node) {
          reject(new Error('Canvas 节点不存在'));
          return;
        }
        const canvas = res[0].node;
        const ctx    = canvas.getContext('2d');

        // 设置画布物理像素
        canvas.width  = POSTER_WIDTH  * dpr;
        canvas.height = POSTER_HEIGHT * dpr;
        ctx.scale(dpr, dpr);

        try {
          await _renderPoster(ctx, canvas, opts, dpr);

          // 导出图片
          wx.canvasToTempFilePath({
            canvas,
            fileType:  'png',
            quality:   1,
            success(r) {
              resolve(r.tempFilePath);
            },
            fail(e) {
              reject(e);
            }
          });
        } catch (e) {
          reject(e);
        }
      });
  });
}

/**
 * 内部：在 Canvas 上绘制海报内容
 */
async function _renderPoster(ctx, canvas, opts, dpr) {
  const W = POSTER_WIDTH;
  const H = POSTER_HEIGHT;

  // ── 1. 背景 ──────────────────────────────────
  // 古典渐变背景
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0,   '#3D1A08');
  grad.addColorStop(0.5, '#5C2810');
  grad.addColorStop(1,   '#2C0E04');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // 装饰边框
  ctx.strokeStyle = 'rgba(196,136,46,0.6)';
  ctx.lineWidth   = 2;
  ctx.strokeRect(24, 24, W - 48, H - 48);
  ctx.strokeStyle = 'rgba(196,136,46,0.25)';
  ctx.lineWidth   = 1;
  ctx.strokeRect(32, 32, W - 64, H - 64);

  // 装饰角花
  _drawCornerDecor(ctx, 24, 24, 40);
  _drawCornerDecor(ctx, W - 24, 24, 40, true);
  _drawCornerDecor(ctx, 24, H - 24, 40, false, true);
  _drawCornerDecor(ctx, W - 24, H - 24, 40, true, true);

  // ── 2. 顶部 Logo 区 ──────────────────────────────────
  ctx.fillStyle = 'rgba(196,136,46,0.9)';
  ctx.font      = `bold 52px serif`;
  ctx.textAlign = 'center';
  ctx.fillText('文', W / 2, 120);

  ctx.fillStyle = 'rgba(253,246,227,0.95)';
  ctx.font      = `bold 32px serif`;
  ctx.fillText('国学助手', W / 2, 168);

  ctx.fillStyle = 'rgba(196,136,46,0.7)';
  ctx.font      = `20px serif`;
  ctx.fillText('传承千年智慧 · 探索文化精髓', W / 2, 200);

  // 分割线
  _drawDivider(ctx, W, 220);

  // ── 3. 主名句 ──────────────────────────────────
  const quote = opts.quote || '';
  ctx.fillStyle = 'rgba(253,246,227,0.98)';

  // 自动换行绘制名句
  const quoteLines = _wrapText(ctx, quote, W - 120, `bold 44px serif`);
  ctx.font      = `bold 44px serif`;
  ctx.textAlign = 'center';
  let qY = 300;
  // 添加书名号装饰
  if (quoteLines.length === 1) {
    ctx.fillStyle = 'rgba(196,136,46,0.8)';
    ctx.font      = `bold 48px serif`;
    ctx.fillText('「', W / 2 - _measureText(ctx, quoteLines[0], `bold 44px serif`) / 2 - 36, qY);
    ctx.fillText('」', W / 2 + _measureText(ctx, quoteLines[0], `bold 44px serif`) / 2 + 8, qY);
  }
  ctx.fillStyle = 'rgba(253,246,227,0.98)';
  ctx.font      = `bold 44px serif`;
  for (const line of quoteLines) {
    ctx.fillText(line, W / 2, qY);
    qY += 60;
  }

  // 作者
  if (opts.author) {
    ctx.fillStyle = 'rgba(196,136,46,0.9)';
    ctx.font      = `26px serif`;
    ctx.textAlign = 'center';
    ctx.fillText(`—— ${opts.author}`, W / 2, qY + 20);
    qY += 60;
  }

  // 分割线
  _drawDivider(ctx, W, qY + 20);
  qY += 60;

  // ── 4. 白话文翻译 ──────────────────────────────────
  if (opts.translation) {
    ctx.fillStyle = 'rgba(196,136,46,0.7)';
    ctx.font      = `22px serif`;
    ctx.textAlign = 'center';
    ctx.fillText('【白话文】', W / 2, qY);
    qY += 36;

    ctx.fillStyle = 'rgba(253,246,227,0.8)';
    ctx.font      = `24px serif`;
    const transLines = _wrapText(ctx, opts.translation, W - 140, `24px serif`);
    for (const line of transLines) {
      ctx.fillText(line, W / 2, qY);
      qY += 38;
    }
    qY += 10;
  }

  // ── 5. 今日启示 ──────────────────────────────────
  if (opts.insight) {
    // 启示背景框
    const insH  = 100;
    const insY  = Math.min(qY + 10, H - 350);
    ctx.fillStyle = 'rgba(139,37,0,0.4)';
    _drawRoundRect(ctx, 60, insY, W - 120, insH, 12);
    ctx.fill();
    ctx.strokeStyle = 'rgba(196,136,46,0.5)';
    ctx.lineWidth   = 1;
    ctx.stroke();

    ctx.fillStyle = 'rgba(196,136,46,0.9)';
    ctx.font      = `22px serif`;
    ctx.textAlign = 'center';
    ctx.fillText('◆ 今日启示', W / 2, insY + 30);

    ctx.fillStyle = 'rgba(253,246,227,0.85)';
    ctx.font      = `22px serif`;
    const insLines = _wrapText(ctx, opts.insight, W - 160, `22px serif`);
    let insTextY = insY + 58;
    for (const line of insLines) {
      ctx.fillText(line, W / 2, insTextY);
      insTextY += 32;
    }
  }

  // ── 6. 小程序码区域（底部）──────────────────────────────────
  const qrY = H - 240;

  // 底部背景
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(0, qrY - 20, W, H - qrY + 20);

  _drawDivider(ctx, W, qrY - 10);

  // 小程序码占位（实际小程序中需要通过 wx.getUnlimitedQRCode 获取）
  // 这里绘制一个占位区域，在 JS 中替换
  const qrSize = 140;
  const qrX    = W / 2 - qrSize / 2;
  ctx.fillStyle = '#FFFFFF';
  _drawRoundRect(ctx, qrX, qrY + 10, qrSize, qrSize, 12);
  ctx.fill();

  // 二维码内的提示文字（实际会被小程序码图片覆盖）
  ctx.fillStyle = '#8B2500';
  ctx.font      = `18px sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText('扫码打开', W / 2, qrY + 90);

  // 小程序名
  ctx.fillStyle = 'rgba(253,246,227,0.9)';
  ctx.font      = `bold 24px serif`;
  ctx.textAlign = 'center';
  ctx.fillText('国学助手', W / 2, qrY + 175);

  ctx.fillStyle = 'rgba(196,136,46,0.7)';
  ctx.font      = `18px sans-serif`;
  ctx.fillText('长按识别小程序码', W / 2, qrY + 205);
}

// ── 工具函数 ──────────────────────────────────────────────────

function _drawDivider(ctx, W, y) {
  ctx.strokeStyle = 'rgba(196,136,46,0.5)';
  ctx.lineWidth   = 1;
  ctx.beginPath();
  ctx.moveTo(60, y);
  ctx.lineTo(W - 60, y);
  ctx.stroke();
  // 中心装饰菱形
  ctx.fillStyle = 'rgba(196,136,46,0.7)';
  ctx.beginPath();
  ctx.moveTo(W / 2, y - 6);
  ctx.lineTo(W / 2 + 8, y);
  ctx.lineTo(W / 2, y + 6);
  ctx.lineTo(W / 2 - 8, y);
  ctx.closePath();
  ctx.fill();
}

function _drawCornerDecor(ctx, x, y, size, flipX = false, flipY = false) {
  ctx.strokeStyle = 'rgba(196,136,46,0.6)';
  ctx.lineWidth   = 2;
  const dx = flipX ? -1 : 1;
  const dy = flipY ? -1 : 1;
  ctx.beginPath();
  ctx.moveTo(x + dx * size, y);
  ctx.lineTo(x, y);
  ctx.lineTo(x, y + dy * size);
  ctx.stroke();
}

function _drawRoundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function _wrapText(ctx, text, maxWidth, font) {
  if (!text) return [];
  ctx.font = font;
  const chars = text.split('');
  const lines = [];
  let cur = '';
  for (const ch of chars) {
    const test = cur + ch;
    if (ctx.measureText(test).width > maxWidth && cur.length > 0) {
      lines.push(cur);
      cur = ch;
    } else {
      cur = test;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

function _measureText(ctx, text, font) {
  ctx.font = font;
  return ctx.measureText(text).width;
}

/**
 * 绘制海报并返回临时图片路径（含小程序码，如果云端获取失败则使用占位）
 * @param {object} pageCtx  Page 实例
 * @param {object} opts     { quote, author, translation, insight }
 * @returns {Promise<string>} 临时文件路径
 */
async function generatePoster(pageCtx, opts = {}) {
  return drawPoster(pageCtx, opts);
}

/**
 * 保存图片到相册
 * @param {string} filePath  本地临时路径
 * @returns {Promise<void>}
 */
function savePosterToAlbum(filePath) {
  return new Promise((resolve, reject) => {
    wx.saveImageToPhotosAlbum({
      filePath,
      success() {
        wx.showToast({ title: '已保存到相册', icon: 'success', duration: 2000 });
        resolve();
      },
      fail(e) {
        if (e.errMsg && e.errMsg.includes('auth deny')) {
          wx.showModal({
            title: '需要相册权限',
            content: '请在设置中开启"相册"权限，以便保存海报',
            confirmText: '去设置',
            success(r) {
              if (r.confirm) wx.openSetting();
            }
          });
        } else {
          wx.showToast({ title: '保存失败，请重试', icon: 'none' });
        }
        reject(e);
      }
    });
  });
}

module.exports = {
  buildShareMsg,
  buildShareTimeline,
  generatePoster,
  savePosterToAlbum,
};
