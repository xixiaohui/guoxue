// pages/idiom/index.js - 成语故事页 v6.0（生产级，丰富内容，无AI问答跳转）
const api = require('../../utils/api');
const storage = require('../../utils/storage');
const { FALLBACK_IDIOM } = require('../../utils/constants');
const monetize = require('../../utils/monetize');

Page({
  data: {
    searchText: '',
    currentIdiom: '',
    result: '',
    resultSections: [],
    isLoading: false,
    dailyIdiomLoading: true,
    dailyIdiom: FALLBACK_IDIOM,
    isFavorited: false,
    activeCategory: 'all',

    // 常见成语数据（扩充）
    knownIdioms: [
      { word: '一鸣惊人', pinyin: 'yī míng jīng rén', brief: '比喻平时没有表现，突然做出惊人成绩', category: '励志' },
      { word: '画龙点睛', pinyin: 'huà lóng diǎn jīng', brief: '比喻在关键地方加上精彩的一笔', category: '艺术' },
      { word: '掩耳盗铃', pinyin: 'yǎn ěr dào líng', brief: '比喻自欺欺人', category: '讽刺' },
      { word: '叶公好龙', pinyin: 'yè gōng hào lóng', brief: '比喻表面爱好而实不真爱', category: '讽刺' },
      { word: '卧薪尝胆', pinyin: 'wò xīn cháng dǎn', brief: '比喻刻苦自励，发愤图强', category: '励志' },
      { word: '亡羊补牢', pinyin: 'wáng yáng bǔ láo', brief: '出了问题及时纠正，还不算晚', category: '哲理' },
      { word: '守株待兔', pinyin: 'shǒu zhū dài tù', brief: '比喻不主动努力，存侥幸心理', category: '哲理' },
      { word: '刻舟求剑', pinyin: 'kè zhōu qiú jiàn', brief: '比喻不懂变通，拘泥守旧', category: '哲理' },
      { word: '滥竽充数', pinyin: 'làn yú chōng shù', brief: '没有本领混在行家里凑数', category: '讽刺' },
      { word: '杯弓蛇影', pinyin: 'bēi gōng shé yǐng', brief: '形容疑神疑鬼，内心恐惧', category: '心理' },
      { word: '井底之蛙', pinyin: 'jǐng dǐ zhī wā', brief: '见识短浅，眼界狭窄', category: '哲理' },
      { word: '愚公移山', pinyin: 'yú gōng yí shān', brief: '比喻坚持不懈终能成功', category: '励志' }
    ],

    // 成语分类
    idiomCategories: [
      { id: 'all', name: '全部', icon: '📖', bg: 'linear-gradient(135deg,#9B8FD5,#6B5BB5)' },
      { id: '励志', name: '励志奋进', icon: '🔥', bg: 'linear-gradient(135deg,#FF9A5C,#FF6B35)', count: 128 },
      { id: '哲理', name: '处世哲理', icon: '🌿', bg: 'linear-gradient(135deg,#43E97B,#38F9D7)', count: 96 },
      { id: '讽刺', name: '警世讽刺', icon: '🎭', bg: 'linear-gradient(135deg,#F7C948,#E8A710)', count: 112 },
      { id: '历史', name: '历史典故', icon: '🏯', bg: 'linear-gradient(135deg,#667EEA,#764BA2)', count: 256 },
      { id: '艺术', name: '文学艺术', icon: '🎨', bg: 'linear-gradient(135deg,#F093FB,#F5576C)', count: 80 }
    ],

    // 精选成语故事（扩充）
    featuredIdioms: [
      { id: 1, word: '三人成虎', pinyin: 'sān rén chéng hǔ', brief: '谣言重复多次便会被信以为真', category: '警示',
        story: '战国时魏国大夫庞葱将去赵国做人质，临行前对魏王说：如果有人说街上有老虎，大王信吗？魏王说不信。若有两人呢？将信将疑。若三人说呢？魏王说那就信了。庞葱说：大街上明明没有虎，但三人传说就成了真，希望大王明察。' },
      { id: 2, word: '狐假虎威', pinyin: 'hú jiǎ hǔ wēi', brief: '借助强者权势欺压他人', category: '讽刺',
        story: '老虎抓住一只狐狸，狐狸说：天帝命我为百兽之王，你不可吃我。若不信，跟我走，看百兽见我是否逃跑。老虎信以为真，跟着狐狸走，百兽见老虎，纷纷逃跑。老虎以为百兽怕的是狐狸，实则是怕它自己。' },
      { id: 3, word: '塞翁失马', pinyin: 'sài wēng shī mǎ', brief: '祸福相依，坏事可变好事', category: '哲理',
        story: '边塞老翁的马走失，众人同情，老翁说：未必是坏事。后来马带回一群骏马，众人祝贺，老翁又说：未必是好事。儿子骑马摔断了腿，老翁说：未必是坏事。后来战争爆发，儿子因腿伤免于出征而保住了性命。' },
      { id: 4, word: '完璧归赵', pinyin: 'wán bì guī zhào', brief: '原物完好地归还原主', category: '历史',
        story: '战国时赵国得和氏璧，秦王想以十五城换取。赵派蔺相如出使秦国，蔺相如凭借智慧和勇气，识破秦王假意，据理力争，最终将和氏璧完好无损地带回赵国。' },
      { id: 5, word: '负荆请罪', pinyin: 'fù jīng qǐng zuì', brief: '主动认错道歉，请求责罚', category: '美德',
        story: '蔺相如屡次在廉颇面前退让，随从不解。蔺相如说：秦王不怕廉将军，但怕我们二人不和。我退让是为国家大局。廉颇听后深感惭愧，背着荆条到蔺相如家门前请罪，两人成为刎颈之交。' },
      { id: 6, word: '破釜沉舟', pinyin: 'pò fǔ chén zhōu', brief: '下定决心，不顾一切', category: '励志',
        story: '项羽渡河后，命士兵把锅砸碎，把船凿沉，每人只带三天口粮，表示必死决心。士兵们士气大振，以一当十，最终大败秦军，取得巨鹿之战的决定性胜利。' },
      { id: 7, word: '纸上谈兵', pinyin: 'zhǐ shàng tán bīng', brief: '空谈理论，不解决实际问题', category: '讽刺',
        story: '赵国名将赵奢之子赵括，熟读兵书，谈论兵法头头是道，其父赵奢却认为他只会纸上谈兵。后赵括替代廉颇领兵，轻率出击，在长平之战中被秦将白起大败，赵军四十万人被坑杀。' },
      { id: 8, word: '卧薪尝胆', pinyin: 'wò xīn cháng dǎn', brief: '刻苦自励，发愤图强', category: '励志',
        story: '春秋时越王勾践被吴王夫差打败，被迫入吴为奴三年。归国后，勾践睡在柴草上，每天悬挂苦胆于室，临睡前舔尝苦胆，提醒自己不忘耻辱。经过十年积累，终于兴兵伐吴，灭吴雪恨。' }
    ]
  },

  onLoad() {
    this._loadDailyIdiom();
    monetize.preloadRewardedAd();
    monetize.getQuotaStatus().then(s => {
      if (!s.isVip) this._bannerAd = monetize.createBannerAd();
    }).catch(() => {});
  },

  onUnload() {
    if (this._bannerAd) { try { this._bannerAd.destroy(); } catch (e) {} }
  },

  // ── 加载每日成语 ──────────────────────────────
  async _loadDailyIdiom(forceRefresh = false) {
    this.setData({ dailyIdiomLoading: true });
    try {
      const res = await api.getDailyIdiom(forceRefresh);
      const idiom = res.idiom;
      if (idiom && idiom.word) {
        this.setData({
          dailyIdiom: idiom,
          dailyIdiomLoading: false,
          isFavorited: storage.isIdiomFavorited(idiom.word)
        });
      } else {
        this.setData({ dailyIdiomLoading: false });
      }
    } catch (e) {
      const idioms = this.data.knownIdioms;
      const fb = idioms[new Date().getDate() % idioms.length];
      this.setData({ dailyIdiom: { ...FALLBACK_IDIOM, ...fb }, dailyIdiomLoading: false });
    }
  },

  changeDailyIdiom() {
    this._loadDailyIdiom(true);
  },

  // ── 分类筛选 ──────────────────────────────
  selectCategory(e) {
    const id = e.currentTarget.dataset.id;
    this.setData({ activeCategory: id });
  },

  // ── 搜索 ──────────────────────────────
  onSearchInput(e) {
    this.setData({ searchText: e.detail.value });
  },

  searchIdiom() {
    const text = this.data.searchText.trim();
    if (!text) return;
    this.lookupIdiomByWord(text);
  },

  lookupIdiom(e) {
    const idiom = e.currentTarget.dataset.idiom;
    this.lookupIdiomByWord(idiom);
  },

  lookupFeatured(e) {
    const word = e.currentTarget.dataset.word;
    this.lookupIdiomByWord(word);
  },

  // ── 核心查询（含配额检查）──────────────────────────────
  async lookupIdiomByWord(word) {
    if (!word || this.data.isLoading) return;

    let quotaResult;
    try {
      quotaResult = await monetize.consumeQuota();
    } catch (e) {
      quotaResult = { allowed: true, reason: 'fallback' };
    }

    if (!quotaResult.allowed) {
      const unlocked = await monetize.handleQuotaExceeded({
        onContinue: () => this._doLookupIdiom(word)
      });
      if (!unlocked) return;
      this._doLookupIdiom(word);
      return;
    }
    this._doLookupIdiom(word);
  },

  async _doLookupIdiom(word) {
    this.setData({ currentIdiom: word, result: '', resultSections: [], isLoading: true });
    wx.pageScrollTo({ selector: '.result-section', duration: 400 });

    try {
      const res = await api.explainIdiom(word);
      const text = res.explanation || '';
      const sections = this._parseSections(text);
      this.setData({ result: text, resultSections: sections, isLoading: false });
    } catch (e) {
      this.setData({ isLoading: false });
      api.showError(e.message || '查询失败，请重试');
    }
  },

  // ── 解析分段 ──────────────────────────────
  _parseSections(text) {
    const sections = [];
    const re = /【([^】]+)】\s*([\s\S]*?)(?=【|$)/g;
    let m;
    while ((m = re.exec(text)) !== null) {
      const content = m[2].trim();
      if (content) sections.push({ label: m[1], content });
    }
    if (sections.length === 0 && text.trim()) {
      sections.push({ label: '解释', content: text.trim() });
    }
    return sections;
  },

  // ── 收藏 ──────────────────────────────
  toggleFavorite() {
    const { currentIdiom, result } = this.data;
    if (!currentIdiom) return;
    const isFav = storage.toggleFavoriteIdiom({ word: currentIdiom, explanation: result, savedAt: Date.now() });
    this.setData({ isFavorited: isFav });
    wx.showToast({ title: isFav ? '已收藏' : '已取消收藏', icon: 'success', duration: 1200 });
  },

  // ── 复制 ──────────────────────────────
  copyResult() {
    wx.setClipboardData({
      data: this.data.result,
      success: () => wx.showToast({ title: '已复制', icon: 'success' })
    });
  },

  closeResult() {
    this.setData({ result: '', resultSections: [], currentIdiom: '', isLoading: false });
  },

  // ── 探索每日成语 ──────────────────────────────
  lookupDailyIdiom() {
    const { dailyIdiom } = this.data;
    if (dailyIdiom && dailyIdiom.word) {
      this.lookupIdiomByWord(dailyIdiom.word);
    }
  },

  // ── 收藏每日成语 ──────────────────────────────
  toggleDailyFavorite() {
    const { dailyIdiom } = this.data;
    if (!dailyIdiom || !dailyIdiom.word) return;
    const isFav = storage.toggleFavoriteIdiom({ word: dailyIdiom.word, savedAt: Date.now() });
    this.setData({ isFavorited: isFav });
    wx.showToast({ title: isFav ? '已收藏' : '已取消收藏', icon: 'success', duration: 1200 });
  }
});
