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

const settings = require('./settings');
const svgRepaint = require('./svgRepaint');

const POSTER_WIDTH = 750;   // 逻辑像素
const POSTER_HEIGHT = 1200;

// 微信 Canvas 物理像素高度上限（超限会抛 "set height out of range"）
const CANVAS_MAX_HEIGHT = 16384;
// 正文最小字号（完整展示优先：超高时缩小字号/行高，而不截断正文）
const MIN_CONTENT_FONT = 16;

// 正文字体 → Canvas 字体栈（与 utils/settings.js + app.wxss 保持一致）
// 海报诗文渲染与换行测量均使用该字体栈，跟随设置页「正文字体」或海报内临时选择
// 说明：每栈按「平台内置古风字体 → 通用族」排列，iOS 命中 Kaiti SC / Songti SC；
// Android 无这两款时沿栈降级到 SimSun / Noto Serif，末端通用族保证字体串可解析。
const FONT_FAMILY_STACK = {
  default: '"Songti SC","STSong","华文宋体","SimSun","宋体","Noto Serif SC",serif',
  song: '"Songti SC","STSong","华文宋体","SimSun","宋体","Noto Serif SC",serif',
  kai: '"Kaiti SC","STKaiti","华文楷体","KaiTi","楷体","Noto Serif SC",serif',
  fangsong: '"FangSong SC","STFangsong","华文仿宋","FangSong","仿宋",serif',
  hei: '"Heiti SC","STHeiti","华文黑体","SimHei","黑体","Noto Sans SC",sans-serif',
  xingkai: '"Xingkai SC","STXingkai","华文行楷","Kaiti SC","KaiTi",serif'
};

/**
 * 海报字体风格选项（预览弹层「字体」选择条直接渲染此列表）
 * 平台差异备注：iOS 内置且能命中的古风字体只有楷体（Kaiti SC）与宋体（Songti SC）；
 * 行楷、仿宋 iOS 无内置，会沿字体栈降级（行楷→楷体、仿宋→宋体），效果与默认接近。
 */
const POSTER_FONT_OPTIONS = [
  { key: 'default', label: '默认古风', desc: '标题楷体 · 正文宋体' },
  { key: 'kai', label: '楷体', desc: '全文楷书 · 手书韵味' },
  { key: 'song', label: '宋体', desc: '全文宋刻 · 书卷气' },
  { key: 'xingkai', label: '行楷', desc: '标题行楷 · 正文宋体' },
  { key: 'fangsong', label: '仿宋', desc: '全文仿宋 · 清瘦工整' },
  { key: 'hei', label: '黑体', desc: '现代清晰 · 易读' }
];

/**
 * 解析海报字体栈：{ title, body }
 *   title — 标题 / 落款 / 品牌名等「题字」类文本（默认楷体，书法韵味）
 *   body  — 诗词正文等大段文本（默认宋体，兼顾古韵与可读性）
 * 未传 fontKey 时取设置页「正文字体」；未识别的 key 回落默认古风组合。
 * @param {string} [fontKey] default | song | kai | xingkai | fangsong | hei
 */
function resolvePosterStacks(fontKey) {
  const key = fontKey || (settings.getSettings().fontFamily) || 'default';
  const fallback = { title: FONT_FAMILY_STACK.kai, body: FONT_FAMILY_STACK.song };
  if (!key || key === 'default') return fallback;
  const stack = FONT_FAMILY_STACK[key];
  if (!stack) return fallback;
  // 行楷笔画连绵，仅作用于标题/落款，正文仍用宋体保证可读
  if (key === 'xingkai') return { title: stack, body: FONT_FAMILY_STACK.song };
  return { title: stack, body: stack };
}

/** 当前（或指定）字体的 Canvas 正文栈（海报诗文使用） */
function getPosterFontStack(fontKey) {
  return resolvePosterStacks(fontKey).body;
}

/**
 * 在线 SVG 海报的字体栈覆盖（透传给 svgRepaint.paintScene 第 5 参）。
 * 服务端文本按语义分组：kai = 标题/落款、song = 正文，hei/sans 极少出现，按同一策略覆盖。
 */
