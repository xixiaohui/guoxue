// pages/home/index.js - 国学AI助手首页
const app = getApp();

Page({
  data: {
    dailyLoading: true,
    dailyClassic: {
      quote: '',
      author: '',
      analysis: '',
      insight: ''
    },
    hotTopics: [
      '李白最著名的诗',
      '论语十则',
      '孙子兵法精华',
      '道德经的智慧',
      '苏轼的一生',
      '唐诗宋词区别',
      '四书五经是什么',
      '中国古代科举制度'
    ],
    categories: [
      {
        id: 1,
        name: '诗词歌赋',
        desc: '唐诗宋词，韵律之美',
        icon: '📜',
        bg: 'linear-gradient(135deg, #FF9A5C, #FF6B35)',
        url: '/pages/classics/index',
        type: 'poem'
      },
      {
        id: 2,
        name: '经史子集',
        desc: '四部典籍，学问源流',
        icon: '📚',
        bg: 'linear-gradient(135deg, #67C5A5, #2E8B6A)',
        url: '/pages/classics/index',
        type: 'classics'
      },
      {
        id: 3,
        name: '成语典故',
        desc: '字里乾坤，故事传承',
        icon: '🏮',
        bg: 'linear-gradient(135deg, #F7C948, #E8A710)',
        url: '/pages/idiom/index',
        type: 'idiom'
      },
      {
        id: 4,
        name: '历史文化',
        desc: '朝代更迭，人文风华',
        icon: '🏯',
        bg: 'linear-gradient(135deg, #9B8FD5, #6B5BB5)',
        url: '/pages/history/index',
        type: 'history'
      },
      {
        id: 5,
        name: '诸子百家',
        desc: '百家争鸣，思想精华',
        icon: '⛩️',
        bg: 'linear-gradient(135deg, #FF8FA3, #E05070)',
        url: '/pages/chat/index',
        type: 'philosophy'
      },
      {
        id: 6,
        name: '书法艺术',
        desc: '笔墨纸砚，文人雅韵',
        icon: '🖌️',
        bg: 'linear-gradient(135deg, #5BC8F5, #1A9ED5)',
        url: '/pages/chat/index',
        type: 'calligraphy'
      }
    ]
  },

  onLoad: function () {
    this.loadDailyClassic();
  },

  onShow: function () {
    // 页面显示时刷新
  },

  onPullDownRefresh: function () {
    this.loadDailyClassic();
    wx.stopPullDownRefresh();
  },

  // 加载每日经典
  loadDailyClassic: function () {
    this.setData({ dailyLoading: true });
    
    wx.cloud.callFunction({
      name: 'guoxueAI',
      data: { type: 'daily' }
    }).then(res => {
      if (res.result && res.result.success) {
        const rawText = res.result.daily;
        const parsed = this.parseDailyClassic(rawText);
        this.setData({
          dailyClassic: parsed,
          dailyLoading: false
        });
      } else {
        this.setDefaultDaily();
      }
    }).catch(err => {
      console.error('加载每日经典失败:', err);
      this.setDefaultDaily();
    });
  },

  // 解析每日经典文本
  parseDailyClassic: function (text) {
    const result = {
      quote: '',
      author: '',
      analysis: '',
      insight: ''
    };

    try {
      // 提取今日经典
      const quoteMatch = text.match(/【今日经典】\s*([\s\S]*?)(?=【|$)/);
      if (quoteMatch) result.quote = quoteMatch[1].trim();
      
      // 提取作者
      const authorMatch = text.match(/【作者朝代】\s*([\s\S]*?)(?=【|$)/);
      if (authorMatch) result.author = authorMatch[1].trim();
      
      // 提取赏析
      const analysisMatch = text.match(/【白话赏析】\s*([\s\S]*?)(?=【|$)/);
      if (analysisMatch) result.analysis = analysisMatch[1].trim();
      
      // 提取启示
      const insightMatch = text.match(/【今日启示】\s*([\s\S]*?)(?=【|$)/);
      if (insightMatch) result.insight = insightMatch[1].trim();
    } catch (e) {
      result.quote = text.substring(0, 100);
    }

    return result;
  },

  // 设置默认每日经典（当AI不可用时）
  setDefaultDaily: function () {
    const defaults = [
      {
        quote: '学而时习之，不亦说乎？有朋自远方来，不亦乐乎？',
        author: '孔子 · 《论语》',
        analysis: '学习了知识，时常复习，不是很快乐的事吗？有志同道合的朋友从远方来，不是很令人高兴的事吗？',
        insight: '学习贵在坚持与反复，知识在温故知新中得以深化，友情在志同道合中弥足珍贵。'
      },
      {
        quote: '天行健，君子以自强不息；地势坤，君子以厚德载物。',
        author: '《周易》',
        analysis: '天道运行刚健有力，君子应当效法天道，自强不息；大地广博深厚，君子应当效法大地，厚德载物。',
        insight: '人生如行路，需以天地为师，既有自强之志，又有宽厚之德。'
      },
      {
        quote: '知之者不如好之者，好之者不如乐之者。',
        author: '孔子 · 《论语》',
        analysis: '懂得它的人不如喜欢它的人，喜欢它的人不如以它为乐的人。说明兴趣是最好的老师。',
        insight: '做任何事情，若能达到乐在其中的境界，必能事半功倍，成就卓越。'
      }
    ];
    
    const random = defaults[Math.floor(Math.random() * defaults.length)];
    this.setData({
      dailyClassic: random,
      dailyLoading: false
    });
  },

  // 刷新每日经典
  refreshDaily: function () {
    this.loadDailyClassic();
  },

  // 跳转到AI对话
  goToChat: function () {
    wx.switchTab({
      url: '/pages/chat/index'
    });
  },

  // 快速开始对话
  goQuickChat: function (e) {
    const topic = e.currentTarget.dataset.topic;
    wx.navigateTo({
      url: `/pages/chat/index?topic=${encodeURIComponent(topic)}`
    });
  },

  // 跳转到指定页面
  goPage: function (e) {
    const url = e.currentTarget.dataset.url;
    // 判断是否是tab页面
    const tabPages = ['/pages/home/index', '/pages/chat/index', '/pages/translate/index', '/pages/classics/index', '/pages/history/index'];
    if (tabPages.includes(url)) {
      wx.switchTab({ url });
    } else {
      wx.navigateTo({ url });
    }
  },

  // 跳转到分类
  goCategory: function (e) {
    const category = e.currentTarget.dataset.category;
    const tabPages = ['/pages/home/index', '/pages/chat/index', '/pages/translate/index', '/pages/classics/index', '/pages/history/index'];
    if (tabPages.includes(category.url)) {
      wx.switchTab({ url: category.url });
    } else {
      wx.navigateTo({ url: category.url });
    }
  }
});
