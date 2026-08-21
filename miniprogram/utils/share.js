/**
 * utils/share.js - 分享与海报生成工具
 * 新中式高级版 v8.0
 *
 * 功能：
 *  1. 生成分享给好友的消息卡片（onShareAppMessage）
 *  2. 生成分享到朋友圈的参数（onShareTimeline）
 *  3. 使用 Canvas 2D 绘制高颜值国学海报
 *  4. 保存海报到相册
 *
 * 使用说明：
 *  - 页面需放置 <canvas type="2d" id="posterCanvas"></canvas>
 *  - 默认二维码占位图：/images/mini.png
 *  - 默认分享封面图：/images/share-cover.png
 */

const POSTER_WIDTH = 750;   // 逻辑像素
const POSTER_HEIGHT = 1200;

// 微信 Canvas 物理像素高度上限（超限会抛 "set height out of range"）
const CANVAS_MAX_HEIGHT = 16384;
// 诗词海报正文最大行数（超出后省略，防止高度越界）
const MAX_CONTENT_LINES = 120;

/**
 * 构建"分享给好友"的消息卡片参数
 * @param {object} opts
 * @param {string} opts.title       分享标题
 * @param {string} [opts.path]      落地页路径
 * @param {string} [opts.imageUrl]  自定义封面图
 * @returns {object}
 */
function buildShareMsg(opts = {}) {
  return {
    title: opts.title || '国文之学 · 传承千年智慧',
    path: opts.path || '/pages/home/index',
    imageUrl: opts.imageUrl || '/images/share-cover.png',
  };
}

/**
 * 构建"分享到朋友圈"的参数
 * 注意：
 *  - 如果需要带海报图，请先调用 generatePoster() 生成本地图片路径
 *  - 然后将该路径作为 imageUrl 传入
 *
 * @param {object} opts
 * @param {string} [opts.quote]
 * @param {string} [opts.author]
 * @param {string} [opts.imageUrl]
 * @param {string} [opts.query]
 * @returns {object}
 */
function buildShareTimeline(opts = {}) {
  const quote = opts.quote || '国文之学';
  const author = opts.author ? ` — ${opts.author}` : '';

  return {
    title: `「${quote}」${author}`,
    query: opts.query || 'from=timeline',
    imageUrl: opts.imageUrl || '',
  };
}

/**
 * 一步生成朋友圈分享参数（先画海报，再返回 imageUrl）
 * @param {object} pageCtx
 * @param {object} opts
 * @returns {Promise<{title:string, query:string, imageUrl:string}>}
 */
async function generateTimelineShare(pageCtx, opts = {}) {
  const imageUrl = await generatePoster(pageCtx, opts);
  return buildShareTimeline({
    ...opts,
    imageUrl,
    query: opts.query || 'from=timeline',
  });
}

/**
 * 绘制海报并返回临时图片路径
 * @param {object} pageCtx  Page 实例（this）
 * @param {object} opts
 * @param {string} opts.quote
 * @param {string} opts.author
 * @param {string} [opts.translation]
 * @param {string} [opts.insight]
 * @param {string} [opts.canvasId]
 * @param {string} [opts.qrImageUrl]   小程序码/二维码图片地址（可选，默认 /images/mini.png）
 * @param {string} [opts.brandName]    顶部品牌名
 * @param {string} [opts.brandSlogan]  顶部品牌副标题
 * @param {string} [opts.brandMark]    顶部圆徽章文字，默认“文”
 * @returns {Promise<string>}
 */
async function generatePoster(pageCtx, opts = {}) {
  return drawPoster(pageCtx, opts);
}

/**
 * 使用 Canvas 2D 绘制海报
 * @param {object} pageCtx
 * @param {object} opts
 * @returns {Promise<string>}
 */
