// pages/idiom/index.js - 成语故事页
Page({
  data: {
    searchText: '',
    currentIdiom: '',
    result: '',
    isLoading: false,
    dailyIdiomIndex: 0,
    dailyIdiom: {
      word: '一鸣惊人',
      pinyin: 'yī míng jīng rén',
      brief: '比喻平时没有突出的表现，一下子做出惊人的成绩'
    },
    knownIdioms: [
      { word: '一鸣惊人', pinyin: 'yī míng jīng rén', brief: '比喻平时没有表现，突然做出惊人成绩', category: '励志' },
      { word: '画龙点睛', pinyin: 'huà lóng diǎn jīng', brief: '比喻在关键地方加上精彩的一笔', category: '艺术' },
      { word: '掩耳盗铃', pinyin: 'yǎn ěr dào líng', brief: '比喻自欺欺人', category: '讽刺' },
      { word: '叶公好龙', pinyin: 'yè gōng hào lóng', brief: '比喻说是爱好某事物，其实并不真爱好', category: '讽刺' },
      { word: '卧薪尝胆', pinyin: 'wò xīn cháng dǎn', brief: '比喻刻苦自励，发愤图强', category: '励志' },
      { word: '亡羊补牢', pinyin: 'wáng yáng bǔ láo', brief: '比喻出了问题，及时纠正，还不算晚', category: '哲理' },
      { word: '守株待兔', pinyin: 'shǒu zhū dài tù', brief: '比喻不主动努力，而存侥幸心理', category: '哲理' },
      { word: '刻舟求剑', pinyin: 'kè zhōu qiú jiàn', brief: '比喻不懂变通，拘泥守旧', category: '哲理' }
    ],
    idiomCategories: [
      { id: 1, name: '励志奋进', icon: '🔥', count: 128, bg: 'linear-gradient(135deg, #FF9A5C, #FF6B35)', topic: '励志奋进类成语' },
      { id: 2, name: '历史典故', icon: '🏯', count: 256, bg: 'linear-gradient(135deg, #9B8FD5, #6B5BB5)', topic: '来自历史典故的成语' },
      { id: 3, name: '自然风物', icon: '🌿', count: 96, bg: 'linear-gradient(135deg, #43E97B, #38F9D7)', topic: '描写自然风物的成语' },
      { id: 4, name: '人情世故', icon: '👥', count: 180, bg: 'linear-gradient(135deg, #5BC8F5, #1A9ED5)', topic: '描写人情世故的成语' },
      { id: 5, name: '品德修养', icon: '🌸', count: 144, bg: 'linear-gradient(135deg, #FF8FA3, #E05070)', topic: '描写品德修养的成语' },
      { id: 6, name: '战争军事', icon: '⚔️', count: 112, bg: 'linear-gradient(135deg, #F7C948, #E8A710)', topic: '来自战争军事的成语' }
    ],
    featuredIdioms: [
      { id: 1, word: '三人成虎', pinyin: 'sān rén chéng hǔ', brief: '谣言重复多次便会被信以为真', category: '警示' },
      { id: 2, word: '狐假虎威', pinyin: 'hú jiǎ hǔ wēi', brief: '比喻借助强者的权势来欺压他人', category: '讽刺' },
      { id: 3, word: '塞翁失马', pinyin: 'sài wēng shī mǎ', brief: '比喻坏事可以变成好事', category: '哲理' },
      { id: 4, word: '完璧归赵', pinyin: 'wán bì guī zhào', brief: '比喻把原物完好地归还原主', category: '历史' },
      { id: 5, word: '负荆请罪', pinyin: 'fù jīng qǐng zuì', brief: '主动向人认错道歉，请求责罚', category: '美德' },
      { id: 6, word: '破釜沉舟', pinyin: 'pò fǔ chén zhōu', brief: '比喻下定决心，不顾一切干到底', category: '励志' }
    ]
  },

  onLoad: function () {
    // 随机选择每日成语
    this.pickDailyIdiom();
  },

  pickDailyIdiom: function () {
    const idioms = this.data.knownIdioms;
    const idx = Math.floor(Math.random() * idioms.length);
    this.setData({ dailyIdiom: idioms[idx] });
  },

  changeDailyIdiom: function () {
    this.pickDailyIdiom();
  },

  onSearchInput: function (e) {
    this.setData({ searchText: e.detail.value });
  },

  // 搜索成语
  searchIdiom: function () {
    const text = this.data.searchText.trim();
    if (!text) return;
    this.lookupIdiomByWord(text);
  },

  // 通过点击查询成语
  lookupIdiom: function (e) {
    const idiom = e.currentTarget.dataset.idiom;
    this.lookupIdiomByWord(idiom);
  },

  lookupIdiomByWord: function (word) {
    this.setData({ 
      currentIdiom: word,
      result: '',
      isLoading: true 
    });
    
    // 滚动到结果区域
    wx.pageScrollTo({ scrollTop: 300, duration: 300 });
    
    wx.cloud.callFunction({
      name: 'guoxueAI',
      data: {
        type: 'idiom',
        text: word
      }
    }).then(res => {
      if (res.result && res.result.success) {
        this.setData({
          result: res.result.explanation,
          isLoading: false
        });
      } else {
        this.setData({ isLoading: false });
        wx.showToast({ title: '查询失败，请重试', icon: 'none' });
      }
    }).catch(() => {
      this.setData({ isLoading: false });
      wx.showToast({ title: '网络错误', icon: 'none' });
    });
  },

  // 复制结果
  copyResult: function () {
    wx.setClipboardData({
      data: this.data.result,
      success: () => wx.showToast({ title: '已复制', icon: 'success' })
    });
  },

  // 在聊天中探讨
  chatAboutIdiom: function () {
    const idiom = this.data.currentIdiom;
    wx.navigateTo({
      url: `/pages/chat/index?topic=${encodeURIComponent(`请讲述"${idiom}"的历史故事和文化内涵`)}`
    });
  },

  // 探索分类
  exploreCat: function (e) {
    const cat = e.currentTarget.dataset.cat;
    wx.navigateTo({
      url: `/pages/chat/index?topic=${encodeURIComponent(`请列举5个${cat.topic}，并分别解释含义`)}`
    });
  }
});
