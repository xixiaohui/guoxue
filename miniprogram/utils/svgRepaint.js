/**
 * utils/svgRepaint.js - 服务端海报 SVG → Canvas 2D 指令重绘
 *
 * 背景：POST /poster 的 pngBase64 仅在服务端配置中文字体后才返回；字体缺失时只返回 svg，
 * 而小程序 Canvas2D 的 Image 对象无法直接解码 SVG 数据。本模块把服务端输出的 SVG 当作
 * 「绘图指令」逐条在本地 Canvas 2D 上重绘（背景渐变/圆角边框/山形 path/圆点装饰/
 * 逐字定位的中文文字），从而把「在线诗画海报」落为可保存的 PNG。
 *
 * 兼容的服务端 SVG 子集（已对 chinesepoetry.space /api/v1/poster 的 ink/sunset/night
 * 三种主题实测核对）：
 *   - 标签：defs、linearGradient + stop、g(opacity/translate)、rect(rx)、
 *     path(M/L/Z)、ellipse、circle、text
 *   - 文字全部为绝对坐标（竖排正文逐字拆成独立 <text>），无 tspan/rotate/image
 *   - 噪声滤镜（feTurbulence）本地忽略，不影响整体版式
 *   - 整幅色彩滤镜（id="poster-fx" 的 feColorMatrix matrix）在绘制完成后做像素后处理，
 *     使 sepia/warm/cool/gray/vivid 等滤镜选项在本地同样生效
 *
 * 字体（古风化）：服务端每段文本下发完整回退链，本模块按语意归组为
 * 「楷体（KaiTi 开头：标题/落款）」「宋体（poster-serif 开头：正文）」两组
 * 古风字体栈，取当前平台首个已安装字体绘制，栈尾以 serif 兜底保证字体串可解析
 * （iOS 命中 Kaiti SC/Songti SC；Android 缺 iOS 专有字体时沿栈降级，避免变默认黑体）。
 * paintScene 支持按 {kai,song,hei} 覆盖，供上层把设置页「正文字体」透传进来。
 */

/** SVG 数字属性：去 px 单位，非法值回落默认 */
function _num(v, def) {
  if (v === undefined || v === null || v === '') return def;
  const n = parseFloat(String(v).replace(/px$/, ''));
  return Number.isFinite(n) ? n : def;
}

/** 解析元素属性串为对象（服务端统一双引号） */
function _attrs(raw) {
  const a = {};
  const re = /([a-zA-Z_:][a-zA-Z0-9:._-]*)\s*=\s*"([^"]*)"/g;
  let m;
  while ((m = re.exec(raw))) a[m[1]] = m[2];
  return a;
}

/** XML 常用实体反转义 */
function _unescape(s) {
  return String(s)
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#x([0-9a-fA-F]+);/g, (_, d) => String.fromCharCode(parseInt(d, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d))
    .replace(/&amp;/g, '&');
}

/**
 * 古风字体栈（每栈以「系统内置古风字体 → 通用族」顺序排列）：
 *   kai  — 楷体系文本（服务端 font-family 以 "KaiTi, poster-serif, ..." 开头）
 *   song — 衬线系文本（服务端 font-family 以 "poster-serif, 'Noto Serif CJK SC',
 *          'Noto Serif SC', 'Songti SC', STSong, SimSun, serif" 开头，海报正文）
 *   hei  — 黑体系文本（一般不会出现）
 * 说明：Canvas 的 ctx.font 接受完整 CSS 字体栈，会按顺序命中第一个「当前系统
 * 已安装」的字体——iOS 命中 Kaiti SC / Songti SC 即得楷体/宋体古韵；Android 无
 * 这两款时沿栈继续尝试 SimSun/宋体/Noto Serif（部分 ROM 内置），最后以通用族
 * serif 收尾，保证字体串整体可解析、绝不退回默认黑体。
 */
const FONT_STACKS = {
  kai: '"Kaiti SC","STKaiti","华文楷体","KaiTi","楷体","Xingkai SC","STXingkai","华文行楷","Songti SC","STSong","SimSun","宋体",serif',
  song: '"Songti SC","STSong","华文宋体","SimSun","宋体","Noto Serif SC","Noto Serif CJK SC",serif',
  hei: '"Heiti SC","STHeiti","华文黑体","SimHei","黑体","PingFang SC","Microsoft YaHei","Noto Sans CJK SC",sans-serif',
  sans: '"PingFang SC","Microsoft YaHei","Heiti SC","STHeiti","Noto Sans CJK SC",sans-serif'
};