async function drawPoster(pageCtx, opts = {}) {
  const canvasId = opts.canvasId || 'posterCanvas';
  const dpr = (wx.getWindowInfo && wx.getWindowInfo().pixelRatio) || 2;

  return new Promise((resolve, reject) => {
    const query = _createQuery(pageCtx);

    query
      .select(`#${canvasId}`)
      .fields({ node: true, size: true })
      .exec(async (res) => {
        if (!res || !res[0] || !res[0].node) {
          reject(new Error(`Canvas 节点不存在：#${canvasId}`));
          return;
        }

        const canvas = res[0].node;
        const ctx = canvas.getContext('2d');

        canvas.width = POSTER_WIDTH * dpr;
        canvas.height = POSTER_HEIGHT * dpr;
        ctx.scale(dpr, dpr);

        try {
          await _renderPoster(ctx, canvas, opts);

          // 给绘制管线一点缓冲，避免导出时图片资源尚未提交
          setTimeout(() => {
            wx.canvasToTempFilePath({
              canvas,
              fileType: 'png',
              quality: 1,
              success(r) {
                resolve(r.tempFilePath);
              },
              fail(e) {
                reject(e);
              },
            });
          }, 80);
        } catch (e) {
          reject(e);
        }
      });
  });
}

/**
 * 内部：绘制海报主体
 */
