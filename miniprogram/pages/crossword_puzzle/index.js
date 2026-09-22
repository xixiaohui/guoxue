// pages/crossword_puzzle/index.js - 诗词填字（纵横交叉）
//
// 玩法：横线取一句五言/七言，竖线取另一首诗中「共享同一个汉字」的句子交叉成网格；
// 交叉字预填锚定（古诗词忌重字，交叉点必须由两首不同的诗贡献），其余格子随机挖空，
// 玩家从底部候选字盘选字补全，填满后自动校验。
//
// 出题：优先 /poems/random?char=X 在线生成（无限关卡，已由飞花令验证该参数可用）；
//   零匹配会返回 HTTP 500 → catch 后换主题字重试，超出次数上限降级内置题库。
// 单页模式（朋友圈 scene 1154）：不做页面跳转、不渲染 open-type 按钮，仅保留本地对局。

const poetry = require('../../utils/poetryApi');
const settings = require('../../utils/settings');
const seo = require('../../utils/seo');
const landing = require('../../utils/landing');
const crosswordStore = require('../../utils/crossword');

// ─── 常量 ─────────────────────────────────────────────
// 常用主题字（保证 /poems/random?char=X 命中率）
const TOPIC_WORDS = ['月', '花', '风', '水', '山', '云', '春', '秋', '夜', '江', '雨', '雪', '柳', '日', '海', '人', '天', '白'];

// 在线出题重试上限（自然包含「换个主题字」），超出后降级离线题库
const MAX_ATTEMPTS = 6;
// 候选字盘容量
const CAND_SIZE = 12;
// 候选字不足时的补充字池（取常见诗词意象字）
const EXTRA_CHARS = ['风', '花', '雪', '月', '山', '水', '云', '雨', '天', '地', '江', '河', '日', '夜', '春', '秋', '人', '心', '鸟', '林', '霜', '露', '星', '烟', '舟', '海', '波', '梦'];

/**
 * 离线题库：两首含同一字的名句交叉对（word 为交叉字）。
 * 约束：两句均为纯汉字、长度 5-7，且各含有一个 word。
 */