/**
 * SVG font-family 文本 → 古风字体栈（按服务端语义分流）。
 * 服务端为每段文本下发完整字体回退链：标题/落款以 "KaiTi," 开头（楷体系），
 * 正文以 "poster-serif," 开头（衬线系）。这里只做「语意归组」，具体字族
 * 由对应栈按平台可用性依次命中。
 * @param {string} family 服务端 font-family 属性值
 * @param {object} [stacks] 覆盖用的字体栈（merge 后同 KEY）
 * @returns {string} 可直接拼入 ctx.font 的字体栈
 */
function _fontFamily(family, stacks) {
  const f = String(family || '').toLowerCase();
  // 楷体系：服务端以 "KaiTi"（及行楷类）开头。正文衬线族中不含 kai 子串，
  // 子串匹配即可安全归组（避免 \b 词边界在 "KaiTi" 上失效）
  if (/(?:^|[^a-z])kai|楷/.test(f)) return stacks.kai;
  if (/\bhei\b|黑/.test(f)) return stacks.hei;
  if (/\bsans\b/.test(f) && !/serif|song|宋/.test(f)) return stacks.sans;
  // song / serif / noto / poster-serif 等正文一律走宋体栈
  return stacks.song;
}

/**
 * 编译 SVG 文档为按绘制顺序的指令数组。
 * @returns {Array<object>} 指令：{k:'grad'|'g'|'gEnd'|'rect'|'path'|'ellipse'|'circle'|'text', ...}
 */
function parseSvgCommands(svg) {
  const cmds = [];
  const tagRe = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:[^>"']|"[^"]*")*)>/g;
  let idx = 0;
  let m;
  let pendingText = null;
  let activeGrad = null;
  let inDefs = false;

  while ((m = tagRe.exec(svg))) {
    // 两标签之间的纯文本（即 <text> 内容）
    const between = svg.slice(idx, m.index);
    if (pendingText && between) pendingText.content += between;
    idx = tagRe.lastIndex;

    const tag = m[2];
    const rawAttr = m[3];
    const isClose = m[1] === '/';
    const isSelf = !isClose && /\/\s*$/.test(rawAttr);

    if (isClose) {
      if (tag === 'text' && pendingText) {
        cmds.push({ k: 'text', a: pendingText.a, content: pendingText.content });
        pendingText = null;
      } else if (tag === 'linearGradient' && activeGrad) {
        cmds.push({ k: 'grad', g: activeGrad });
        activeGrad = null;
      } else if (tag === 'g') {
        cmds.push({ k: 'gEnd' });
      } else if (tag === 'defs') {
        inDefs = false;
      }
      continue;
    }

    if (tag === 'defs') { inDefs = true; continue; }
    if (tag === 'filter' || tag === 'svg' || tag === 'feTurbulence' ||
        tag === 'feColorMatrix' || tag === 'feGaussianBlur') continue;

    if (tag === 'linearGradient') {
      activeGrad = {
        id: _attrs(rawAttr).id || '',
        x1: _num(_attrs(rawAttr).x1, 0), y1: _num(_attrs(rawAttr).y1, 0),
        x2: _num(_attrs(rawAttr).x2, 1), y2: _num(_attrs(rawAttr).y2, 1),
        stops: []
      };
      if (isSelf) { cmds.push({ k: 'grad', g: activeGrad }); activeGrad = null; }
      continue;
    }
    if (tag === 'stop') {
      if (activeGrad) {
        const sa = _attrs(rawAttr);
        activeGrad.stops.push({
          off: _num(sa.offset, 0),
          color: sa['stop-color'] || '#000',
          op: _num(sa['stop-opacity'], 1)
        });
      }
      continue;
    }
    if (tag === 'g') {
      cmds.push({ k: 'g', a: _attrs(rawAttr) });
      continue;
    }
    if (tag === 'text') {
      const a = _attrs(rawAttr);
      pendingText = { a, content: '' };
      if (isSelf) { cmds.push({ k: 'text', a, content: '' }); pendingText = null; }
      continue;
    }
    if (inDefs) continue; // defs 内其余元素忽略

    // 自闭合绘制图元
    cmds.push({ k: tag, a: _attrs(rawAttr) });
  }
  return cmds;
}

