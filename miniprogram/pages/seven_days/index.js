// pages/seven_days/index.js - 连续学习7天打卡
// 数据：本地 storage 'study_days'（YYYYMMDD 字符串数组，去重排序），与首页预览同 key
const settings = require('../../utils/settings');

const STORAGE_KEY = 'study_days';
const MAX_DAYS = 60;

Page({
  data: {
    streak: 0,           // 连续学习天数
    todayDone: false,    // 今日是否已打卡
    week: [],            // 本周7天打卡状态
    history: [],         // 最近打卡记录
    fontFamilyClass: ''
  },

  onLoad() {
    settings.applyToPage(this);
  },

  onShow() {
    this._load();
  },

  _load() {
    const days = this._getDays();
    const doneSet = new Set(days);
    const today = this._todayKey();

    // 本周（周一~周日）
    const now = new Date();
    const dow = (now.getDay() + 6) % 7; // 周一=0
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dow);
    const labels = ['一', '二', '三', '四', '五', '六', '日'];
    const week = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
      const key = this._keyOf(d);
      week.push({
        key,
        label: labels[i],
        dayNum: String(d.getDate()),
        done: doneSet.has(key),
        today: key === today
      });
    }

    // 最近打卡记录（新→旧）
    const history = days.slice(-MAX_DAYS).reverse().map((k) => ({
      date: this._fmt(k),
      text: this._weekdayOf(k)
    }));

    this.setData({
      streak: this._calcStreak(doneSet, today),
      todayDone: doneSet.has(today),
      week,
      history
    });
  },

  /** 今日打卡 */
  checkIn() {
    if (this.data.todayDone) {
      wx.showToast({ title: '今天已打过卡啦', icon: 'none' });
      return;
    }
    const today = this._todayKey();
    const days = this._getDays();
    if (days.indexOf(today) < 0) {
      days.push(today);
      days.sort();
      try {
        wx.setStorageSync(STORAGE_KEY, days);
      } catch (e) {
        wx.showToast({ title: '打卡失败，请重试', icon: 'none' });
        return;
      }
    }
    try { wx.vibrateShort({ type: 'light' }); } catch (_) {}
    wx.showToast({ title: '打卡成功，继续加油！', icon: 'success' });
    this._load();
  },

  clearHistory() {
    if (!this.data.history.length) {
      wx.showToast({ title: '暂无打卡记录', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '清空打卡记录',
      content: '确定清空全部打卡记录？此操作不可恢复',
      confirmColor: '#8B2500',
      success: (res) => {
        if (res.confirm) {
          try {
            wx.setStorageSync(STORAGE_KEY, []);
            this._load();
            wx.showToast({ title: '已清空', icon: 'success' });
          } catch (e) {
            wx.showToast({ title: '操作失败', icon: 'none' });
          }
        }
      }
    });
  },

  _getDays() {
    try {
      const v = wx.getStorageSync(STORAGE_KEY);
      return Array.isArray(v) ? v : [];
    } catch (_) { return []; }
  },

  _todayKey() {
    return this._keyOf(new Date());
  },

  _keyOf(d) {
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  },

  /** 连续打卡天数：今天已打卡从今天起算，否则从昨天起算 */
  _calcStreak(doneSet, today) {
    let streak = 0;
    const cursor = new Date(Number(today.slice(0, 4)), Number(today.slice(4, 6)) - 1, Number(today.slice(6, 8)));
    if (!doneSet.has(today)) cursor.setDate(cursor.getDate() - 1);
    while (doneSet.has(this._keyOf(cursor))) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    }
    return streak;
  },

  _fmt(key) {
    return `${key.slice(0, 4)}年${Number(key.slice(4, 6))}月${Number(key.slice(6, 8))}日`;
  },

  _weekdayOf(key) {
    const d = new Date(Number(key.slice(0, 4)), Number(key.slice(4, 6)) - 1, Number(key.slice(6, 8)));
    return '周' + ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
  },

  // ── 分享 ──────────────────────────────
  onShareAppMessage() {
    return {
      title: this.data.streak > 0
        ? '我已连续学习' + this.data.streak + '天，一起来国文之学打卡吧！'
        : '连续学习7天 · 国文之学，日拱一卒功不唐捐',
      path: '/pages/seven_days/index'
    };
  },

  onShareTimeline() {
    return {
      title: '连续学习7天 · 国文之学，日拱一卒功不唐捐',
      query: 'from=timeline'
    };
  }
});