function svgFontStacks(fontKey) {
  const s = resolvePosterStacks(fontKey);
  return { kai: s.title, song: s.body, hei: s.title, sans: s.body };
}

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
    title: opts.title || '超然古诗词 · 传承千年智慧',
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
  const quote = opts.quote || '超然古诗词';
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

  // 字体栈：名句/品牌走「题字」栈（默认楷体），落款走正文栈（默认宋体）
  const stacks = resolvePosterStacks(opts.font);

  const quote = (opts.quote || '知之者不如好之者，好之者不如乐之者').trim();
  const author = (opts.author || '《论语》').trim();
  const translation = (opts.translation || '').trim();
  const insight = (opts.insight || '').trim();

  const brandName = opts.brandName || '超然古诗词';
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
    font: opts.font
  });

  // ========== 3. 主名句卡 ==========
  const cardX = 46;
  const cardW = W - 92;
  const quoteCardY = 220;

  const quoteFont = 'bold 42px ' + stacks.title;
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
  ctx.font = 'bold 108px ' + stacks.title;
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
    ctx.font = '26px ' + stacks.body;
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
    _drawSectionLabel(ctx, cardX + 28, currentY + 34, '白话文', stacks);

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
    _drawSectionLabel(ctx, cardX + 28, currentY + 34, '今日启示', stacks);

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
  ctx.font = 'bold 34px ' + stacks.title;
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
 * @param {string} [opts.font]       字体风格 key（海报内临时选择，缺省取设置页「正文字体」）
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

        // 完整展示优先：先按 Canvas 物理高度上限（16384）约束估算布局。
        // 正文过长时不截断，而是自动缩小字号/行高，使全部内容完整落入画布。
        const maxLogicalH = Math.floor(CANVAS_MAX_HEIGHT / dpr) - 8;
        const layout = _measurePoemLayout(ctx, Object.assign({}, opts, { maxHeight: maxLogicalH }));

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
 * 将 PNG Base64 数据写入本地临时文件（服务端海报持久化，供预览与保存）
 * @param {string} base64 纯 base64 字符串（不含 data:image 前缀）
 * @param {string} [name] 文件名前缀，默认 poster_<时间戳>
 * @returns {Promise<string>} 本地文件路径
 */
function persistPosterBase64(base64, name) {
  return new Promise((resolve, reject) => {
    if (!base64) {
      reject(new Error('海报图片数据为空'));
      return;
    }
    const fs = wx.getFileSystemManager();
    const filePath = wx.env.USER_DATA_PATH + '/' + (name || ('poster_' + Date.now())) + '.png';
    fs.writeFile({
      filePath,
      data: String(base64),
      encoding: 'base64',
      success: () => resolve(filePath),
      fail: (e) => reject(e)
    });
  });
}

/**
 * 将服务端 SVG 海报栅格化为本地 PNG 临时文件（降级方案）
 *
 * 背景：POST /poster 的 pngBase64 仅在服务端配置中文字体后才返回；字体缺失时只返回 svg，
 * 而小程序 Canvas2D 无法直接把 svg 作为图片源解码（img.onerror）。因此交给
 * utils/svgRepaint.js 把 svg 当作绘图指令在本地 Canvas 2D 重绘后再导出 PNG——
 * ink/sunset/night 三种主题模板的 svg 子集一致，可稳定还原版式与配色。
 *
 * @param {object} pageCtx  Page 实例（this）
 * @param {string} svg      svg 源码（含 <svg> 根节点）
 * @param {object} [opts]
 * @param {number} [opts.width]   逻辑宽度，默认 1080
 * @param {number} [opts.height]  逻辑高度，默认 1440
 * @param {string} [opts.canvasId] 默认 posterCanvas
 * @param {string} [opts.font]    字体风格 key（海报内临时选择，缺省取设置页「正文字体」）
 * @returns {Promise<string>} PNG 临时文件路径
 */