const CROSS_LIB = [
  { word: '月', h: { text: '床前明月光', title: '静夜思', author: '李白', dynasty: '唐' }, v: { text: '月落乌啼霜满天', title: '枫桥夜泊', author: '张继', dynasty: '唐' } },
  { word: '花', h: { text: '花重锦官城', title: '春夜喜雨', author: '杜甫', dynasty: '唐' }, v: { text: '烟花三月下扬州', title: '黄鹤楼送孟浩然之广陵', author: '李白', dynasty: '唐' } },
  { word: '风', h: { text: '二月春风似剪刀', title: '咏柳', author: '贺知章', dynasty: '唐' }, v: { text: '夜来风雨声', title: '春晓', author: '孟浩然', dynasty: '唐' } },
  { word: '水', h: { text: '春江水暖鸭先知', title: '惠崇春江晚景', author: '苏轼', dynasty: '宋' }, v: { text: '桃花潭水深千尺', title: '赠汪伦', author: '李白', dynasty: '唐' } },
  { word: '山', h: { text: '千山鸟飞绝', title: '江雪', author: '柳宗元', dynasty: '唐' }, v: { text: '两岸青山相对出', title: '望天门山', author: '李白', dynasty: '唐' } },
  { word: '云', h: { text: '黄河远上白云间', title: '凉州词', author: '王之涣', dynasty: '唐' }, v: { text: '朝辞白帝彩云间', title: '早发白帝城', author: '李白', dynasty: '唐' } },
  { word: '春', h: { text: '春蚕到死丝方尽', title: '无题', author: '李商隐', dynasty: '唐' }, v: { text: '城春草木深', title: '春望', author: '杜甫', dynasty: '唐' } },
  { word: '秋', h: { text: '春花秋月何时了', title: '虞美人', author: '李煜', dynasty: '五代' }, v: { text: '自古逢秋悲寂寥', title: '秋词', author: '刘禹锡', dynasty: '唐' } },
  { word: '江', h: { text: '烟波江上使人愁', title: '黄鹤楼', author: '崔颢', dynasty: '唐' }, v: { text: '唯见长江天际流', title: '黄鹤楼送孟浩然之广陵', author: '李白', dynasty: '唐' } },
  { word: '雨', h: { text: '渭城朝雨浥轻尘', title: '送元二使安西', author: '王维', dynasty: '唐' }, v: { text: '昨夜雨疏风骤', title: '如梦令', author: '李清照', dynasty: '宋' } },
  { word: '雪', h: { text: '大雪满弓刀', title: '塞下曲', author: '卢纶', dynasty: '唐' }, v: { text: '风雪夜归人', title: '逢雪宿芙蓉山主人', author: '刘长卿', dynasty: '唐' } },
  { word: '人', h: { text: '路上行人欲断魂', title: '清明', author: '杜牧', dynasty: '唐' }, v: { text: '深林人不知', title: '竹里馆', author: '王维', dynasty: '唐' } },
  { word: '天', h: { text: '疑是银河落九天', title: '望庐山瀑布', author: '李白', dynasty: '唐' }, v: { text: '黄河之水天上来', title: '将进酒', author: '李白', dynasty: '唐' } },
  { word: '日', h: { text: '日照香炉生紫烟', title: '望庐山瀑布', author: '李白', dynasty: '唐' }, v: { text: '东边日出西边雨', title: '竹枝词', author: '刘禹锡', dynasty: '唐' } },
  { word: '柳', h: { text: '客舍青青柳色新', title: '送元二使安西', author: '王维', dynasty: '唐' }, v: { text: '两个黄鹂鸣翠柳', title: '绝句', author: '杜甫', dynasty: '唐' } },
  { word: '夜', h: { text: '二十四桥明月夜', title: '寄扬州韩绰判官', author: '杜牧', dynasty: '唐' }, v: { text: '昨夜星辰昨夜风', title: '无题', author: '李商隐', dynasty: '唐' } },
  { word: '海', h: { text: '海上生明月', title: '望月怀远', author: '张九龄', dynasty: '唐' }, v: { text: '曾经沧海难为水', title: '离思', author: '元稹', dynasty: '唐' } },
  { word: '白', h: { text: '白日依山尽', title: '登鹳雀楼', author: '王之涣', dynasty: '唐' }, v: { text: '朝辞白帝彩云间', title: '早发白帝城', author: '李白', dynasty: '唐' } },
  { word: '酒', h: { text: '葡萄美酒夜光杯', title: '凉州词', author: '王翰', dynasty: '唐' }, v: { text: '劝君更尽一杯酒', title: '送元二使安西', author: '王维', dynasty: '唐' } }
];

// ─── 工具函数 ─────────────────────────────────────────
function isPureChinese(s) {
  return /^[\u4e00-\u9fa5]+$/.test(s || '');
}