async function _renderPoster(ctx, canvas, opts = {}) {
  const W = POSTER_WIDTH;
  const H = POSTER_HEIGHT;

  const quote = (opts.quote || '知之者不如好之者，好之者不如乐之者').trim();
  const author = (opts.author || '《论语》').trim();
  const translation = (opts.translation || '').trim();
  const insight = (opts.insight || '').trim();

  const brandName = opts.brandName || '国文之学';
  const brandSlogan = opts.brandSlogan || '传承千年智慧 · 让经典更易懂';
  const brandMark = opts.brandMark || '文';
  const qrImageUrl = opts.qrImageUrl || '/images/mini.png';

  ctx.clearRect(0, 0, W, H);

  // ========== 1. 背景 ==========
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#1F130D');
  bg.addColorStop(0.36, '#3A2218');
  bg.addColorStop(0.72, '#2B180F');
  bg.addColorStop(1, '#160C08');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  const topGlow = ctx.createRadialGradient(W / 2, 130, 10, W / 2, 130, 340);
  topGlow.addColorStop(0, 'rgba(233,196,106,0.24)');
  topGlow.addColorStop(0.45, 'rgba(233,196,106,0.10)');
  topGlow.addColorStop(1, 'rgba(233,196,106,0)');
  ctx.fillStyle = topGlow;
  ctx.fillRect(0, 0, W, 360);

  const bottomGlow = ctx.createRadialGradient(W / 2, H - 120, 20, W / 2, H - 120, 280);
  bottomGlow.addColorStop(0, 'rgba(201,141,61,0.14)');
  bottomGlow.addColorStop(1, 'rgba(201,141,61,0)');
  ctx.fillStyle = bottomGlow;
  ctx.fillRect(0, H - 360, W, 360);

  _drawFlowLines(ctx, W, H);

  ctx.save();
  ctx.strokeStyle = 'rgba(216,177,91,0.24)';
  ctx.lineWidth = 1.2;
  _drawRoundRect(ctx, 20, 20, W - 40, H - 40, 24);
  ctx.stroke();
  ctx.restore();

  // ========== 2. 顶部品牌区 ==========
  _drawTopBrand(ctx, W, {
    brandName,
    brandSlogan,
    brandMark,
  });

  // ========== 3. 主名句卡 ==========
  const cardX = 46;
  const cardW = W - 92;
  const quoteCardY = 220;

  const quoteFont = 'bold 42px serif';
  let quoteLines = _wrapText(ctx, quote, cardW - 116, quoteFont);
  quoteLines = _limitLines(ctx, quoteLines, 3, cardW - 116, quoteFont);

  const quoteLineHeight = 56;
  const authorH = author ? 42 : 0;
  const quoteCardH = 122 + quoteLines.length * quoteLineHeight + authorH;

  _drawPaperCard(ctx, cardX, quoteCardY, cardW, quoteCardH, 28);
  _drawTag(ctx, cardX + cardW / 2, quoteCardY + 34, '每日国学');

  // 装饰引号
  ctx.save();
  ctx.fillStyle = 'rgba(194,147,62,0.20)';
  ctx.font = 'bold 108px serif';
  ctx.textAlign = 'left';
  ctx.fillText('“', cardX + 32, quoteCardY + 106);
  ctx.textAlign = 'right';
  ctx.fillText('”', cardX + cardW - 32, quoteCardY + quoteCardH - 26);
  ctx.restore();

  // 主名句
  ctx.save();
  ctx.fillStyle = '#2A1A12';
  ctx.font = quoteFont;
  ctx.textAlign = 'center';

  let qY = quoteCardY + 92;
  quoteLines.forEach((line) => {
    ctx.fillText(line, W / 2, qY);
    qY += quoteLineHeight;
  });

  if (author) {
    ctx.fillStyle = '#8C6239';
    ctx.font = '26px serif';
    ctx.fillText(`—— ${author}`, W / 2, qY + 6);
  }
  ctx.restore();

  let currentY = quoteCardY + quoteCardH + 22;

  // 为避免内容区域顶到二维码卡片，根据卡片数量限制行数
  const hasTranslation = !!translation;
  const hasInsight = !!insight;
  const transMaxLines = hasInsight ? 2 : 4;
  const insightMaxLines = hasTranslation ? 2 : 4;

  // ========== 4. 白话文卡 ==========
  if (hasTranslation) {
    let transLines = _wrapText(ctx, translation, cardW - 72, '22px sans-serif');
    transLines = _limitLines(ctx, transLines, transMaxLines, cardW - 72, '22px sans-serif');

    const transH = 66 + transLines.length * 32 + 20;

    _drawGlassCard(ctx, cardX, currentY, cardW, transH, 24);
    _drawSectionLabel(ctx, cardX + 28, currentY + 34, '白话文');

    ctx.save();
    ctx.fillStyle = 'rgba(248,238,215,0.92)';
    ctx.font = '22px sans-serif';
    ctx.textAlign = 'left';

    let y = currentY + 74;
    transLines.forEach((line) => {
      ctx.fillText(line, cardX + 28, y);
      y += 32;
    });
    ctx.restore();

    currentY += transH + 16;
  }

  // ========== 5. 今日启示卡 ==========
  if (hasInsight) {
    let insLines = _wrapText(ctx, insight, cardW - 72, '22px sans-serif');
    insLines = _limitLines(ctx, insLines, insightMaxLines, cardW - 72, '22px sans-serif');

    const insH = 66 + insLines.length * 32 + 20;

    _drawInsightCard(ctx, cardX, currentY, cardW, insH, 24);
    _drawSectionLabel(ctx, cardX + 28, currentY + 34, '今日启示');

    ctx.save();
    ctx.fillStyle = 'rgba(255,247,233,0.94)';
    ctx.font = '22px sans-serif';
    ctx.textAlign = 'left';

    let y = currentY + 74;
    insLines.forEach((line) => {
      ctx.fillText(line, cardX + 28, y);
      y += 32;
    });
    ctx.restore();

    currentY += insH + 18;
  }

  // ========== 6. 底部二维码卡 ==========
  const qrCardH = 220;
  const qrCardY = H - qrCardH - 44;

  _drawBottomPanel(ctx, cardX, qrCardY, cardW, qrCardH, 28);

  const qrSize = 148;
  const qrX = cardX + 34;
  const qrY = qrCardY + 36;

  // 二维码底板
  ctx.save();
  ctx.fillStyle = '#FFFFFF';
  _drawRoundRect(ctx, qrX, qrY, qrSize, qrSize, 20);
  ctx.fill();
  ctx.restore();

  // 绘制二维码图片
  const qrOk = await _safeDrawImage(canvas, ctx, qrImageUrl, qrX + 10, qrY + 10, qrSize - 20, qrSize - 20);
  if (!qrOk) {
    ctx.save();
    ctx.fillStyle = '#8B5A2B';
    ctx.font = '18px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('小程序码', qrX + qrSize / 2, qrY + qrSize / 2 + 6);
    ctx.restore();
  }

  // 右侧内容
  const infoX = qrX + qrSize + 34;

  ctx.save();
  ctx.textAlign = 'left';

  ctx.fillStyle = '#F8ECD0';
  ctx.font = 'bold 34px serif';
  ctx.fillText(brandName, infoX, qrY + 38);

  ctx.fillStyle = 'rgba(233,215,180,0.88)';
  ctx.font = '22px sans-serif';
  ctx.fillText('每日经典 · 古文翻译 · 智能释义', infoX, qrY + 80);

  ctx.fillStyle = 'rgba(216,177,91,0.95)';
  ctx.font = '24px sans-serif';
  ctx.fillText('长按识别小程序码', infoX, qrY + 124);

  const btnW = 180;
  const btnH = 44;
  const btnY = qrY + 146;

  const btnGrad = ctx.createLinearGradient(infoX, btnY, infoX + btnW, btnY);
  btnGrad.addColorStop(0, '#D9A441');
  btnGrad.addColorStop(1, '#F2CC7B');
  ctx.fillStyle = btnGrad;
  _drawRoundRect(ctx, infoX, btnY, btnW, btnH, 22);
  ctx.fill();

  ctx.fillStyle = '#3C210F';
  ctx.font = 'bold 22px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('立即体验', infoX + btnW / 2, btnY + 29);

  ctx.restore();
}