function renderSvgToTempFile(pageCtx, svg, opts = {}) {
  const canvasId = opts.canvasId || 'posterCanvas';
  // 输出按像素比放大，但限制最大 2x，避免低端机大画布内存压力（1080×1440 → 2160×2880）
  const dpr = Math.min((wx.getWindowInfo && wx.getWindowInfo().pixelRatio) || 2, 2);
  const w = opts.width || 1080;
  const h = opts.height || 1440;

  return new Promise((resolve, reject) => {
    if (!svg) {
      reject(new Error('SVG 内容为空'));
      return;
    }
    const query = _createQuery(pageCtx);
    query
      .select(`#${canvasId}`)
      .fields({ node: true, size: true })
      .exec((res) => {
        if (!res || !res[0] || !res[0].node) {
          reject(new Error(`Canvas 节点不存在：#${canvasId}`));
          return;
        }
        const canvas = res[0].node;
        const ctx = canvas.getContext('2d');

        // 设置画布物理尺寸（重置变换），再按像素比缩放绘制逻辑坐标系
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        ctx.scale(dpr, dpr);
        ctx.clearRect(0, 0, w, h);

        try {
          // 第 5 参：字体偏好（海报内临时选择 opts.font 优先，否则取设置页「正文字体」）
          svgRepaint.paintScene(ctx, svg, w, h, svgFontStacks(opts.font));
        } catch (e) {
          console.error('[share] svg repaint error:', e);
          reject(e instanceof Error ? e : new Error('SVG 指令重绘失败'));
          return;
        }
        wx.canvasToTempFilePath({
          canvas,
          fileType: 'png',
          quality: 1,
          success(r) {
            resolve(r.tempFilePath);
          },
          fail: reject
        });
      });
  });
}

/**
 * 在已有海报底图（本地 PNG 路径）上叠加「诗词来源」文字，返回新的临时文件路径。
 * 用于在线诗画海报：服务端不叠加来源，本地在底图底部追加一行来源标记。
 * 叠加失败时返回原底图路径（不影响海报本身可用性）。
 * @param {object} pageCtx  Page 实例（this）
 * @param {string} basePath 底图本地路径
 * @param {object} [opts]
 * @param {number} [opts.width]  底图逻辑宽度，默认 1080
 * @param {number} [opts.height] 底图逻辑高度，默认 1440
 * @param {string} [opts.theme]  海报主题 ink/sunset/night，用于选择文字颜色
 * @param {string} [opts.text]   来源文字
 * @param {string} [opts.sealNickname] 昵称（存在时在左侧边框外侧绘制红色印章）
 * @param {string} [opts.sealCaption]  题跋文字（存在时绘制在印章下方竖排）
 * @returns {Promise<string>}
 */
function overlaySourceMark(pageCtx, basePath, opts = {}) {
  if (!basePath) return Promise.resolve(basePath);
  const canvasId = opts.canvasId || 'posterCanvas';
  const dpr = Math.min((wx.getWindowInfo && wx.getWindowInfo().pixelRatio) || 2, 2);
  const w = opts.width || 1080;
  const h = opts.height || 1440;
  const text = opts.text || '诗意源于「超然古诗词」微信小程序';
  // 浅色主题（ink 水墨宣纸 / sunset 落日）用深褐文字；深色主题（night 夜月）用浅米金文字
  const lightTheme = opts.theme === 'ink' || opts.theme === 'sunset';
  const markColor = lightTheme ? 'rgba(74,46,24,0.82)' : 'rgba(233,215,180,0.92)';
  const sealNickname = opts.sealNickname ? String(opts.sealNickname).trim() : '';
  const sealCaption = opts.sealCaption ? String(opts.sealCaption).trim() : '';

  return new Promise((resolve) => {
    const query = _createQuery(pageCtx);
    query
      .select(`#${canvasId}`)
      .fields({ node: true, size: true })
      .exec((res) => {
        if (!res || !res[0] || !res[0].node) {
          resolve(basePath);
          return;
        }
        const canvas = res[0].node;
        const ctx = canvas.getContext('2d');
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        ctx.scale(dpr, dpr);
        ctx.clearRect(0, 0, w, h);

        const img = canvas.createImage();
        img.onload = () => {
          try {
            ctx.drawImage(img, 0, 0, w, h);
            // 底部右下角叠加来源文字（text 非空时）：无背景、无描边，按主题自适应颜色
            if (text) {
              ctx.font = '26px sans-serif';
              ctx.textAlign = 'right';
              ctx.fillStyle = markColor;
              ctx.fillText(text, w - 36, h - 16);
            }

            // 左上角、边框外侧：题跋在上、昵称印章在下（传统「先文字后钤印」规范）
            if (sealNickname) {
              const topY = 50;              // 顶部留白
              let sealLeftX = 50;           // 印章左边界（无题跋时默认；有题跋时对齐末尾字）
              let sealCy;
              if (sealCaption) {
                // 先画题跋（文字在上，从右往左换列），返回末尾字位置
                const captionRightX = sealLeftX + 30;   // 第一列中心 x（靠右）
                const end = _drawSealCaption(ctx, sealCaption, captionRightX, topY, h - 40, markColor);
                // 小印钤在题跋末尾字下方，x 对齐末尾字所在列
                sealLeftX = end.x - 21;                 // 小印宽 42，中心对齐末尾字
                sealCy = end.y + 18 + 21;               // 末尾字底部 + 间距 + 印章半高
              } else {
                // 无题跋：印章直接放顶部
                sealCy = topY + 21;
              }
              _drawSeal(ctx, sealNickname, sealLeftX, sealCy, 42);
            }

            wx.canvasToTempFilePath({
              canvas,
              fileType: 'png',
              quality: 1,
              success(r) { resolve(r.tempFilePath); },
              fail() { resolve(basePath); }
            });
          } catch (e) {
            resolve(basePath);
          }
        };
        img.onerror = () => resolve(basePath);
        img.src = basePath;
      });
  });
}

