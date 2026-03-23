// pages/chat/index.js - 生产级AI问答 v4.0（流式直调 wx.cloud.extend.AI）
const api = require('../../utils/api');
const storage = require('../../utils/storage');
const monetize = require('../../utils/monetize');

Page({
  data: {
    messages: [],
    inputText: '',
    isTyping: false,
    scrollToId: '',
    suggestions: [],
    showHistory: false,
    historyList: [],

    // ── 配额与会员状态 ──────────────────────────────
    quotaStatus: null,     // { isVip, hasAdBonus, remaining, canUse, ... }
    quotaBadge: '',        // 顶部配额徽章文字
    showQuotaBar: false,   // 配额提示条是否展示

    // ── 会员语音（占位，需TTS能力） ──────────────────────────────
    speaking: false,
    speakMsgId: null,

    quickTopics: [
      '李白与杜甫的诗风有何不同？',
      '论语中最值得背诵的10句',
      '孙子兵法如何指导现代生活？',
      '道可道，非常道 是什么意思？',
      '唐宋八大家各有何代表作？',
      '科举制度是怎么运作的？',
      '四书五经分别是哪些书？',
      '孔子一生经历了哪些磨难？'
    ],
    _msgCounter: 0
  },

  onLoad(options) {
    // 预加载激励广告
    monetize.preloadRewardedAd();

    if (options.topic) {
      const topic = decodeURIComponent(options.topic);
      setTimeout(() => {
        this.setData({ inputText: topic });
        this.sendMessage();
      }, 300);
    }
  },

  onShow() {
    this._refreshQuotaStatus();
  },

  onUnload() {
    const { messages } = this.data;
    if (messages.length >= 2) {
      storage.saveChatSession(messages);
    }
  },

  // ── 刷新配额状态（onShow时调用，不阻塞UI）──────────────────────────────
  async _refreshQuotaStatus() {
    try {
      const status = await monetize.getQuotaStatus();
      const badge = monetize.getQuotaBadgeText(status);
      this.setData({
        quotaStatus: status,
        quotaBadge: badge,
        showQuotaBar: !status.isVip // VIP不显示配额条
      });
    } catch (e) {
      // 网络异常，不影响使用
    }
  },

  onInput(e) {
    this.setData({ inputText: e.detail.value });
  },

  // ── 快捷话题 ──────────────────────────────
  onQuickTopic(e) {
    const topic = e.currentTarget.dataset.topic;
    this.setData({ inputText: topic });
    this.sendMessage();
  },

  onSuggestion(e) {
    const text = e.currentTarget.dataset.text;
    this.setData({ inputText: text, suggestions: [] });
    this.sendMessage();
  },

  // ── 核心：发送消息（含配额检查）──────────────────────────────
  async sendMessage() {
    const text = this.data.inputText.trim();
    if (!text || this.data.isTyping) return;
    this._doSendMessage(text);
  },

  // ── 实际发送：流式直调 wx.cloud.extend.AI ─────────────────────
  _doSendMessage(text) {
    const userMsgId = ++this.data._msgCounter;
    const userMsg = {
      id:    userMsgId,
      role:  'user',
      content: text,
      time:  this._getTime(),
      error: false
    };

    const aiMsgId = ++this.data._msgCounter;
    const aiPlaceholder = {
      id:       aiMsgId,
      role:     'assistant',
      content:  '',
      isTyping: true,
      error:    false,
      time:     ''
    };

    const messages = [...this.data.messages, userMsg, aiPlaceholder];
    this.setData({
      messages,
      inputText:   '',
      isTyping:    true,
      suggestions: [],
      scrollToId:  'msg-' + aiMsgId
    });

    // 构建历史（过滤占位/错误消息）
    const chatHistory = messages
      .filter(m => !m.isTyping && !m.error && m.content)
      .map(m => ({ role: m.role, content: m.content }));

    // 使用流式 API（配额在 chatStream 内部消费）
    api.chatStream(
      chatHistory,
      // onChunk：实时更新 AI 气泡（真流式）
      (chunk) => {
        const idx = this.data.messages.findIndex(m => m.id === aiMsgId);
        if (idx === -1) return;
        const updated = [...this.data.messages];
        updated[idx] = {
          ...updated[idx],
          isTyping: false,
          content: (updated[idx].content || '') + chunk,
          time: this._getTime()
        };
        this.setData({ messages: updated, scrollToId: 'msg-' + aiMsgId });
      },
      // onDone
      (fullText) => {
        this.setData({ isTyping: false });
        this._generateSuggestions(fullText);
        this._refreshQuotaStatus();
      },
      // onError
      (err) => {
        // 配额超限单独处理
        if (err.code === 'QUOTA_EXCEEDED') {
          // 移除 AI 占位消息
          const msgs = this.data.messages.filter(m => m.id !== aiMsgId);
          this.setData({ messages: msgs, isTyping: false, inputText: text });
          monetize.handleQuotaExceeded({
            onContinue: () => this._doSendMessage(text)
          });
          return;
        }
        this._onAIError(aiMsgId, err.message);
      }
    );
  },

  // ── AI 回复（非流式兜底，不再主路径使用）──────────────────────
  _onAIReply(msgId, fullText) {
    this._updateMsg(msgId, { isTyping: false, content: fullText, time: this._getTime() });
    this.setData({ isTyping: false });
    this._generateSuggestions(fullText);
  },

  _onAIError(msgId, errMsg) {
    this._updateMsg(msgId, {
      isTyping: false,
      content: errMsg || '回复失败，请重试',
      error: true,
      time: this._getTime()
    });
    this.setData({ isTyping: false });
  },

  _updateMsg(msgId, patch) {
    const messages = this.data.messages.map(m =>
      m.id !== msgId ? m : { ...m, ...patch }
    );
    this.setData({ messages, scrollToId: 'msg-' + msgId });
  },

  // ── 智能追问推荐 ──────────────────────────────
  _generateSuggestions(text) {
    const sugs = [];
    if (text.includes('诗') || text.includes('词') || text.includes('赋')) {
      sugs.push('作者还有哪些经典作品？');
      sugs.push('这首诗的写作背景是什么？');
    }
    if (text.includes('成语')) {
      sugs.push('这个成语有哪些近义词？');
      sugs.push('能再举一个类似的成语吗？');
    }
    if (text.includes('历史') || text.includes('朝代') || text.includes('皇')) {
      sugs.push('这段历史对后世有何影响？');
      sugs.push('同时期有哪些著名人物？');
    }
    if (sugs.length < 2) {
      sugs.push('能详细举例说明吗？');
      sugs.push('与现代生活有何联系？');
    }
    this.setData({ suggestions: sugs.slice(0, 3) });
  },

  // ── 重试失败消息 ──────────────────────────────
  retryMsg(e) {
    const msgId = e.currentTarget.dataset.id;
    const msgs = this.data.messages;
    const aiIdx = msgs.findIndex(m => m.id === msgId);
    if (aiIdx < 0) return;

    this._updateMsg(msgId, { isTyping: true, error: false, content: '' });
    this.setData({ isTyping: true });

    const chatHistory = msgs
      .slice(0, aiIdx)
      .filter(m => !m.error)
      .map(m => ({ role: m.role, content: m.content }));

    api.chat(chatHistory)
      .then(res => this._onAIReply(msgId, res.reply))
      .catch(e => this._onAIError(msgId, e.message));
  },

  // ── 复制消息 ──────────────────────────────
  copyMsg(e) {
    const content = e.currentTarget.dataset.content;
    wx.setClipboardData({
      data: content,
      success: () => wx.showToast({ title: '已复制', icon: 'success', duration: 1200 })
    });
  },

  // ── 语音朗读（VIP专属）──────────────────────────────
  speakMsg(e) {
    const { quotaStatus } = this.data;
    if (!quotaStatus || !quotaStatus.isVip) {
      wx.showModal({
        title: '👑 VIP专属功能',
        content: '语音朗读是会员专属功能\n\n开通9.9元/月会员，享受AI语音朗读国学经典',
        confirmText: '开通会员',
        cancelText: '取消',
        confirmColor: '#8B2500',
        success: res => {
          if (res.confirm) wx.navigateTo({ url: '/pages/vip/index' });
        }
      });
      return;
    }
    // VIP才可使用TTS（调用微信TTS或第三方）
    const content = e.currentTarget.dataset.content;
    if (!content) return;
    this.setData({ speaking: true, speakMsgId: e.currentTarget.dataset.id });
    // 微信小程序语音合成（需使用插件或innerAudioContext方案）
    wx.showToast({ title: '语音功能即将上线', icon: 'none', duration: 2000 });
    setTimeout(() => this.setData({ speaking: false, speakMsgId: null }), 2000);
  },

  // ── 清空对话 ──────────────────────────────
  clearChat() {
    if (this.data.messages.length === 0) return;
    wx.showModal({
      title: '清空对话',
      content: '当前对话记录将被清除，确定吗？',
      confirmText: '清空',
      confirmColor: '#8B2500',
      success: res => {
        if (res.confirm) {
          this.setData({ messages: [], suggestions: [], isTyping: false });
        }
      }
    });
  },

  // ── 历史会话 ──────────────────────────────
  showHistoryPanel() {
    const historyList = storage.getChatHistory();
    this.setData({ showHistory: true, historyList });
  },

  closeHistory() {
    this.setData({ showHistory: false });
  },

  loadHistorySession(e) {
    const session = e.currentTarget.dataset.session;
    this.setData({ messages: session.messages || [], showHistory: false, suggestions: [] });
  },

  // ── 跳转会员页 ──────────────────────────────
  goVip() {
    wx.navigateTo({ url: '/pages/vip/index' });
  },

  // ── 工具 ──────────────────────────────
  _getTime() {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
});
