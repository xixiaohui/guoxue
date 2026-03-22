// pages/translate/index.js - 古文翻译页
Page({
  data: {
    mode: 'ancient_to_modern',
    inputText: '',
    result: '',
    isLoading: false,
    history: [],
    examples: {
      ancient_to_modern: [
        '学而时习之，不亦说乎',
        '天下兴亡，匹夫有责',
        '少壮不努力，老大徒伤悲',
        '己所不欲，勿施于人',
        '不患人之不己知，患不知人也'
      ],
      modern_to_ancient: [
        '我今天很开心',
        '读书是很重要的事情',
        '春天来了，百花盛开',
        '朋友从远方来访',
        '努力学习才能成功'
      ]
    }
  },

  onLoad: function () {
    this.loadHistory();
  },

  // 切换翻译模式
  switchMode: function (e) {
    const mode = e.currentTarget.dataset.mode;
    this.setData({ mode, result: '', inputText: '' });
  },

  onInput: function (e) {
    this.setData({ inputText: e.detail.value });
  },

  clearInput: function () {
    this.setData({ inputText: '', result: '' });
  },

  // 使用示例
  useExample: function (e) {
    const text = e.currentTarget.dataset.text;
    this.setData({ inputText: text });
  },

  // 执行翻译
  doTranslate: function () {
    const text = this.data.inputText.trim();
    if (!text || this.data.isLoading) return;

    this.setData({ isLoading: true, result: '' });

    wx.cloud.callFunction({
      name: 'guoxueAI',
      data: {
        type: 'translate',
        text: text,
        mode: this.data.mode
      }
    }).then(res => {
      if (res.result && res.result.success) {
        const result = res.result.result;
        this.setData({ result, isLoading: false });
        this.saveHistory(text, result);
      } else {
        this.setData({ isLoading: false });
        wx.showToast({ title: '翻译失败，请重试', icon: 'none' });
      }
    }).catch(err => {
      console.error('翻译错误:', err);
      this.setData({ isLoading: false });
      wx.showToast({ title: '网络错误，请重试', icon: 'none' });
    });
  },

  // 复制结果
  copyResult: function () {
    wx.setClipboardData({
      data: this.data.result,
      success: () => {
        wx.showToast({ title: '已复制到剪贴板', icon: 'success' });
      }
    });
  },

  // 分享结果
  shareResult: function () {
    wx.showShareMenu({ withShareTicket: true });
  },

  // 保存翻译历史
  saveHistory: function (input, result) {
    const history = this.data.history;
    const now = new Date();
    const time = `${now.getMonth()+1}/${now.getDate()} ${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`;
    
    const newItem = {
      id: Date.now(),
      mode: this.data.mode,
      input: input.length > 30 ? input.substring(0, 30) + '...' : input,
      result,
      time
    };
    
    const newHistory = [newItem, ...history].slice(0, 10);
    this.setData({ history: newHistory });
    
    try {
      wx.setStorageSync('translateHistory', newHistory);
    } catch (e) {}
  },

  // 加载历史
  loadHistory: function () {
    try {
      const history = wx.getStorageSync('translateHistory') || [];
      this.setData({ history });
    } catch (e) {}
  },

  // 从历史加载
  loadFromHistory: function (e) {
    const item = e.currentTarget.dataset.item;
    this.setData({
      mode: item.mode,
      inputText: item.input,
      result: item.result
    });
    // 滚动到顶部
    wx.pageScrollTo({ scrollTop: 0, duration: 300 });
  },

  // 清除历史
  clearHistory: function () {
    wx.showModal({
      title: '清除历史',
      content: '确定清除所有翻译记录？',
      success: (res) => {
        if (res.confirm) {
          this.setData({ history: [] });
          wx.removeStorageSync('translateHistory');
        }
      }
    });
  }
});