/**
 * 生成「诗词海报」—— 完整展示诗词正文，海报高度随内容自适应（不截断）
 * @param {object} pageCtx  Page 实例（this）
 * @param {object} opts
 * @param {string} opts.title     诗题
 * @param {string} [opts.author]  作者
 * @param {string} [opts.dynasty] 朝代
 * @param {string} [opts.type]    体裁
 * @param {string} opts.content   诗词正文（多行以 \n 分隔）
 * @param {string} [opts.canvasId]   默认 posterCanvas
 * @param {string} [opts.qrImageUrl] 小程序码/二维码（默认 /images/mini.png）
 * @returns {Promise<string>} 海报临时文件路径
 */
async function generatePoemPoster(pageCtx, opts = {}) {
  const canvasId = opts.canvasId || 'posterCanvas';
  const dpr = (wx.getWindowInfo && wx.getWindowInfo().pixelRatio) || 2;
  const query = _createQuery(pageCtx);

  return new Promise((resolve, reject) => {
    query
      .select(`#${canvasId}`)
      .fields({ node: true, size: true })
      .exec(async (res) => {
        if (!res || !res[0] || !res[0].node) {
          reject(new Error(`Canvas 节点不存在：#${canvasId}`));
          return;
        }

        const canvas = res[0].node;
        const ctx = canvas.getContext('2d');

        // 先用正文换行数估算海报高度（完整展示不截断）
        let layout = _measurePoemLayout(ctx, opts);

        // 高度越界保护：Canvas 物理高度上限 16384，超出时二分收缩正文行数
        const maxLogicalH = Math.floor(CANVAS_MAX_HEIGHT / dpr) - 8;
        if (layout.height > maxLogicalH) {
          let lo = 1;
          let hi = layout.lines.length;
          let best = 1;
          while (lo <= hi) {
            const mid = (lo + hi) >> 1;
            const candidate = _measurePoemLayout(ctx, Object.assign({}, opts, { maxLines: mid }));
            if (candidate.height <= maxLogicalH) {
              best = mid;
              lo = mid + 1;
            } else {
              hi = mid - 1;
            }
          }
          layout = _measurePoemLayout(ctx, Object.assign({}, opts, { maxLines: best }));
        }

        canvas.width = POSTER_WIDTH * dpr;
        canvas.height = layout.height * dpr;
        ctx.scale(dpr, dpr);

        try {
          await _renderPoemPoster(ctx, canvas, opts, layout);

          setTimeout(() => {
            wx.canvasToTempFilePath({
              canvas,
              fileType: 'png',
              quality: 1,
              success(r) {
                resolve(r.tempFilePath);
              },
              fail(e) {
                reject(e);
              },
            });
          }, 80);
        } catch (e) {
          reject(e);
        }
      });
  });
}