/**
 * 绘制红色印章（朱文印：红底白字），用于海报左侧边框外侧。
 * 排版规则：4 字 → 2×2 方章；3 字 → 2×2 方章（补「印」字）；2 字 → 1 列 2 行长章；1 字 → 单字方章。
 * 昵称最多 4 字，超出截断。
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} nickname 昵称（未处理）
 * @param {number} leftX 印章左边界 x（逻辑像素）
 * @param {number} cy 印章中心 y（逻辑像素）
 * @param {number} [size] 方章基准边长，默认 84
 * @returns {{size:number, cx:number, width:number, height:number}} 实际尺寸与中心 x（供题跋定位）
 */
function _drawSeal(ctx, nickname, leftX, cy, size = 84) {
  const chars = (nickname || '').trim().slice(0, 4).split('');
  if (!chars.length) return { size, cx: leftX + size / 2, width: size, height: size };

  const n = chars.length;
  // 网格行列：4字/3字 → 2×2；2字 → 1列2行；1字 → 1×1
  const cols = (n === 2) ? 1 : 2;
  const rows = (n === 1) ? 1 : 2;

  // 印章尺寸：方章（2列）边长 size；2 字长章宽为高的一半
  const sealW = (n === 2) ? Math.round(size * 0.62) : size;
  const sealH = size;

  const cx = leftX + sealW / 2;
  const x = leftX;
  const y = cy - sealH / 2;
  const sealRed = '#B3272E';   // 印泥红（较暗，接近真实朱砂印）

  // 内边距/圆角/线宽按印章尺寸等比缩放（以 84 为基准）
  const radius = Math.max(2, Math.round(size * 0.07));   // 圆角
  const inner = Math.max(2, Math.round(size * 0.06));    // 内框留白
  const lineW = Math.max(1, Math.round(size * 0.024));   // 线宽
  const padX = Math.max(3, Math.round(size * 0.12));     // 水平内边距
  const padY = Math.max(3, Math.round(size * 0.12));     // 垂直内边距

  ctx.save();

  // 红底（主体）
  ctx.fillStyle = sealRed;
  _drawRoundRect(ctx, x, y, sealW, sealH, radius);
  ctx.fill();

  // 内层细白边（仿印章内框）
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = lineW;
  _drawRoundRect(ctx, x + inner, y + inner, sealW - inner * 2, sealH - inner * 2, radius - 2);
  ctx.stroke();

  // 文字：按网格排列，3 字时第 4 格补「印」
  const cells = n === 3 ? chars.concat('印') : chars.slice();
  const cellW = (sealW - padX * 2) / cols;
  const cellH = (sealH - padY * 2) / rows;
  const fontSize = Math.min(cellW, cellH) * 0.72;

  ctx.fillStyle = '#FDF6E8';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold ' + Math.floor(fontSize) + 'px ' + FONT_FAMILY_STACK.kai;

  cells.forEach((ch, i) => {
    const r = Math.floor(i / cols);      // 行
    const c = i % cols;                  // 列
    const cellCx = x + padX + cellW * c + cellW / 2;
    const cellCy = y + padY + cellH * r + cellH / 2;
    ctx.fillText(ch, cellCx, cellCy);
  });

  ctx.restore();
  return { size: sealH, cx, width: sealW, height: sealH };
}

