// pages/history/index.js - 历史知识页
Page({
  data: {
    searchText: '',
    aiResult: '',
    isLoading: false,
    activeDynasty: 'tang',
    activeTitle: '唐朝',
    currentQuery: '',
    dynasties: [
      { id: 'xia', name: '夏商周', years: '前2070-前221' },
      { id: 'qin', name: '秦汉', years: '前221-220' },
      { id: 'weijin', name: '魏晋', years: '220-589' },
      { id: 'sui', name: '隋唐', years: '581-907' },
      { id: 'tang', name: '唐宋', years: '618-1279' },
      { id: 'yuan', name: '元明', years: '1271-1644' },
      { id: 'qing', name: '清代', years: '1636-1912' }
    ],
    dynastyEvents: {
      tang: [
        { id: 1, year: '618年', name: '唐朝建立', desc: '李渊称帝，建立唐朝，定都长安', color: '#FF6B35', figures: ['李渊', '李世民'] },
        { id: 2, year: '627年', name: '贞观之治', desc: '唐太宗李世民开创盛世，政治清明，经济繁荣', color: '#C4882E', figures: ['李世民', '魏征'] },
        { id: 3, year: '690年', name: '武则天称帝', desc: '中国历史上唯一正式称帝的女皇帝建立武周', color: '#9B8FD5', figures: ['武则天'] },
        { id: 4, year: '712年', name: '开元盛世', desc: '唐玄宗前期励精图治，唐朝国力达到鼎盛', color: '#43E97B', figures: ['唐玄宗', '姚崇'] },
        { id: 5, year: '755年', name: '安史之乱', desc: '安禄山、史思明叛乱，唐朝由盛转衰', color: '#FF8FA3', figures: ['安禄山', '杜甫'] },
        { id: 6, year: '907年', name: '唐朝灭亡', desc: '朱温称帝建立梁朝，唐朝结束，进入五代十国', color: '#8C7B61', figures: ['朱温'] }
      ]
    },
    timelineEvents: [],
    famousFigures: [
      { id: 1, name: '孔子', dynasty: '春秋', role: '儒家创始人', emoji: '📚', color: 'linear-gradient(135deg, #FF9A5C, #FF6B35)' },
      { id: 2, name: '李白', dynasty: '唐代', role: '诗仙', emoji: '🌙', color: 'linear-gradient(135deg, #667EEA, #764BA2)' },
      { id: 3, name: '杜甫', dynasty: '唐代', role: '诗圣', emoji: '📜', color: 'linear-gradient(135deg, #43E97B, #38F9D7)' },
      { id: 4, name: '苏轼', dynasty: '北宋', role: '文学家', emoji: '🍜', color: 'linear-gradient(135deg, #F093FB, #F5576C)' },
      { id: 5, name: '诸葛亮', dynasty: '三国', role: '政治家军事家', emoji: '🌟', color: 'linear-gradient(135deg, #5BC8F5, #1A9ED5)' },
      { id: 6, name: '武则天', dynasty: '唐代', role: '女皇帝', emoji: '👑', color: 'linear-gradient(135deg, #F7C948, #E8A710)' },
      { id: 7, name: '秦始皇', dynasty: '秦代', role: '千古一帝', emoji: '🏯', color: 'linear-gradient(135deg, #9B8FD5, #6B5BB5)' },
      { id: 8, name: '岳飞', dynasty: '南宋', role: '民族英雄', emoji: '⚔️', color: 'linear-gradient(135deg, #FF8FA3, #E05070)' }
    ],
    trivias: [
      { id: 1, title: '古代的科举考试有多难？', hint: '点击了解千年选才制度', icon: '📝' },
      { id: 2, title: '长城到底有多长？', hint: '探秘万里长城的修建历史', icon: '🏯' },
      { id: 3, title: '古代皇帝一天怎么过？', hint: '揭秘宫廷生活的真实面貌', icon: '👑' },
      { id: 4, title: '丝绸之路是怎么开辟的？', hint: '探索古代东西方文明交流', icon: '🐪' },
      { id: 5, title: '古代四大发明如何改变世界？', hint: '中国智慧对人类文明的贡献', icon: '🧭' }
    ]
  },

  onLoad: function () {
    this.loadDynastyEvents('tang');
  },

  loadDynastyEvents: function (dynasty) {
    const events = this.data.dynastyEvents[dynasty] || [];
    const dynastyNames = {
      xia: '夏商周', qin: '秦汉', weijin: '魏晋',
      sui: '隋唐', tang: '唐宋', yuan: '元明', qing: '清代'
    };
    this.setData({
      timelineEvents: events,
      activeTitle: dynastyNames[dynasty] || ''
    });
  },

  selectDynasty: function (e) {
    const id = e.currentTarget.dataset.id;
    const name = e.currentTarget.dataset.name;
    this.setData({ activeDynasty: id, aiResult: '', isLoading: false });
    
    if (this.data.dynastyEvents[id]) {
      this.loadDynastyEvents(id);
    } else {
      // 通过AI获取该朝代事件
      this.setData({ isLoading: true });
      wx.cloud.callFunction({
        name: 'guoxueAI',
        data: {
          type: 'history',
          text: `${name}时期的重大历史事件`
        }
      }).then(res => {
        if (res.result && res.result.success) {
          this.setData({
            aiResult: res.result.content,
            isLoading: false,
            currentQuery: `${name}时期的重大历史事件`
          });
        } else {
          this.setData({ isLoading: false });
        }
      }).catch(() => this.setData({ isLoading: false }));
    }
  },

  onSearch: function (e) {
    this.setData({ searchText: e.detail.value });
  },

  doSearch: function () {
    const text = this.data.searchText.trim();
    if (!text) return;
    this.setData({ isLoading: true, aiResult: '', currentQuery: text });
    
    wx.cloud.callFunction({
      name: 'guoxueAI',
      data: { type: 'history', text }
    }).then(res => {
      if (res.result && res.result.success) {
        this.setData({ aiResult: res.result.content, isLoading: false });
      } else {
        this.setData({ isLoading: false });
        wx.showToast({ title: '查询失败', icon: 'none' });
      }
    }).catch(() => {
      this.setData({ isLoading: false });
      wx.showToast({ title: '网络错误', icon: 'none' });
    });
  },

  closeResult: function () {
    this.setData({ aiResult: '', isLoading: false });
  },

  deepExplore: function () {
    const query = this.data.currentQuery || this.data.searchText;
    wx.navigateTo({
      url: `/pages/chat/index?topic=${encodeURIComponent(query)}`
    });
  },

  copyAiResult: function () {
    wx.setClipboardData({
      data: this.data.aiResult,
      success: () => wx.showToast({ title: '已复制', icon: 'success' })
    });
  },

  exploreEvent: function (e) {
    const event = e.currentTarget.dataset.event;
    this.setData({ isLoading: true, aiResult: '', currentQuery: event.name });
    
    wx.cloud.callFunction({
      name: 'guoxueAI',
      data: { type: 'history', text: `${event.name}（${event.year}）` }
    }).then(res => {
      if (res.result && res.result.success) {
        this.setData({ aiResult: res.result.content, isLoading: false });
      } else {
        this.setData({ isLoading: false });
      }
    }).catch(() => this.setData({ isLoading: false }));
    
    wx.pageScrollTo({ scrollTop: 200, duration: 300 });
  },

  exploreFigure: function (e) {
    const figure = e.currentTarget.dataset.figure;
    wx.navigateTo({
      url: `/pages/chat/index?topic=${encodeURIComponent(`请详细介绍${figure.dynasty}${figure.name}的生平事迹、主要贡献和历史评价`)}`
    });
  },

  exploreTrivia: function (e) {
    const trivia = e.currentTarget.dataset.trivia;
    wx.navigateTo({
      url: `/pages/chat/index?topic=${encodeURIComponent(trivia.title)}`
    });
  }
});