/**
 * 估算诗词海报布局：正文按宽度换行得到全部行，并计算总高度
 * 无品牌区，空间全部留给正文展示
 * @param {object} opts
 * @param {number} [opts.maxLines] 正文最大行数（默认 MAX_CONTENT_LINES），超出后省略
 * @returns {{height:number, lines:string[], titleLines:string[], contentLineH:number, contentH:number}}
 */
function _measurePoemLayout(ctx, opts = {}) {
  const W = POSTER_WIDTH;
  const content = (opts.content || '').trim();
  const title = (opts.title || '无题').trim();

  const contentFont = '34px serif';
  const contentLineH = 60;
  const contentMaxW = W - 72 - 80;   // 卡片左右留 36、内部左右留 40，正文行宽更大

  const lines = _wrapPoemLines(ctx, content, contentMaxW, contentFont);
  const maxLines = opts.maxLines || MAX_CONTENT_LINES;
  if (lines.length > maxLines) {
    lines.length = maxLines;
    lines[maxLines - 1] = '……（以下省略）';
  }
  const contentH = Math.max(lines.length, 1) * contentLineH;

  const titleLines = _wrapText(ctx, title, W - 140, 'bold 42px serif');

  let height = 0;
  height += 80;                             // 顶部留白（标题作者与画布顶部保持美观留白）
  height += titleLines.length * 56;         // 标题
  height += 24;                             // 标题与作者行间距
  height += 40;                             // 朝代 · 体裁 · 作者
  height += 36;                             // 分隔间距
  height += 60 + contentH + 60;             // 正文卡片（上下内边距 60）
  height += 44;                             // 卡片与底部间隔
  height += 190;                            // 底部二维码卡
  height += 24;                             // 底部留白

  return { height, lines, titleLines, contentLineH, contentH };
}

/**
 * 绘制诗词海报（完整正文，动态高度）
 */