/**
 * 绘制题跋（落款文字，最多 140 字），多列竖排、从右往左换列（传统古法）。
 * 排版：每列从上往下写，填满可用高度后向左换新一列（右→左的书写顺序）。
 * 字号/行高按可用高度自适应，保证长文本不溢出海报；最左列不超出画布左边界。
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} caption 题跋文字
 * @param {number} rightX 题跋第一列的中心 x（靠右，与印章右边界对齐）
 * @param {number} topY 起始 y（题跋顶部）
 * @param {number} [maxBottom] 题跋可用的最大底部 y（默认海报底部留白处）
 * @param {string} [color] 文字颜色（默认与来源标记一致）
 * @returns {{x:number, y:number}} 末尾字的位置（中心 x 与底部 y），供印章钤在末尾
 */
function _drawSealCaption(ctx, caption, rightX, topY, maxBottom, color) {
  const text = (caption || '').trim().slice(0, 140);
  if (!text) return { x: rightX, y: topY };

  const chars = text.split('');
  const bottom = maxBottom || 1400;   // 默认底部留白约 40px

  // 可用高度 → 每列可容纳字数
  const availH = Math.max(bottom - topY, 60);
  const lineH = 26;                   // 行高
  const perCol = Math.max(1, Math.floor(availH / lineH));
  const colW = 26;                    // 列宽（含字间距）
  const minX = 16;                    // 最左列中心 x 下限（避免文字贴出画布）

  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color || 'rgba(233,215,180,0.9)';   // 与来源标记同色系
  ctx.font = '22px ' + FONT_FAMILY_STACK.kai;

  // 从右往左：第 0 列在最右，后续列向左扩展（传统竖排右起）
  let col = 0;
  let endX = rightX;
  let endY = topY;
  for (let i = 0; i < chars.length; i += perCol) {
    const colChars = chars.slice(i, i + perCol);
    const colX = rightX - col * colW;
    // 向左超出画布边界则停止换列（后续文字无法容纳，截断）
    if (colX < minX) break;
    let ty = topY + lineH / 2;
    colChars.forEach((ch) => {
      ctx.fillText(ch, colX, ty);
      ty += lineH;
    });
    // 末尾字：本列最后一个字的位置
    endX = colX;
    endY = topY + lineH / 2 + (colChars.length - 1) * lineH;
    col += 1;
  }

  ctx.restore();
  return { x: endX, y: endY };
}

/**
 * 估算诗词海报布局：正文按宽度换行得到全部行，并计算总高度
 * 完整展示优先：若正文超长导致高度超过 maxHeight，自动逐档缩小字号/行高，
 * 使全部正文行完整落入画布（不截断、不省略）。
 * @param {object} opts
 * @param {number} [opts.maxHeight] 画布逻辑像素高度上限（默认不限制）
 * @param {string} [opts.font]      字体风格 key（海报内临时选择，缺省取设置页「正文字体」）
 * @returns {{height:number, lines:string[], titleLines:string[], titleFont:string, contentLineH:number, contentFont:string, contentH:number}}
 */