/** 构造渐变（objectBoundingBox 语义：按图形包围盒换算坐标） */
function _makeGradient(ctx, grad, box) {
  if (!grad || !grad.stops.length) return null;
  const b = box || { x: 0, y: 0, w: 1080, h: 1440 };
  const x1 = b.x + grad.x1 * b.w;
  const y1 = b.y + grad.y1 * b.h;
  const x2 = b.x + grad.x2 * b.w;
  const y2 = b.y + grad.y2 * b.h;
  const g = ctx.createLinearGradient(x1, y1, x2, y2);
  for (const s of grad.stops) {
    g.addColorStop(Math.min(Math.max(s.off, 0), 1), s.color);
  }
  return g;
}

/** 解析 fill 属性：'none'/缺失→null；url(#id)→渐变；颜色→原值 */
function _resolveFill(ctx, fill, gradients, box) {
  if (fill === undefined || fill === null) return '#000';
  const url = /^url\(\s*#([\w-]+)\s*\)$/.exec(String(fill).trim());
  if (url) return _makeGradient(ctx, gradients[url[1]], box);
  return String(fill);
}

/** 圆角矩形路径 */
function _roundRectPath(ctx, x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.arcTo(x + w, y, x + w, y + rr, rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.arcTo(x + w, y + h, x + w - rr, y + h, rr);
  ctx.lineTo(x + rr, y + h);
  ctx.arcTo(x, y + h, x, y + h - rr, rr);
  ctx.lineTo(x, y + rr);
  ctx.arcTo(x, y, x + rr, y, rr);
  ctx.closePath();
}

/** 元素自身 opacity（乘到当前 globalAlpha） */
function _applyAlpha(ctx, a) {
  if (a.opacity !== undefined) {
    const op = parseFloat(a.opacity);
    if (Number.isFinite(op)) ctx.globalAlpha = ctx.globalAlpha * Math.min(Math.max(op, 0), 1);
  }
}

/** 进入 <g>：应用 opacity 与 translate */
function _applyGroup(ctx, a) {
  _applyAlpha(ctx, a);
  const t = a.transform || '';
  const tm = /translate\(\s*(-?[\d.]+)[\s,]+(-?[\d.]+)\s*\)/.exec(t);
  if (tm) ctx.translate(parseFloat(tm[1]), parseFloat(tm[2]));
}

function _applyStroke(ctx, a) {
  if (!a.stroke || a.stroke === 'none') return;
  ctx.strokeStyle = a.stroke;
  ctx.lineWidth = _num(a['stroke-width'], 1);
  if (a['stroke-linejoin'] === 'round') ctx.lineJoin = 'round';
  else if (a['stroke-linejoin'] === 'bevel') ctx.lineJoin = 'bevel';
}

function _drawRect(ctx, a, gradients, W, H) {
  if (a.filter) return; // 噪声滤镜叠加层本地忽略
  const x = _num(a.x, 0);
  const y = _num(a.y, 0);
  const w = _num(a.width, W);
  const h = _num(a.height, H);
  const hasStroke = !!(a.stroke && a.stroke !== 'none');
  const fillStyle = a.fill === 'none' ? null : _resolveFill(ctx, a.fill, gradients, { x, y, w, h });
  if (!fillStyle && !hasStroke) return;
  ctx.save();
  _applyAlpha(ctx, a);
  _roundRectPath(ctx, x, y, w, h, _num(a.rx, 0));
  if (fillStyle) { ctx.fillStyle = fillStyle; ctx.fill(); }
  if (hasStroke) { _applyStroke(ctx, a); ctx.stroke(); }
  ctx.restore();
}

function _drawPath(ctx, a, gradients) {
  const d = String(a.d || '').trim();
  if (!d) return;
  const hasStroke = !!(a.stroke && a.stroke !== 'none');
  const fillStyle = a.fill === 'none' ? null : _resolveFill(ctx, a.fill, gradients, null);
  if (!fillStyle && !hasStroke) return;
  const seg = d.match(/[MLZ]|-?\d*\.?\d+(?:[eE][+-]?\d+)?/g);
  if (!seg) return;
  ctx.save();
  _applyAlpha(ctx, a);
  if (fillStyle) ctx.fillStyle = fillStyle;
  if (hasStroke) _applyStroke(ctx, a);
  ctx.beginPath();
  let i = 0;
  while (i < seg.length) {
    const c = seg[i];
    if (c === 'M' || c === 'm') {
      const x = parseFloat(seg[i + 1]);
      const y = parseFloat(seg[i + 2]);
      if (!Number.isNaN(x) && !Number.isNaN(y)) ctx.moveTo(x, y);
      i += 3;
    } else if (c === 'L' || c === 'l') {
      const x = parseFloat(seg[i + 1]);
      const y = parseFloat(seg[i + 2]);
      if (!Number.isNaN(x) && !Number.isNaN(y)) ctx.lineTo(x, y);
      i += 3;
    } else if (c === 'Z' || c === 'z') {
      ctx.closePath();
      i += 1;
    } else {
      i += 1;
    }
  }
  if (fillStyle) ctx.fill();
  if (hasStroke) ctx.stroke();
  ctx.restore();
}

function _drawEllipse(ctx, a, gradients, isCircle) {
  const cx = _num(a.cx, 0);
  const cy = _num(a.cy, 0);
  const r = _num(a.r, 0);
  const rx = isCircle ? r : _num(a.rx, 0);
  const ry = isCircle ? r : _num(a.ry, 0);
  if (!rx || !ry) return;
  const hasStroke = !!(a.stroke && a.stroke !== 'none');
  const fillStyle = a.fill === 'none' ? null : _resolveFill(ctx, a.fill, gradients, { x: cx - rx, y: cy - ry, w: rx * 2, h: ry * 2 });
  if (!fillStyle && !hasStroke) return;
  ctx.save();
  _applyAlpha(ctx, a);
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  if (fillStyle) { ctx.fillStyle = fillStyle; ctx.fill(); }
  if (hasStroke) { _applyStroke(ctx, a); ctx.stroke(); }
  ctx.restore();
}

function _drawText(ctx, a, content, stacks) {
  const text = _unescape(content || '').trim();
  if (!text) return;
  const fs = _num(a['font-size'], 30);
  const hasStroke = !!(a.stroke && a.stroke !== 'none');
  const doFill = a.fill !== 'none'; // fill 缺失时按 SVG 规范以黑色绘制
  if (!hasStroke && !doFill) return;
  ctx.save();
  _applyAlpha(ctx, a);
  ctx.textAlign = a['text-anchor'] === 'middle' ? 'center'
    : (a['text-anchor'] === 'end' ? 'right' : 'left');
  ctx.textBaseline = 'alphabetic';
  // 栈式字体：首字体缺失时自动落到栈内下一款，末端通用族保证解析有效
  ctx.font = fs + 'px ' + _fontFamily(a['font-family'], stacks);
  const x = _num(a.x, 0);
  const y = _num(a.y, 0);
  if (hasStroke) {
    _applyStroke(ctx, a);
    ctx.strokeText(text, x, y);
  }
  if (doFill) {
    ctx.fillStyle = _resolveFill(ctx, a.fill, null, null);
    ctx.fillText(text, x, y);
  }
  ctx.restore();
}

/**
 * 将服务端海报底部的标语「每日一诗 · 静水流深」重定位到右上角、边框外。
 * 直接修改 text 指令的坐标属性（x/y/text-anchor），内容保持不变。
 * @param {object} cmd text 指令（含 a 属性对象与 content）
 */
function _relocateSlogan(cmd) {
  const text = _unescape(cmd.content || '').trim();
  if (text.indexOf('每日一诗') < 0 && text.indexOf('静水流深') < 0) return;
  cmd.a.x = '1044';        // 右对齐，与来源标记右边界一致（1080 - 36）
  cmd.a.y = '37';          // 顶部留 10px（字号 17，基线约 10 + 27）
  cmd.a['text-anchor'] = 'end';
  cmd.a['font-size'] = '17';
}

/**
 * 提取整幅色彩滤镜矩阵（对应服务端 defs 中 id="poster-fx" 的 feColorMatrix type="matrix"）。
 * 噪声滤镜 poster-grain 含 feTurbulence，会被跳过；返回 null 表示无需后处理。
 * @returns {number[]|null} 20 个矩阵系数（行主序）
 */
function _extractColorMatrix(svg) {
  const filterRe = /<filter[^>]*id="([\w-]+)"[^>]*>([\s\S]*?)<\/filter>/g;
  let m;
  while ((m = filterRe.exec(svg))) {
    if (/feTurbulence/.test(m[2])) continue; // 噪声/纹理层
    const cm = /<feColorMatrix[^>]*type="matrix"[^>]*values="([\d\s.+-]+)"/.exec(m[2]);
    if (!cm) continue;
    const nums = cm[1].trim().split(/\s+/).map(Number);
    if (nums.length === 20 && nums.every(Number.isFinite)) return nums;
  }
  return null;
}

/**
 * 对画布整幅像素做 feColorMatrix(type=matrix) 颜色变换（getImageData/putImageData，
 * 按设备物理像素处理，不受画布变换影响）。
 * @param {CanvasRenderingContext2D} ctx
 * @param {number[]} m 20 个系数
 */
function _applyColorMatrix(ctx, m) {
  const canvas = ctx.canvas;
  if (!canvas || typeof ctx.getImageData !== 'function' || !canvas.width || !canvas.height) return;
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  const len = d.length;
  for (let i = 0; i < len; i += 4) {
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];
    const a = d[i + 3];
    d[i] = m[0] * r + m[1] * g + m[2] * b + m[3] * a + m[4] * 255;
    d[i + 1] = m[5] * r + m[6] * g + m[7] * b + m[8] * a + m[9] * 255;
    d[i + 2] = m[10] * r + m[11] * g + m[12] * b + m[13] * a + m[14] * 255;
    d[i + 3] = m[15] * r + m[16] * g + m[17] * b + m[18] * a + m[19] * 255;
  }
  ctx.putImageData(img, 0, 0);
}

/**
 * 按指令在画布上重绘 SVG 场景（同步执行，画布须已按逻辑坐标系缩放就绪）
 * 若 svg 携带全图色彩滤镜（poster-fx），绘制完成后做一次像素级颜色矩阵后处理。
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} svg
 * @param {number} w 逻辑宽度
 * @param {number} h 逻辑高度
 * @param {object} [fontStacks] 字体栈覆盖（可选，key 与 FONT_STACKS 同）
 *        {kai, song, hei} —— 例如把设置页「正文字体」透传成 kai/song 栈，
 *        使在线诗画海报正文跟随用户偏好，风格与经典海报一致。
 */
function paintScene(ctx, svg, w, h, fontStacks) {
  // 统一各主题服务端印章颜色为昵称印章红（#B3272E）：
  //   #B23B2E（各主题「诗词」印 + ink「天地」印）、#C2452F（sunset「天地」印）、#C9A05C（night「天地」印）
  const normalizedSvg = String(svg || '')
    .replace(/#B23B2E/gi, '#B3272E')
    .replace(/#C2452F/gi, '#B3272E')
    .replace(/#C9A05C/gi, '#B3272E');
  const cmds = parseSvgCommands(normalizedSvg);
  // 局部字体栈：内置古风栈为底，外部覆盖按 key 合并
  const stacks = Object.assign({}, FONT_STACKS, fontStacks || {});
  const gradients = {};
  for (const c of cmds) {
    switch (c.k) {
      case 'grad':
        gradients[c.g.id] = c.g;
        break;
      case 'g':
        ctx.save();
        _applyGroup(ctx, c.a);
        break;
      case 'gEnd':
        ctx.restore();
        break;
      case 'rect':
        _drawRect(ctx, c.a, gradients, w, h);
        break;
      case 'path':
        _drawPath(ctx, c.a, gradients);
        break;
      case 'ellipse':
        _drawEllipse(ctx, c.a, gradients, false);
        break;
      case 'circle':
        _drawEllipse(ctx, c.a, gradients, true);
        break;
      case 'text':
        _relocateSlogan(c);
        _drawText(ctx, c.a, c.content, stacks);
        break;
      default:
        break;
    }
  }
  const fx = _extractColorMatrix(normalizedSvg);
  if (fx) _applyColorMatrix(ctx, fx);
}

module.exports = {
  parseSvgCommands,
  paintScene
};