async function _renderPoemPoster(ctx, canvas, opts = {}, layout = {}) {
  const W = POSTER_WIDTH;
  const H = layout.height || POSTER_HEIGHT;
  const lines = layout.lines || [];
  const contentLineH = layout.contentLineH || 48;

  const title = (opts.title || '无题').trim();
  const author = (opts.author || '').trim();
  const dynasty = (opts.dynasty || '').trim();
  const type = (opts.type || '').trim();
  const qrImageUrl = opts.qrImageUrl || '/images/mini.png';

  const brandName = '国文之学';

  // ========== 背景 ==========
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#1F130D');
  bg.addColorStop(0.4, '#3A2218');
  bg.addColorStop(0.75, '#2B180F');
  bg.addColorStop(1, '#160C08');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  const topGlow = ctx.createRadialGradient(W / 2, 130, 10, W / 2, 130, 340);
  topGlow.addColorStop(0, 'rgba(233,196,106,0.24)');
  topGlow.addColorStop(0.45, 'rgba(233,196,106,0.10)');
  topGlow.addColorStop(1, 'rgba(233,196,106,0)');
  ctx.fillStyle = topGlow;
  ctx.fillRect(0, 0, W, 360);

  const bottomGlow = ctx.createRadialGradient(W / 2, H - 120, 20, W / 2, H - 120, 280);
  bottomGlow.addColorStop(0, 'rgba(201,141,61,0.14)');
  bottomGlow.addColorStop(1, 'rgba(201,141,61,0)');
  ctx.fillStyle = bottomGlow;
  ctx.fillRect(0, H - 360, W, 360);

  _drawFlowLines(ctx, W, H);

  ctx.save();
  ctx.strokeStyle = 'rgba(216,177,91,0.24)';
  ctx.lineWidth = 1.2;
  _drawRoundRect(ctx, 20, 20, W - 40, H - 40, 24);
  ctx.stroke();
  ctx.restore();

  let y = 80;

  // ========== 标题 ==========
  ctx.save();
  ctx.fillStyle = '#F7EBD3';
  ctx.font = 'bold 42px serif';
  ctx.textAlign = 'center';
  layout.titleLines.forEach((line) => {
    ctx.fillText(line, W / 2, y);
    y += 56;
  });
  ctx.restore();
  y += 24;

  // ========== 朝代 · 体裁 · 作者 ==========
  const meta = [dynasty, type, author].filter(Boolean).join(' · ');
  if (meta) {
    ctx.save();
    ctx.fillStyle = 'rgba(223,190,128,0.9)';
    ctx.font = '28px serif';
    ctx.textAlign = 'center';
    ctx.fillText(meta, W / 2, y);
    ctx.restore();
  }
  y += 40;
  y += 36;

  // ========== 正文卡片（完整展示，区域更大） ==========
  const cardX = 36;
  const cardW = W - 72;
  const cardY = y;
  const cardH = 60 + layout.contentH + 60;

  _drawPaperCard(ctx, cardX, cardY, cardW, cardH, 28);

  if (lines.length) {
    ctx.save();
    ctx.fillStyle = '#2A1A12';
    ctx.font = '34px serif';
    ctx.textAlign = 'center';
    let textY = cardY + 60 + contentLineH - 10;
    lines.forEach((line) => {
      if (line) {
        ctx.fillText(line, W / 2, textY);
      }
      textY += contentLineH;
    });
    ctx.restore();
  }

  y += cardH + 44;

  // ========== 底部二维码卡 ==========
  const qrCardH = 190;
  _drawBottomPanel(ctx, cardX, y, cardW, qrCardH, 28);

  const qrSize = 130;
  const qrX = cardX + 30;
  const qrY = y + 30;

  ctx.save();
  ctx.fillStyle = '#FFFFFF';
  _drawRoundRect(ctx, qrX, qrY, qrSize, qrSize, 18);
  ctx.fill();
  ctx.restore();

  const qrOk = await _safeDrawImage(canvas, ctx, qrImageUrl, qrX + 8, qrY + 8, qrSize - 16, qrSize - 16);
  if (!qrOk) {
    ctx.save();
    ctx.fillStyle = '#8B5A2B';
    ctx.font = '18px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('小程序码', qrX + qrSize / 2, qrY + qrSize / 2 + 6);
    ctx.restore();
  }

  const infoX = qrX + qrSize + 28;
  ctx.save();
  ctx.textAlign = 'left';
  ctx.fillStyle = '#F8ECD0';
  ctx.font = 'bold 30px serif';
  ctx.fillText(brandName, infoX, qrY + 36);
  ctx.fillStyle = 'rgba(233,215,180,0.88)';
  ctx.font = '20px sans-serif';
  ctx.fillText('长按识别 · 进入诗词天地', infoX, qrY + 74);
  ctx.fillStyle = 'rgba(216,177,91,0.95)';
  ctx.font = '20px sans-serif';
  ctx.fillText('每天一首经典诗词', infoX, qrY + 104);
  ctx.restore();
}

/**
 * 诗词正文按行拆分并换行（保留空行占位，不做截断）
 */
function _wrapPoemLines(ctx, text, maxWidth, font) {
  const lines = [];
  if (!text) return lines;

  const paras = String(text).split('\n');
  for (const para of paras) {
    if (!para.trim()) {
      lines.push('');
      continue;
    }
    const sub = _wrapText(ctx, para, maxWidth, font);
    if (!sub.length) lines.push('');
    else lines.push(...sub);
  }
  return lines;
}

// =========================
// 图片加载与绘制
// =========================

function loadImage(canvas, src) {
  return new Promise((resolve, reject) => {
    if (!src) {
      reject(new Error('图片地址为空'));
      return;
    }

    const img = canvas.createImage();
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(err);
    img.src = src;
  });
}

async function drawImage(canvas, ctx, src, x, y, w, h) {
  const img = await loadImage(canvas, src);
  ctx.drawImage(img, x, y, w, h);
}

/**
 * 安全绘图：失败不抛异常，只返回 false
 */
async function _safeDrawImage(canvas, ctx, src, x, y, w, h) {
  try {
    await drawImage(canvas, ctx, src, x, y, w, h);
    return true;
  } catch (e) {
    return false;
  }
}

// =========================
// 视觉绘制工具
// =========================