/** 按标点/换行切分为独立小句 */
function splitPhrases(content) {
  return String(content || '')
    .split(/[，。！？；：、,.!?;:·…—–~～“”‘’「」『』（）()《》〈〉\[\]【】\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** 挑一句适合做题目的小句：纯汉字、5-7 字、含主题字（优先取长句，网格更有玩味） */
function pickPhrase(content, word) {
  const hits = splitPhrases(content).filter(
    (p) => isPureChinese(p) && p.length >= 5 && p.length <= 7 && p.indexOf(word) >= 0
  );
  if (!hits.length) return '';
  hits.sort((a, b) => b.length - a.length);
  return hits[0];
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = a[i];
    a[i] = a[j];
    a[j] = t;
  }
  return a;
}

function fmtTime(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
}

/**
 * 构建网格：横线整行铺满（cols = 横句字数），竖线整列铺满（rows = 竖句字数），
 * 交叉点 = 横句第 hx 字 = 竖句第 vx 字，该格预填且不参与挖空。
 */
function buildCells(item, blankCount) {
  const hArr = Array.from(item.h.text);
  const vArr = Array.from(item.v.text);
  const hx = hArr.indexOf(item.word); // 交叉所在列
  const vx = vArr.indexOf(item.word); // 交叉所在行
  if (hx < 0 || vx < 0) return null;

  const rowCount = vArr.length;
  const colCount = hArr.length;
  const cells = [];
  for (let r = 0; r < rowCount; r++) {
    for (let c = 0; c < colCount; c++) {
      const onH = r === vx;
      const onV = c === hx;
      cells.push({
        i: r * colCount + c,
        r: r,
        c: c,
        // 非答题区（既不在横句也不在竖句上）没有字，仅占位保证网格完整
        ans: onH ? hArr[c] : (onV ? vArr[r] : ''),
        onH: onH,
        onV: onV,
        cross: onH && onV,
        void: !onH && !onV,
        blank: false,
        filled: '',
        ok: null,
        hint: false
      });
    }
  }

  // 挖空：只在「属于某一句」的格子里挑（交叉格除外），非答题区格子不可填
  const pool = shuffle(cells.filter((x) => (x.onH || x.onV) && !x.cross));
  const n = Math.min(blankCount, pool.length);
  pool.slice(0, n).forEach((cell) => { cell.blank = true; });

  return { cells: cells, rowCount: rowCount, colCount: colCount, vRow: vx, hCol: hx, blankCount: n };
}

/** 按当前选中格与方向计算整格的渲染视图 */
function buildGrid(cells, rowCount, colCount, vRow, hCol, activeIdx, dir) {
  const grid = [];
  for (let r = 0; r < rowCount; r++) {
    const items = [];
    for (let c = 0; c < colCount; c++) {
      const cell = cells[r * colCount + c];
      const cls = [];
      if (cell.void) {
        cls.push('is-void');
      } else if (cell.cross) cls.push('is-cross');
      else if (cell.blank) cls.push('is-blank');
      else cls.push('is-given');
      if (cell.hint) cls.push('is-hint');
      if (cell.ok === true) cls.push('is-ok');
      if (cell.ok === false) cls.push('is-wrong');
      const inWord = dir === 'h' ? cell.onH : cell.onV;
      if (inWord) cls.push('is-word');
      if (cell.i === activeIdx) cls.push('is-active');

      const tags = [];
      if (r === vRow && c === 0) tags.push('1');
      if (r === 0 && c === hCol) tags.push('2');

      items.push({
        i: cell.i,
        cls: cls.join(' '),
        tag: tags.join('·'),
        show: cell.void ? '' : (cell.blank ? (cell.filled || '') : cell.ans)
      });
    }
    grid.push({ rk: r, items: items });
  }
  return grid;
}

Page({
  data: {
    isSinglePage: false,

    level: 1,
    loading: true,
    error: '',
    source: '',            // online | offline
    word: '',
    rows: 0,
    cols: 0,
    gridWidth: 574,
    cells: [],
    grid: [],
    clues: { h: null, v: null },
    candidates: [],        // [{ k, ch, used }]
    activeIdx: -1,
    dir: 'h',
    blankCount: 0,
    filledCount: 0,
    hintCount: 0,
    wrongCount: 0,
    duration: 0,
    durationText: '00:00',
    shake: false,
    solved: false,
    result: { stars: 0, comment: '', durationText: '', hintCount: 0 },
    progress: { cleared: 0, totalStars: 0 }
  },

  onLoad(options) {
    this.setData({ isSinglePage: landing.isSinglePage() });

    // 分享落地：URL 带 level → 直接进关
    const lv = Number(landing.safeDecode((options && options.level) || '')) || 1;
    this.setData({ level: lv > 0 ? lv : 1, progress: crosswordStore.readProgress() });

    landing.setNavTitle('诗词填字');
    this._setupSeo();
    this._generate();
  },

  onShow() {
    settings.applyToPage(this);
  },

  onUnload() {
    this._stopTimer();
  },

  onHide() {
    this._stopTimer();
  },

  /** 搜一搜优化：填字游戏页上报关键词 */
  _setupSeo() {
    seo.reportPageInfo({
      title: '诗词填字 · 纵横填诗',
      navTitle: '诗词填字',
      keywords: seo.buildKeywords([
        '诗词填字', '填字游戏', '古诗词游戏', '诗词游戏', '诗词填空',
        '唐诗', '宋词', '古诗', '国学', '超然古诗词', '诗词'
      ]),
      description: '诗词填字——横线取一句诗、竖线取一句诗，共享一字交叉成格，补全千古名句。'
    });
  },

  // ── 出题 ────────────────────────────────
  /** 每关挖空数（难度递进） */
  _blankCountFor(level) {
    if (level <= 2) return 2;
    if (level <= 4) return 3;
    if (level <= 7) return 4;
    return 5;
  },

  async _generate() {
    this._stopTimer();
    this.setData({ loading: true, error: '', solved: false, shake: false, activeIdx: -1, filledCount: 0 });
    try {
      const item = await this._tryOnline();
      if (item) {
        this._applyPuzzle(item, 'online');
        return;
      }
      this._applyPuzzle(this._offlineItem(this.data.level), 'offline');
    } catch (e) {
      this.setData({ loading: false, error: '出题失败，请下拉重试' });
    }
  },

  /**
   * 在线出题：随机主题字 → 并发两首含该字的诗 → 各挑一句凑成交叉。
   * 古诗词忌重字，故交叉点必须来自两首不同的诗（两句文字不同即可）。
   */
  async _tryOnline() {
    const words = shuffle(TOPIC_WORDS);
    const limit = Math.min(words.length, MAX_ATTEMPTS);
    for (let i = 0; i < limit; i++) {
      const word = words[i];
      let pair = null;
      try {
        pair = await Promise.all([
          poetry.getRandomPoem({ char: word }),
          poetry.getRandomPoem({ char: word })
        ]);
      } catch (e) {
        pair = null; // 零匹配 500 / 断网：换下一个主题字
      }
      if (!pair) continue;
      const [p1, p2] = pair;
      if (!p1 || !p2 || !p1.content || !p2.content) continue;
      const ht = pickPhrase(p1.content, word);
      const vt = pickPhrase(p2.content, word);
      if (!ht || !vt || ht === vt) continue;
      return {
        word: word,
        h: { text: ht, title: p1.title || '', author: p1.author || '', dynasty: p1.dynasty || '' },
        v: { text: vt, title: p2.title || '', author: p2.author || '', dynasty: p2.dynasty || '' }
      };
    }
    return null;
  },

  /** 离线兜底：按关卡轮转选题，保证同一关连玩也不重复太快 */
  _offlineItem(level) {
    const idx = (level - 1 + Math.floor(Math.random() * CROSS_LIB.length)) % CROSS_LIB.length;
    return CROSS_LIB[idx];
  },

  _applyPuzzle(item, source) {
    const built = buildCells(item, this._blankCountFor(this.data.level));
    if (!built) {
      this.setData({ loading: false, error: '出题失败，请下拉重试' });
      return;
    }
    const candidates = this._buildCandidates(built.cells);
    this.setData({
      cells: built.cells,
      rows: built.rowCount,
      cols: built.colCount,
      // 格子 76rpx + 间距 6rpx，按实际列数算总宽，避免窄句居中偏移
      gridWidth: built.colCount * 82,
      source: source,
      word: item.word,
      clues: { h: item.h, v: item.v },
      candidates: candidates,
      blankCount: built.blankCount,
      hintCount: 0,
      wrongCount: 0,
      duration: 0,
      durationText: '00:00',
      loading: false,
      error: '',
      solved: false
    });
    this._commit(-1, 'h');
    this._startTimer();
  },

  /** 候选字盘：挖空的正确答案（含重复）+ 干扰字，凑满 CAND_SIZE 后打乱 */
  _buildCandidates(cells) {
    const answers = cells.filter((c) => c.blank).map((c) => c.ans);
    const used = answers.slice();
    const pool = [];
    cells.forEach((c) => { if (used.indexOf(c.ans) < 0) pool.push(c.ans); });
    shuffle(EXTRA_CHARS).forEach((ch) => { if (pool.indexOf(ch) < 0) pool.push(ch); });

    let pi = 0;
    while (used.length < CAND_SIZE && pi < pool.length) {
      used.push(pool[pi++]);
    }
    return shuffle(used).slice(0, CAND_SIZE).map((ch, i) => ({ k: i, ch: ch, used: false }));
  },

  // ── 状态提交 ─────────────────────────────
  /** 统一刷新网格视图与派生状态 */
  _commit(activeIdx, dir, extra) {
    const cells = this.data.cells;
    if (!cells.length) return;
    const filledCount = cells.filter((c) => c.blank && c.filled).length;
    const patch = Object.assign({
      grid: buildGrid(cells, this.data.rows, this.data.cols, this._vRow(), this._hCol(), activeIdx, dir),
      activeIdx: activeIdx,
      dir: dir,
      filledCount: filledCount,
      canErase: activeIdx >= 0 && !!cells[activeIdx] && cells[activeIdx].blank && !!cells[activeIdx].filled
    }, extra || {});
    this.setData(patch);
  },

  /** 交叉行（= 横句所在行）：取包含全部 onH 的行 */
  _vRow() {
    const c = this.data.cells.find((x) => x.onH);
    return c ? c.r : 0;
  },

  _hCol() {
    const c = this.data.cells.find((x) => x.onV);
    return c ? c.c : 0;
  },

  // ── 计时 ────────────────────────────────
  _startTimer() {
    this._stopTimer();
    this._tickStart = Date.now();
    this._timer = setInterval(() => {
      const sec = Math.floor((Date.now() - (this._tickStart || Date.now())) / 1000);
      this.setData({ duration: sec, durationText: fmtTime(sec) });
    }, 1000);
  },

  _stopTimer() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  },

  // ── 交互 ────────────────────────────────
  /** 点格子：选中；点交叉格则切换横/纵方向 */
  tapCell(e) {
    const i = Number(e.currentTarget.dataset.i);
    const cell = this.data.cells[i];
    if (!cell || cell.void) return; // 非答题区格子不可选中
    let dir = this.data.dir;
    if (cell.cross) {
      dir = dir === 'h' ? 'v' : 'h';
    } else {
      dir = cell.onH ? 'h' : 'v';
    }
    this._commit(i, dir);
  },

  /** 点题面条：定位到该方向的首个空格（或首个格子） */
  focusDir(e) {
    const dir = e.currentTarget.dataset.dir;
    const cells = this.data.cells;
    const list = cells.filter((c) => (dir === 'h' ? c.onH : c.onV));
    if (!list.length) return;
    const target = list.find((c) => c.blank && !c.filled) || list[0];
    this._commit(target.i, dir);
  },

  /** 点候选字：填入当前格；未选中时自动定位第一个空格 */
  pickChar(e) {
    const k = Number(e.currentTarget.dataset.k);
    const list = this.data.candidates.slice();
    const cand = list[k];
    if (!cand || cand.used) return;

    const cells = this.data.cells;
    let target = null;
    const active = cells[this.data.activeIdx];
    if (active && active.blank && !active.filled) {
      target = active;
    } else {
      target = cells.find((c) => c.blank && !c.filled) || null;
    }
    if (!target) return;

    cells[target.i].filled = cand.ch;
    cells[target.i].ok = null;
    list[k].used = true;

    // 自动跳到下一个空格（阅读顺序）
    const next = cells.find((c) => c.blank && !c.filled);
    const nextIdx = next ? next.i : target.i;
    const nextDir = next ? (next.onH ? 'h' : 'v') : this.data.dir;

    this.setData({ candidates: list });
    this._commit(nextIdx, nextDir);
    this._maybeVerify();
  },

  /** 擦除当前格填字（候选字回到字盘） */
  erase() {
    const idx = this.data.activeIdx;
    const cells = this.data.cells;
    const cell = cells[idx];
    if (!cell || !cell.blank || !cell.filled) return;
    const ch = cell.filled;
    cell.filled = '';
    cell.ok = null;
    cell.hint = false;

    const list = this.data.candidates.slice();
    const cand = list.find((c) => c.ch === ch && c.used);
    if (cand) cand.used = false;
    this.setData({ candidates: list });
    this._commit(idx, cell.onH ? 'h' : 'v');
  },

  /** 无限免费提示：补一个正确答案到当前/首个空格 */
  useHint() {
    const cells = this.data.cells;
    const active = cells[this.data.activeIdx];
    let target = null;
    if (active && active.blank && active.filled !== active.ans) target = active;
    if (!target) target = cells.find((c) => c.blank && c.filled !== c.ans) || null;
    if (!target) return;

    // 该字若已错误占用格子，先释放回字盘
    const list = this.data.candidates.slice();
    if (target.filled) {
      const prev = list.find((c) => c.ch === target.filled && c.used);
      if (prev) prev.used = false;
    }
    const cand = list.find((c) => c.ch === target.ans && !c.used);
    if (cand) cand.used = true;

    target.filled = target.ans;
    target.ok = null;
    target.hint = true;

    const next = cells.find((c) => c.blank && !c.filled);
    this.setData({ candidates: list, hintCount: this.data.hintCount + 1 });
    this._commit(next ? next.i : target.i, next ? (next.onH ? 'h' : 'v') : this.data.dir);
    this._maybeVerify();
  },

  /** 清空本关所有填字 */
  resetFills() {
    const cells = this.data.cells;
    cells.forEach((c) => {
      if (c.blank) {
        c.filled = '';
        c.ok = null;
        c.hint = false;
      }
    });
    const list = this.data.candidates.map((c) => ({ k: c.k, ch: c.ch, used: false }));
    this.setData({ candidates: list });
    const first = cells.find((c) => c.blank);
    this._commit(first ? first.i : -1, first ? (first.onH ? 'h' : 'v') : 'h');
  },

  /** 换一题：重新生成同关卡新题 */
  changeOne() {
    this._generate();
  },

  /** 填满后自动校验；全对则结算，有错则标红抖动 */
  _maybeVerify() {
    const cells = this.data.cells;
    const blanks = cells.filter((c) => c.blank);
    if (!blanks.length || blanks.some((c) => !c.filled)) return;

    let wrong = 0;
    blanks.forEach((c) => {
      if (c.filled === c.ans) c.ok = true;
      else {
        c.ok = false;
        wrong++;
      }
    });

    if (wrong > 0) {
      this.setData({ wrongCount: wrong, shake: true });
      setTimeout(() => this.setData({ shake: false }), 500);
      const first = blanks.find((c) => c.ok === false);
      this._commit(first ? first.i : -1, first ? (first.onH ? 'h' : 'v') : this.data.dir);
      wx.showToast({ title: '还有 ' + wrong + ' 处不对', icon: 'none' });
      return;
    }

    this._solve();
  },

  _solve() {
    this._stopTimer();
    const sec = Math.floor((Date.now() - (this._tickStart || Date.now())) / 1000);
    const stars = this.data.hintCount === 0 ? 3 : (this.data.hintCount <= 2 ? 2 : 1);
    const comment = stars === 3 ? '诗心通透' : (stars === 2 ? '才情不俗' : '勤学可嘉');
    const progress = crosswordStore.saveCleared(this.data.level, stars);
    this.setData({
      solved: true,
      duration: sec,
      durationText: fmtTime(sec),
      progress: progress,
      result: {
        stars: stars,
        comment: comment,
        durationText: fmtTime(sec),
        hintCount: this.data.hintCount
      }
    });
    this._commit(-1, 'h');
  },

  nextLevel() {
    const lv = this.data.level + 1;
    this.setData({ level: lv });
    this._generate();
  },

  replayLevel() {
    this.setData({ solved: false });
    this.resetFills();
    this._tickStart = Date.now();
    this._startTimer();
  },

  onPullDownRefresh() {
    this._generate();
    setTimeout(() => wx.stopPullDownRefresh(), 300);
  },

  // ── 分享 ────────────────────────────────
  onShareAppMessage() {
    return {
      title: '诗词填字 · 纵横交叉第 ' + this.data.level + ' 关，你能拿几颗星？',
      path: '/pages/crossword_puzzle/index?level=' + this.data.level
    };
  },

  onShareTimeline() {
    return {
      title: '诗词填字 · 纵横交叉，补全千古名句',
      query: 'level=' + this.data.level
    };
  }
});
