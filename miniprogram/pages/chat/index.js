// pages/chat/index.js - AI问答页
const app = getApp();

Page({
  data: {
    messages: [],
    inputText: '',
    isTyping: false,
    scrollToId: '',
    messageId: 0,
    suggestions: [],
    quickTopics: [
      '李白最著名的十首诗',
      '论语中的人生智慧',
      '孙子兵法核心思想',
      '唐宋八大家是谁',
      '道德经的核心理念',
      '科举制度的历史',
      '儒释道三家区别',
      '中国古代四大发明'
    ]
  },

  onLoad: function (options) {
    // 如果有预设话题，直接发送
    if (options.topic) {
      const topic = decodeURIComponent(options.topic);
      this.setData({ inputText: topic });
      setTimeout(() => {
        this.sendMessage();
      }, 500);
    }
  },

  onInput: function (e) {
    this.setData({ inputText: e.detail.value });
  },

  // 发送快捷话题
  sendQuickTopic: function (e) {
    const topic = e.currentTarget.dataset.topic;
    this.setData({ inputText: topic });
    this.sendMessage();
  },

  // 发送推荐问题
  sendSuggestion: function (e) {
    const text = e.currentTarget.dataset.text;
    this.setData({ inputText: text, suggestions: [] });
    this.sendMessage();
  },

  // 发送消息
  sendMessage: function () {
    const text = this.data.inputText.trim();
    if (!text || this.data.isTyping) return;

    const msgId = ++this.data.messageId;
    const userMsg = {
      id: msgId,
      role: 'user',
      content: text,
      time: this.getTime()
    };

    // 添加用户消息
    const messages = [...this.data.messages, userMsg];
    
    // 添加AI思考中占位
    const aiMsgId = ++this.data.messageId;
    const thinkingMsg = {
      id: aiMsgId,
      role: 'assistant',
      content: '',
      isTyping: true,
      time: ''
    };
    messages.push(thinkingMsg);

    this.setData({
      messages,
      inputText: '',
      isTyping: true,
      suggestions: [],
      scrollToId: `msg-${aiMsgId}`
    });

    // 调用AI云函数
    const chatMessages = this.data.messages
      .filter(m => !m.isTyping && m.id !== aiMsgId)
      .concat([userMsg])
      .map(m => ({ role: m.role, content: m.content }));

    wx.cloud.callFunction({
      name: 'guoxueAI',
      data: {
        type: 'chat',
        messages: chatMessages
      }
    }).then(res => {
      if (res.result && res.result.success) {
        this.updateAIMessage(aiMsgId, res.result.reply);
      } else {
        this.updateAIMessage(aiMsgId, '抱歉，我暂时无法回答，请稍后再试。');
      }
    }).catch(err => {
      console.error('AI对话错误:', err);
      this.updateAIMessage(aiMsgId, '网络连接出现问题，请检查网络后重试。');
    });
  },

  // 更新AI消息
  updateAIMessage: function (msgId, content) {
    const messages = this.data.messages.map(m => {
      if (m.id === msgId) {
        return {
          ...m,
          content,
          isTyping: false,
          time: this.getTime()
        };
      }
      return m;
    });

    this.setData({
      messages,
      isTyping: false,
      scrollToId: `msg-${msgId}`
    });

    // 生成相关推荐问题
    this.generateSuggestions(content);
  },

  // 生成相关推荐问题
  generateSuggestions: function (aiResponse) {
    const suggestions = [];
    
    // 根据回复内容智能推荐
    if (aiResponse.includes('诗') || aiResponse.includes('词')) {
      suggestions.push('这首诗的创作背景是什么？');
      suggestions.push('作者还有哪些著名作品？');
    }
    if (aiResponse.includes('成语')) {
      suggestions.push('这个成语的近义词有哪些？');
      suggestions.push('如何在句子中运用这个成语？');
    }
    if (aiResponse.includes('历史') || aiResponse.includes('朝代')) {
      suggestions.push('这段历史对后世有何影响？');
      suggestions.push('同时期还有哪些重要事件？');
    }
    
    // 通用推荐
    if (suggestions.length < 2) {
      suggestions.push('能举个具体例子吗？');
      suggestions.push('还有哪些相关内容值得了解？');
    }

    this.setData({ suggestions: suggestions.slice(0, 3) });
  },

  // 清除对话
  clearChat: function () {
    wx.showModal({
      title: '清除对话',
      content: '确定要清除所有对话记录吗？',
      success: (res) => {
        if (res.confirm) {
          this.setData({
            messages: [],
            suggestions: [],
            inputText: ''
          });
        }
      }
    });
  },

  // 获取时间
  getTime: function () {
    const now = new Date();
    const h = now.getHours().toString().padStart(2, '0');
    const m = now.getMinutes().toString().padStart(2, '0');
    return `${h}:${m}`;
  }
});
