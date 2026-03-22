// pages/classics/index.js - 诗词典籍页
Page({
  data: {
    searchText: '',
    searchResult: '',
    isSearching: false,
    activeTab: 'poem',
    showModal: false,
    currentPoem: {},
    poemLoading: false,
    tabs: [
      { id: 'poem', name: '诗词' },
      { id: 'classics', name: '典籍' },
      { id: 'tang', name: '唐诗' },
      { id: 'song', name: '宋词' },
      { id: 'yuan', name: '元曲' }
    ],
    featuredPoems: [
      {
        id: 1,
        title: '静夜思',
        author: '李白',
        dynasty: '唐',
        preview: '床前明月光，疑是地上霜',
        content: '床前明月光，疑是地上霜。\n举头望明月，低头思故乡。',
        color: 'linear-gradient(135deg, #667EEA, #764BA2)'
      },
      {
        id: 2,
        title: '水调歌头',
        author: '苏轼',
        dynasty: '宋',
        preview: '明月几时有，把酒问青天',
        content: '明月几时有，把酒问青天。不知天上宫阙，今夕是何年。\n我欲乘风归去，又恐琼楼玉宇，高处不胜寒。\n起舞弄清影，何似在人间。\n转朱阁，低绮户，照无眠。\n不应有恨，何事长向别时圆？\n人有悲欢离合，月有阴晴圆缺，此事古难全。\n但愿人长久，千里共婵娟。',
        color: 'linear-gradient(135deg, #F093FB, #F5576C)'
      },
      {
        id: 3,
        title: '登鹳雀楼',
        author: '王之涣',
        dynasty: '唐',
        preview: '白日依山尽，黄河入海流',
        content: '白日依山尽，黄河入海流。\n欲穷千里目，更上一层楼。',
        color: 'linear-gradient(135deg, #4FACFE, #00F2FE)'
      },
      {
        id: 4,
        title: '春晓',
        author: '孟浩然',
        dynasty: '唐',
        preview: '春眠不觉晓，处处闻啼鸟',
        content: '春眠不觉晓，处处闻啼鸟。\n夜来风雨声，花落知多少。',
        color: 'linear-gradient(135deg, #43E97B, #38F9D7)'
      }
    ],
    poems: [
      {
        id: 1,
        title: '望岳',
        author: '杜甫',
        dynasty: '唐',
        preview: '会当凌绝顶，一览众山小',
        content: '岱宗夫如何？齐鲁青未了。\n造化钟神秀，阴阳割昏晓。\n荡胸生曾云，决眦入归鸟。\n会当凌绝顶，一览众山小。'
      },
      {
        id: 2,
        title: '将进酒',
        author: '李白',
        dynasty: '唐',
        preview: '君不见黄河之水天上来',
        content: '君不见黄河之水天上来，奔流到海不复回。\n君不见高堂明镜悲白发，朝如青丝暮成雪。\n人生得意须尽欢，莫使金樽空对月...'
      },
      {
        id: 3,
        title: '青玉案·元夕',
        author: '辛弃疾',
        dynasty: '宋',
        preview: '众里寻他千百度，蓦然回首',
        content: '东风夜放花千树，更吹落、星如雨。宝马雕车香满路。凤箫声动，玉壶光转，一夜鱼龙舞。\n蛾儿雪柳黄金缕，笑语盈盈暗香去。众里寻他千百度，蓦然回首，那人却在，灯火阑珊处。'
      },
      {
        id: 4,
        title: '如梦令',
        author: '李清照',
        dynasty: '宋',
        preview: '常记溪亭日暮，沉醉不知归路',
        content: '常记溪亭日暮，沉醉不知归路。\n兴尽晚回舟，误入藕花深处。\n争渡，争渡，惊起一滩鸥鹭。'
      },
      {
        id: 5,
        title: '出塞',
        author: '王昌龄',
        dynasty: '唐',
        preview: '秦时明月汉时关，万里长征人未还',
        content: '秦时明月汉时关，万里长征人未还。\n但使龙城飞将在，不教胡马度阴山。'
      },
      {
        id: 6,
        title: '虞美人',
        author: '李煜',
        dynasty: '五代',
        preview: '问君能有几多愁，恰似一江春水向东流',
        content: '春花秋月何时了？往事知多少。小楼昨夜又东风，故国不堪回首月明中。\n雕栏玉砌应犹在，只是朱颜改。问君能有几多愁？恰似一江春水向东流。'
      }
    ],
    classicBooks: [
      {
        id: 1,
        name: '论语',
        desc: '孔子及其弟子言行集',
        era: '春秋',
        icon: '📚',
        color: 'linear-gradient(135deg, #FF9A5C, #FF6B35)'
      },
      {
        id: 2,
        name: '道德经',
        desc: '老子的哲学著作',
        era: '春秋',
        icon: '☯️',
        color: 'linear-gradient(135deg, #67C5A5, #2E8B6A)'
      },
      {
        id: 3,
        name: '孙子兵法',
        desc: '古代军事经典',
        era: '春秋',
        icon: '⚔️',
        color: 'linear-gradient(135deg, #F7C948, #E8A710)'
      },
      {
        id: 4,
        name: '易经',
        desc: '中华文化的源头',
        era: '西周',
        icon: '☰',
        color: 'linear-gradient(135deg, #9B8FD5, #6B5BB5)'
      },
      {
        id: 5,
        name: '诗经',
        desc: '中国最早的诗歌总集',
        era: '西周',
        icon: '📜',
        color: 'linear-gradient(135deg, #FF8FA3, #E05070)'
      },
      {
        id: 6,
        name: '孟子',
        desc: '儒家经典著作',
        era: '战国',
        icon: '👁️',
        color: 'linear-gradient(135deg, #5BC8F5, #1A9ED5)'
      }
    ]
  },

  onSearchInput: function (e) {
    this.setData({ searchText: e.detail.value });
  },

  // 搜索
  doSearch: function () {
    const text = this.data.searchText.trim();
    if (!text) return;
    
    this.setData({ isSearching: true, searchResult: '' });
    
    wx.cloud.callFunction({
      name: 'guoxueAI',
      data: {
        type: 'poem',
        text: text
      }
    }).then(res => {
      if (res.result && res.result.success) {
        this.setData({
          searchResult: res.result.analysis,
          isSearching: false
        });
      } else {
        this.setData({ isSearching: false });
        wx.showToast({ title: '搜索失败，请重试', icon: 'none' });
      }
    }).catch(err => {
      this.setData({ isSearching: false });
      wx.showToast({ title: '网络错误', icon: 'none' });
    });
  },

  closeSearch: function () {
    this.setData({ searchResult: '', isSearching: false, searchText: '' });
  },

  // 切换Tab
  switchTab: function (e) {
    this.setData({ activeTab: e.currentTarget.dataset.id });
  },

  // 打开诗词
  openPoem: function (e) {
    const poem = e.currentTarget.dataset.poem;
    this.setData({ showModal: true, currentPoem: poem, poemLoading: false });
  },

  // 关闭弹窗
  closeModal: function () {
    this.setData({ showModal: false, currentPoem: {} });
  },

  stopProp: function () {},

  // 分析诗词
  analyzePoem: function () {
    const poem = this.data.currentPoem;
    if (poem.analysis) return;
    
    this.setData({ poemLoading: true });
    
    wx.cloud.callFunction({
      name: 'guoxueAI',
      data: {
        type: 'poem',
        text: `${poem.title} - ${poem.author}\n${poem.content}`
      }
    }).then(res => {
      if (res.result && res.result.success) {
        const currentPoem = { ...this.data.currentPoem, analysis: res.result.analysis };
        this.setData({ currentPoem, poemLoading: false });
      } else {
        this.setData({ poemLoading: false });
      }
    }).catch(() => {
      this.setData({ poemLoading: false });
    });
  },

  // 在聊天中继续探讨
  askAboutPoem: function () {
    const poem = this.data.currentPoem;
    this.setData({ showModal: false });
    wx.navigateTo({
      url: `/pages/chat/index?topic=${encodeURIComponent(`请详细讲解"${poem.title}"这首诗`)}`
    });
  },

  continueInChat: function () {
    const query = this.data.searchText;
    this.setData({ showModal: false });
    wx.navigateTo({
      url: `/pages/chat/index?topic=${encodeURIComponent(query)}`
    });
  },

  copySearchResult: function () {
    wx.setClipboardData({
      data: this.data.searchResult,
      success: () => wx.showToast({ title: '已复制', icon: 'success' })
    });
  },

  // 打开典籍
  openClassic: function (e) {
    const book = e.currentTarget.dataset.book;
    wx.navigateTo({
      url: `/pages/chat/index?topic=${encodeURIComponent(`请介绍《${book.name}》的主要内容、核心思想和历史价值`)}`
    });
  }
});