function _measurePoemLayout(ctx, opts = {}) {
  const W = POSTER_WIDTH;
  const content = (opts.content || '').trim();
  const title = (opts.title || '无题').trim();
  const maxHeight = opts.maxHeight || Number.MAX_SAFE_INTEGER;

  const contentMaxW = W - 72 - 80;   // 卡片左右留 36、内部左右留 40，正文行宽更大

  // 标题走「题字」栈（默认楷体）、正文走正文栈（默认宋体）；opts.font 为海报内临时选择
  const stacks = resolvePosterStacks(opts.font);
  const titleFont = 'bold 42px ' + stacks.title;
  const titleLines = _wrapText(ctx, title, W - 140, titleFont);

  // 正文字体栈（与渲染一致，保证换行测量准确）
  const contentStack = stacks.body;

  // 基准：字号 34px、行高 60px
  let fontPx = 34;
  let contentLineH = 60;

  const calcHeight = (lines, lineH) => {
    const contentH = Math.max(lines.length, 1) * lineH;
    let h = 0;
    h += 80;                             // 顶部留白
    h += titleLines.length * 56;         // 标题
    h += 24;                             // 标题与作者行间距
    h += 40;                             // 朝代 · 体裁 · 作者
    h += 36;                             // 分隔间距
    h += 60 + contentH + 60;             // 正文卡片（上下内边距 60）
    h += 44;                             // 卡片与底部间隔
    h += 190;                            // 底部二维码卡
    h += 24;                             // 底部留白
    return h;
  };

  let lines = _wrapPoemLines(ctx, content, contentMaxW, fontPx + 'px ' + contentStack);
  let height = calcHeight(lines, contentLineH);

  // 高度越界 → 逐档缩小字号与行高（按同比例 60/34），直至全文可完整放入画布
  while (height > maxHeight && fontPx > MIN_CONTENT_FONT) {
    fontPx -= 2;
    contentLineH = Math.round(fontPx * (60 / 34));
    lines = _wrapPoemLines(ctx, content, contentMaxW, fontPx + 'px ' + contentStack);
    height = calcHeight(lines, contentLineH);
  }

  // 最终保护：极端超长文本在最小字号下仍越界时，仅压缩行高（不截断正文）
  if (height > maxHeight && lines.length > 0) {
    const fixedH = height - Math.max(lines.length, 1) * contentLineH;
    const maxLineH = Math.floor((maxHeight - fixedH) / lines.length);
    if (maxLineH >= 24) {
      contentLineH = maxLineH;
      height = calcHeight(lines, contentLineH);
    }
  }

  const contentH = Math.max(lines.length, 1) * contentLineH;
  return {
    height,
    lines,
    titleLines,
    titleFont,
    contentLineH,
    contentFont: fontPx + 'px ' + contentStack,
    contentH
  };
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

  const brandName = '超然古诗词';

  // 字体栈：标题/品牌走「题字」栈（默认楷体），正文/元信息走正文栈（默认宋体）
  const stacks = resolvePosterStacks(opts.font);

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
  ctx.font = layout.titleFont || ('bold 42px ' + stacks.title);
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
    ctx.font = '28px ' + stacks.body;
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
    ctx.font = layout.contentFont || ('34px ' + stacks.body);
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

  // 用户头像 + 昵称（与二维码同一行卡片内，登录后展示）
  const hasUser = !!opts.nickname || !!opts.avatarUrl;
  if (hasUser) {
    await _drawUserInQrCard(ctx, canvas, opts, infoX, qrY + 14, stacks);
    // 品牌名 + 识别提示放在同一行
    ctx.font = 'bold 24px ' + stacks.title;
    const brandW = ctx.measureText(brandName).width;
    ctx.fillStyle = '#F8ECD0';
    ctx.fillText(brandName, infoX, qrY + 108);
    ctx.fillStyle = 'rgba(233,215,180,0.88)';
    ctx.font = '20px sans-serif';
    ctx.fillText('长按识别 · 进入诗词天地', infoX + brandW + 16, qrY + 108);
  } else {
    ctx.fillStyle = '#F8ECD0';
    ctx.font = 'bold 30px ' + stacks.title;
    ctx.fillText(brandName, infoX, qrY + 36);
    ctx.fillStyle = 'rgba(233,215,180,0.88)';
    ctx.font = '20px sans-serif';
    ctx.fillText('长按识别 · 进入诗词天地', infoX, qrY + 74);
    ctx.fillStyle = 'rgba(216,177,91,0.95)';
    ctx.font = '20px sans-serif';
    ctx.fillText('每天一首经典诗词', infoX, qrY + 104);
  }
  ctx.restore();
}

/**
 * 在底部二维码卡片内绘制用户信息（小尺寸圆形头像 + 昵称），
 * 位于卡片右侧顶部，与小程序码同一行区域。
 * 头像加载失败或未设置时，用首字占位圆形替代；昵称缺失则不绘制文字。
 */