function _drawTopBrand(ctx, W, opts = {}) {
  const brandName = opts.brandName || '国文之学';
  const brandSlogan = opts.brandSlogan || '传承千年智慧 · 让经典更易懂';
  const brandMark = opts.brandMark || '文';

  const cx = W / 2;
  const cy = 92;

  ctx.save();

  const ringGrad = ctx.createLinearGradient(cx - 26, cy - 26, cx + 26, cy + 26);
  ringGrad.addColorStop(0, '#F3D38B');
  ringGrad.addColorStop(1, '#B9852F');

  ctx.fillStyle = ringGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, 28, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#3A2114';
  ctx.font = 'bold 28px serif';
  ctx.textAlign = 'center';
  ctx.fillText(brandMark, cx, cy + 9);

  ctx.fillStyle = '#F7EBD3';
  ctx.font = 'bold 36px serif';
  ctx.fillText(brandName, W / 2, 152);

  ctx.fillStyle = 'rgba(223,190,128,0.88)';
  ctx.font = '20px sans-serif';
  ctx.fillText(brandSlogan, W / 2, 184);

  const y = 202;
  ctx.strokeStyle = 'rgba(216,177,91,0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(88, y);
  ctx.lineTo(W - 88, y);
  ctx.stroke();

  ctx.fillStyle = 'rgba(216,177,91,0.75)';
  ctx.beginPath();
  ctx.arc(W / 2, y, 4, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function _drawPaperCard(ctx, x, y, w, h, r = 24) {
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.22)';
  ctx.shadowBlur = 28;
  ctx.shadowOffsetY = 12;

  const grad = ctx.createLinearGradient(x, y, x, y + h);
  grad.addColorStop(0, '#F9F1DF');
  grad.addColorStop(1, '#F2E4C8');
  ctx.fillStyle = grad;

  _drawRoundRect(ctx, x, y, w, h, r);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = 'rgba(180,136,61,0.25)';
  ctx.lineWidth = 1.2;
  _drawRoundRect(ctx, x, y, w, h, r);
  ctx.stroke();
  ctx.restore();

  ctx.save();
  const hl = ctx.createLinearGradient(x, y, x, y + 50);
  hl.addColorStop(0, 'rgba(255,255,255,0.52)');
  hl.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = hl;
  _drawRoundRect(ctx, x + 1, y + 1, w - 2, 52, r);
  ctx.fill();
  ctx.restore();
}

function _drawGlassCard(ctx, x, y, w, h, r = 24) {
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.16)';
  ctx.shadowBlur = 20;
  ctx.shadowOffsetY = 8;

  ctx.fillStyle = 'rgba(255,248,236,0.10)';
  _drawRoundRect(ctx, x, y, w, h, r);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = 'rgba(235,205,142,0.28)';
  ctx.lineWidth = 1;
  _drawRoundRect(ctx, x, y, w, h, r);
  ctx.stroke();
  ctx.restore();
}

function _drawInsightCard(ctx, x, y, w, h, r = 24) {
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.18)';
  ctx.shadowBlur = 24;
  ctx.shadowOffsetY = 8;

  const grad = ctx.createLinearGradient(x, y, x + w, y + h);
  grad.addColorStop(0, 'rgba(104,52,23,0.78)');
  grad.addColorStop(1, 'rgba(69,30,15,0.90)');
  ctx.fillStyle = grad;

  _drawRoundRect(ctx, x, y, w, h, r);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = 'rgba(223,182,97,0.28)';
  ctx.lineWidth = 1;
  _drawRoundRect(ctx, x, y, w, h, r);
  ctx.stroke();
  ctx.restore();
}

function _drawBottomPanel(ctx, x, y, w, h, r = 24) {
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.26)';
  ctx.shadowBlur = 24;
  ctx.shadowOffsetY = 10;

  const grad = ctx.createLinearGradient(x, y, x, y + h);
  grad.addColorStop(0, 'rgba(39,22,15,0.96)');
  grad.addColorStop(1, 'rgba(24,13,10,0.98)');
  ctx.fillStyle = grad;

  _drawRoundRect(ctx, x, y, w, h, r);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = 'rgba(216,177,91,0.24)';
  ctx.lineWidth = 1;
  _drawRoundRect(ctx, x, y, w, h, r);
  ctx.stroke();
  ctx.restore();
}

