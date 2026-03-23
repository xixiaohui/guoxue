/**
 * utils/constants.js - 全局常量配置
 * 生产级国学AI助手
 */

// ─── 云函数名称 ────────────────────────────────────
const CLOUD_FUNC = 'guoxueAI';

// ─── 变现相关常量 ────────────────────────────────────
const MONETIZE = {
  FREE_DAILY_LIMIT: 5,
  REWARDED_AD_ID: 'adunit-513a37c7d48cdf7f',
  BANNER_AD_ID: 'adunit-513a37c7d48cdf7f',
  VIP_PRICE_1MONTH: 9.9,
  VIP_PRICE_3MONTH: 24.9,
  VIP_PRICE_12MONTH: 79,
};

// ─── 本地存储键名 ────────────────────────────────────
const STORAGE_KEYS = {
  DAILY_PREFIX: 'daily_',
  DAILY_IDIOM_PREFIX: 'daily_idiom_',
  TRANSLATE_HISTORY: 'trans_history',
  CHAT_HISTORY: 'chat_history',
  FAVORITES_POEM: 'fav_poems',
  FAVORITES_IDIOM: 'fav_idioms',
  USER_PREFS: 'user_prefs',
  QUOTA_CACHE: 'quota_cache',
};

// ─── AI 请求类型 ────────────────────────────────────
const AI_TYPES = {
  CHAT: 'chat',
  TRANSLATE: 'translate',
  DAILY: 'daily',
  DAILY_IDIOM: 'daily_idiom',
  POEM: 'poem',
  IDIOM: 'idiom',
  HISTORY: 'history',
  SEARCH: 'search',
};

// ─── 翻译模式 ────────────────────────────────────
const TRANSLATE_MODES = {
  ANCIENT_TO_MODERN: 'ancient_to_modern',
  MODERN_TO_ANCIENT: 'modern_to_ancient',
};

// ─── Tab 页路径 ────────────────────────────────────
const TAB_PAGES = [
  '/pages/home/index',
  '/pages/chat/index',
  '/pages/translate/index',
  '/pages/classics/index',
  '/pages/history/index',
];

// ─── 主题色 ────────────────────────────────────
const THEME = {
  primary: '#8B2500',
  secondary: '#C4882E',
  background: '#FDF6E3',
  cardBg: '#FFFBF0',
  textPrimary: '#2C1810',
  textSecondary: '#6B5B45',
  divider: '#E8D5A3',
};

// ─── 全局默认兜底经典语录 ────────────────────────────────────
const FALLBACK_DAILY_LIST = [
  {
    quote: '天行健，君子以自强不息。',
    author: '《周易·乾卦》',
    translation: '天道运行刚健有力，君子应效法天道，奋发图强，永不懈怠。',
    analysis: '以天象喻人道，鼓励人们积极进取，不向困难低头。',
    insight: '每天进步一点点，积累成就非凡的人生。'
  },
  {
    quote: '知之者不如好之者，好之者不如乐之者。',
    author: '孔子·《论语·雍也》',
    translation: '了解它的人不如喜爱它的人，喜爱它的人不如以它为乐的人。',
    analysis: '兴趣是最好的老师，达到"乐之"的境界，学习才能持久高效。',
    insight: '找到让自己快乐的事并为之努力，这才是真正的成功之道。'
  },
  {
    quote: '不积跬步，无以至千里；不积小流，无以成江海。',
    author: '荀子·《劝学》',
    translation: '不积累一步半步，就无法走到千里之外；不积累细小的水流，就无法汇成江河大海。',
    analysis: '强调积累的重要性，任何伟大的成就都来自日积月累的努力。',
    insight: '今日之事，今日完成。点滴积累，铸就不凡。'
  },
  {
    quote: '路漫漫其修远兮，吾将上下而求索。',
    author: '屈原·《离骚》',
    translation: '前方的道路漫长而遥远，我将不断地上下求索探寻真理。',
    analysis: '表达了诗人不屈不挠、追求真理的坚定意志和爱国情怀。',
    insight: '坚持探索，永不放弃，是成就伟大事业的根本。'
  },
  {
    quote: '己所不欲，勿施于人。',
    author: '孔子·《论语·颜渊》',
    translation: '自己不希望遭受的事情，不要施加给别人。',
    analysis: '孔子"仁"学的核心原则之一，是人际关系的黄金法则。',
    insight: '推己及人，换位思考，是建立和谐关系的基础。'
  },
  {
    quote: '读书破万卷，下笔如有神。',
    author: '杜甫·《奉赠韦左丞丈二十二韵》',
    translation: '读书读了成千上万卷，写起文章来就好像有神助一样。',
    analysis: '强调博览群书对写作的重要性，读书与实践相结合方能文思泉涌。',
    insight: '多读书，多积累，知识会在关键时刻为你所用。'
  },
  {
    quote: '人生自古谁无死，留取丹心照汗青。',
    author: '文天祥·《过零丁洋》',
    translation: '自古以来，人终免不了一死，但死要死得有价值，留下这颗赤诚的心，永照史册。',
    analysis: '表现了诗人慷慨赴死、以身殉国的崇高精神，是民族气节的千古绝唱。',
    insight: '人生在世，要活得有意义，做有价值的事，留下有价值的印记。'
  }
];

// ─── 默认成语兜底 ────────────────────────────────────
const FALLBACK_IDIOM = {
  word: '一鸣惊人',
  pinyin: 'yī míng jīng rén',
  brief: '比喻平时没有突出的表现，一下子做出惊人的成绩',
  origin: '《史记·滑稽列传》',
  story: '楚庄王即位三年，不发号令，大夫伍举进谏。庄王说："三年不鸣，一鸣惊人；三年不飞，一飞冲天。"后果然大举改革，成就霸业。',
  example: '他平时沉默寡言，没想到这次演讲竟然一鸣惊人，震惊全场。',
  synonym: '一举成名、脱颖而出',
  antonym: '默默无闻、无声无息'
};

module.exports = {
  CLOUD_FUNC,
  MONETIZE,
  STORAGE_KEYS,
  AI_TYPES,
  TRANSLATE_MODES,
  TAB_PAGES,
  THEME,
  FALLBACK_DAILY_LIST,
  FALLBACK_IDIOM,
};