async function _drawUserInQrCard(ctx, canvas, opts, x, y, stacks) {
  const nickname = (opts.nickname || '').trim();
  const avatarUrl = await _resolveAvatarUrl(opts.avatarUrl);

  const avatarSize = 44;
  const avatarX = x;
  const avatarY = y;
  const centerX = avatarX + avatarSize / 2;
  const centerY = avatarY + avatarSize / 2;

  // 圆形裁剪绘制头像
  ctx.save();
  ctx.beginPath();
  ctx.arc(centerX, centerY, avatarSize / 2, 0, Math.PI * 2);
  ctx.clip();

  let avatarOk = false;
  if (avatarUrl) {
    avatarOk = await _safeDrawImage(canvas, ctx, avatarUrl, avatarX, avatarY, avatarSize, avatarSize);
  }
  if (!avatarOk) {
    // 头像加载失败或未设置：金色底 + 昵称首字（或「友」）占位
    const g = ctx.createLinearGradient(avatarX, avatarY, avatarX + avatarSize, avatarY + avatarSize);
    g.addColorStop(0, '#D9A441');
    g.addColorStop(1, '#B9852F');
    ctx.fillStyle = g;
    ctx.fillRect(avatarX, avatarY, avatarSize, avatarSize);
    ctx.fillStyle = '#3C210F';
    ctx.font = 'bold 22px ' + stacks.title;
    ctx.textAlign = 'center';
    const mark = (nickname && nickname.slice(0, 1)) || '友';
    ctx.fillText(mark, centerX, centerY + 8);
  }
  ctx.restore();

  // 圆形描边
  ctx.save();
  ctx.strokeStyle = 'rgba(243,211,139,0.75)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(centerX, centerY, avatarSize / 2, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // 昵称文字
  if (nickname) {
    ctx.save();
    ctx.fillStyle = '#F7EBD3';
    ctx.font = '26px ' + stacks.title;
    ctx.textAlign = 'left';
    const nickX = avatarX + avatarSize + 16;
    ctx.fillText(nickname, nickX, centerY + 9);
    ctx.restore();
  }
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
// 用户头像与昵称
// =========================

/**
 * 将头像地址解析为 Canvas 可加载的图片源。
 * 云存储 fileID（cloud:// 开头）需先换取临时 https 链接；本地路径/http 直接返回。
 * @param {string} avatarUrl
 * @returns {Promise<string|null>} 可加载地址，失败返回 null
 */
function _resolveAvatarUrl(avatarUrl) {
  if (!avatarUrl) return Promise.resolve(null);
  if (String(avatarUrl).indexOf('cloud://') === 0) {
    if (!wx.cloud || !wx.cloud.getTempFileURL) return Promise.resolve(null);
    return wx.cloud.getTempFileURL({ fileList: [avatarUrl] })
      .then((res) => {
        const f = res && res.fileList && res.fileList[0];
        return (f && f.tempFileURL) || null;
      })
      .catch(() => null);
  }
  return Promise.resolve(String(avatarUrl));
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
  const brandName = opts.brandName || '超然古诗词';
  const brandSlogan = opts.brandSlogan || '传承千年智慧 · 让经典更易懂';
  const brandMark = opts.brandMark || '文';

  // 品牌徽章/名称按「题字」栈渲染（默认楷体），与海报正文风格一致
  const stacks = resolvePosterStacks(opts.font);

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
  ctx.font = 'bold 28px ' + stacks.title;
  ctx.textAlign = 'center';
  ctx.fillText(brandMark, cx, cy + 9);

  ctx.fillStyle = '#F7EBD3';
  ctx.font = 'bold 36px ' + stacks.title;
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

function _drawSectionLabel(ctx, x, y, text, stacks) {
  // 未显式传入时沿用设置页字体偏好
  const st = stacks || resolvePosterStacks();
  ctx.save();
  ctx.fillStyle = 'rgba(230,189,99,0.95)';
  ctx.font = 'bold 22px ' + st.title;
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
 * 完整处理：权限预检（wx.getSetting）→ 首次主动申请（wx.authorize）→
 * 被拒引导去设置（wx.openSetting）→ 返回后自动重试保存；
 * 并兼容新版基础库的 auth denied / privacy 等失败文案。
 * @param {string} filePath
 * @returns {Promise<void>}
 */
async function savePosterToAlbum(filePath) {
  if (!filePath) {
    throw new Error('图片路径不能为空');
  }

  const saveOnce = () =>
    new Promise((resolve, reject) => {
      wx.saveImageToPhotosAlbum({
        filePath,
        success: resolve,
        fail: reject,
      });
    });

  // 保存 + 失败兜底（_handleSaveFail 内部会处理权限/隐私并重试，成功时自带提示）
  const doSave = async () => {
    try {
      await saveOnce();
      wx.showToast({ title: '已保存到相册', icon: 'success', duration: 2000 });
    } catch (e) {
      await _handleSaveFail(e, saveOnce);
    }
  };

  // 1) 检查相册权限状态
  const auth = await _getAlbumAuth();

  // 2) 首次使用（未请求过）→ 先主动申请，避免与保存请求时序冲突
  let granted = auth;
  if (auth === null) {
    granted = await _authorizeAlbum();
  }

  // 3) 已授权 → 保存（失败时内部自动处理权限/隐私并重试）
  if (granted) {
    await doSave();
    return;
  }

  // 4) 未授权（此前被拒绝）→ 引导去设置，返回后自动重试
  const opened = await _confirmOpenSetting();
  if (opened) {
    await doSave();
    return;
  }

  throw new Error('用户未开启相册权限');
}

/**
 * 读取相册权限状态
 * @returns {Promise<boolean|null>} true 已授权 | false 已拒绝 | null 未请求过
 */
function _getAlbumAuth() {
  return new Promise((resolve) => {
    wx.getSetting({
      success(res) {
        const val = (res && res.authSetting && res.authSetting['scope.writePhotosAlbum']);
        resolve(val === true ? true : val === false ? false : null);
      },
      fail() {
        resolve(null);
      },
    });
  });
}

/**
 * 首次请求相册权限（弹出授权框）
 * @returns {Promise<boolean>}
 */
function _authorizeAlbum() {
  return new Promise((resolve) => {
    wx.authorize({
      scope: 'scope.writePhotosAlbum',
      success() { resolve(true); },
      fail() { resolve(false); },
    });
  });
}

/**
 * 弹窗引导用户前往设置页开启权限
 * @returns {Promise<boolean>} 用户从设置页返回后是否已授权
 */
function _confirmOpenSetting() {
  return new Promise((resolve) => {
    wx.showModal({
      title: '需要相册权限',
      content: '保存海报需要访问您的相册，请在设置中开启“保存到相册”权限',
      confirmText: '去设置',
      cancelText: '取消',
      success(res) {
        if (!res.confirm) {
          resolve(false);
          return;
        }
        wx.openSetting({
          success(s) {
            const val = (s && s.authSetting && s.authSetting['scope.writePhotosAlbum']);
            resolve(val === true);
          },
          fail() {
            resolve(false);
          },
        });
      },
      fail() {
        resolve(false);
      },
    });
  });
}

/**
 * 兜底：保存失败时统一处理错误文案
 * @param {object} e
 * @param {Function} retrySave 重试保存函数
 * @returns {Promise<void>}
 */
async function _handleSaveFail(e, retrySave) {
  const errMsg = (e && e.errMsg) || String((e && e.message) || '');

  // 隐私保护指引未同意 → 尝试拉起隐私授权
  if (errMsg.includes('privacy') || errMsg.includes('隐私')) {
    if (wx.requirePrivacyAuthorize) {
      try {
        await new Promise((resolve, reject) => {
          wx.requirePrivacyAuthorize({ success: resolve, fail: reject });
        });
        await retrySave();
        wx.showToast({ title: '已保存到相册', icon: 'success', duration: 2000 });
        return;
      } catch (_) { /* 用户未同意，走下方提示 */ }
    }
    wx.showModal({
      title: '需要授权',
      content: '请先同意《用户隐私保护指引》，即可保存海报到相册',
      showCancel: false,
    });
    throw e;
  }

  // 权限类错误 → 引导去设置
  if (
    errMsg.includes('auth deny') ||
    errMsg.includes('auth denied') ||
    errMsg.includes('authorize no response') ||
    errMsg.includes('authorize reject') ||
    errMsg.includes('permission denied')
  ) {
    const opened = await _confirmOpenSetting();
    if (opened) {
      await retrySave();
      wx.showToast({ title: '已保存到相册', icon: 'success', duration: 2000 });
      return;
    }
    throw e;
  }

  // 用户主动取消 → 不打扰
  if (errMsg.includes('cancel')) {
    throw e;
  }

  // 其他错误
  if (errMsg.includes('invalid filePath') || errMsg.includes('invalid file')) {
    wx.showToast({ title: '海报图片已失效，请重新生成', icon: 'none' });
  } else {
    wx.showToast({ title: '保存失败，请重试', icon: 'none' });
  }
  throw e;
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
  persistPosterBase64,
  renderSvgToTempFile,
  overlaySourceMark,
  savePosterToAlbum,
  // 海报字体：风格选项列表（预览页选择条）与栈解析（供自定义绘制复用）
  POSTER_FONT_OPTIONS,
  resolvePosterStacks,
  getPosterFontStack,
};