function _drawTag(ctx, cx, y, text) {
  ctx.save();
  ctx.font = '20px sans-serif';

  const paddingX = 22;
  const w = ctx.measureText(text).width + paddingX * 2;
  const x = cx - w / 2;

  const grad = ctx.createLinearGradient(x, y - 22, x + w, y + 22);
  grad.addColorStop(0, '#D5A242');
  grad.addColorStop(1, '#F0CF86');

  ctx.fillStyle = grad;
  _drawRoundRect(ctx, x, y - 22, w, 36, 18);
  ctx.fill();

  ctx.fillStyle = '#3C2415';
  ctx.textAlign = 'center';
  ctx.fillText(text, cx, y + 2);

  ctx.restore();
}

function _drawSectionLabel(ctx, x, y, text) {
  ctx.save();
  ctx.fillStyle = 'rgba(230,189,99,0.95)';
  ctx.font = 'bold 22px serif';
  ctx.textAlign = 'left';
  ctx.fillText(text, x, y);

  const lineW = 88;
  ctx.strokeStyle = 'rgba(230,189,99,0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x + 68, y - 6);
  ctx.lineTo(x + 68 + lineW, y - 6);
  ctx.stroke();

  ctx.restore();
}

function _drawFlowLines(ctx, W, H) {
  ctx.save();
  ctx.strokeStyle = 'rgba(216,177,91,0.07)';
  ctx.lineWidth = 1;

  for (let i = 0; i < 5; i++) {
    const startY = 240 + i * 120;
    ctx.beginPath();
    ctx.moveTo(40, startY);
    ctx.bezierCurveTo(
      W * 0.28, startY - 30,
      W * 0.68, startY + 36,
      W - 40, startY - 8
    );
    ctx.stroke();
  }

  ctx.restore();
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

// =========================
// 文本工具
// =========================

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

/**
 * 截断过长文本，末尾加省略号
 */
function _limitLines(ctx, lines, maxLines, maxWidth, font) {
  if (!Array.isArray(lines)) return [];
  if (lines.length <= maxLines) return lines;

  const result = lines.slice(0, maxLines);
  let last = result[maxLines - 1] || '';

  ctx.font = font;
  while (last && ctx.measureText(`${last}…`).width > maxWidth) {
    last = last.slice(0, -1);
  }

  result[maxLines - 1] = `${last}…`;
  return result;
}

function _measureText(ctx, text, font) {
  ctx.font = font;
  return ctx.measureText(text).width;
}

// =========================
// 权限与保存
// =========================

/**
 * 保存图片到相册
 * @param {string} filePath
 * @returns {Promise<void>}
 */
function savePosterToAlbum(filePath) {
  return new Promise((resolve, reject) => {
    if (!filePath) {
      reject(new Error('图片路径不能为空'));
      return;
    }

    wx.saveImageToPhotosAlbum({
      filePath,
      success() {
        wx.showToast({
          title: '已保存到相册',
          icon: 'success',
          duration: 2000,
        });
        resolve();
      },
      fail(e) {
        const errMsg = (e && e.errMsg) || '';

        if (errMsg.includes('auth deny') || errMsg.includes('authorize no response')) {
          wx.showModal({
            title: '需要相册权限',
            content: '请在设置中开启“保存到相册”权限，以便保存海报',
            confirmText: '去设置',
            success(r) {
              if (r.confirm) {
                wx.openSetting();
              }
            },
          });
        } else if (!errMsg.includes('cancel')) {
          wx.showToast({
            title: '保存失败，请重试',
            icon: 'none',
          });
        }

        reject(e);
      },
    });
  });
}

// =========================
// 查询工具
// =========================

function _createQuery(pageCtx) {
  if (pageCtx && typeof pageCtx.createSelectorQuery === 'function') {
    return pageCtx.createSelectorQuery();
  }
  return wx.createSelectorQuery().in(pageCtx);
}

module.exports = {
  buildShareMsg,
  buildShareTimeline,
  generateTimelineShare,
  generatePoster,
  generatePoemPoster,
  savePosterToAlbum,
};
