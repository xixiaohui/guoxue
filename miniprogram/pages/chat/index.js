// pages/chat/index.js - 生产级AI问答 v5.0（双模型切换 + 流式直调）
const api = require('../../utils/api');
const ai  = require('../../utils/ai');
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

    // ── 模型选择 ──────────────────────────────────────────────
    currentModel: 'hunyuan',        // 'hunyuan' | 'deepseek'
    showModelPicker: false,         // 模型选择器弹窗
    modelOptions: [
      { id: 'hunyuan', name: '混元', desc: '腾讯混元 · 速度快', icon: '🔥' },
      { id: 'deepseek', name: 'DeepSeek', desc: '深度求索 · 推理强', icon: '🧠' }
    ],

    // ── 配额与会员状态 ──────────────────────────────
    quotaStatus: null,
    quotaBadge: '',
    showQuotaBar: false,

    // ── 语音（占位） ──────────────────────────────
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
    monetize.preloadRewardedAd();
    // 初始化当前模型
    const savedModel = wx.getStorageSync('_pref_model') || 'hunyuan';
    this.setData({ currentModel: savedModel });
    ai.setModelProvider(savedModel);

    if (options.topic) {
      const topic = decodeURIComponent(options.topic);
      setTimeout(() => {
        this.setData({ inputText: topic });
        this.sendMessage();
      }, 400);
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

  // ── 刷新配额状态 ──────────────────────────────────────────────
  async _refreshQuotaStatus() {
    try {
      const status = await monetize.getQuotaStatus();
      const badge = monetize.getQuotaBadgeText ? monetize.getQuotaBadgeText(status) : _defaultBadge(status);
      this.setData({
        quotaStatus: status,
        quotaBadge: badge,
        showQuotaBar: !status.isVip
      });
    } catch (e) {
      // 网络异常，不影响使用
    }
  },

  // ── 模型切换 ──────────────────────────────────────────────────
  openModelPicker() {
    this.setData({ showModelPicker: true });
  },

  closeModelPicker() {
    this.setData({ showModelPicker: false });
  },

  selectModel(e) {
    const modelId = e.currentTarget.dataset.id;
    if (modelId === this.data.currentModel) {
      this.setData({ showModelPicker: false });
      return;
    }
    ai.setModelProvider(modelId);
    try { wx.setStorageSync('_pref_model', modelId); } catch (_) {}
    this.setData({ currentModel: modelId, showModelPicker: false });
    wx.showToast({
      title: modelId === 'deepseek' ? '已切换至 DeepSeek' : '已切换至混元',
      icon: 'none',
      duration: 1500
    });
  },

  onInput(e) {
    this.setData({ inputText: e.detail.value });
  },

  // ── 快捷话题 ──────────────────────────────────────────────────
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

  // ── 核心：发送消息 ──────────────────────────────────────────────
  sendMessage() {
    const text = this.data.inputText.trim();
    if (!text || this.data.isTyping) return;
    this._doSendMessage(text);
  },

  // ── 实际发送：流式直调 wx.cloud.extend.AI ───────────────────────
  _doSendMessage(text) {
    const userMsgId = ++this.data._msgCounter;
    const userMsg = {
      id:      userMsgId,
      role:    'user',
      content: text,
      time:    this._getTime(),
      error:   false
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

    // 构建历史
    const chatHistory = messages
      .filter(m => !m.isTyping && !m.error && m.content)
      .map(m => ({ role: m.role, content: m.content }));

    // 使用流式 API（配额在 chatStream 内部消费）
    api.chatStream(
      chatHistory,
      // onChunk：每个流式片段更新 AI 气泡
      (chunk) => {
        const msgs = this.data.messages;
        const idx = msgs.findIndex(m => m.id === aiMsgId);
        if (idx === -1) return;
        const updated = msgs.slice();
        updated[idx] = {
          ...updated[idx],
          isTyping: false,
          content: (updated[idx].content || '') + chunk,
          time: this._getTime()
        };
        // 每次更新都滚动到底部
        this.setData({ messages: updated, scrollToId: 'msg-' + aiMsgId });
      },
      // onDone
      (fullText) => {
        // 确保 isTyping 状态复位，最终滚动
        const msgs = this.data.messages;
        const idx  = msgs.findIndex(m => m.id === aiMsgId);
        if (idx !== -1) {
          const updated = msgs.slice();
          updated[idx] = { ...updated[idx], isTyping: false, time: this._getTime() };
          this.setData({ messages: updated, isTyping: false, scrollToId: 'msg-' + aiMsgId });
        } else {
          this.setData({ isTyping: false });
        }
        this._generateSuggestions(fullText);
        this._refreshQuotaStatus();
      },
      // onError
      (err) => {
        if (err.code === 'QUOTA_EXCEEDED') {
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

  // ── 智能追问推荐 ──────────────────────────────────────────────
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

  // ── 重试失败消息 ──────────────────────────────────────────────
  retryMsg(e) {
    const msgId = parseInt(e.currentTarget.dataset.id, 10);
    const msgs = this.data.messages;
    const aiIdx = msgs.findIndex(m => m.id === msgId);
    if (aiIdx < 0) return;

    this._updateMsg(msgId, { isTyping: true, error: false, content: '' });
    this.setData({ isTyping: true });

    const chatHistory = msgs
      .slice(0, aiIdx)
      .filter(m => !m.error && m.content)
      .map(m => ({ role: m.role, content: m.content }));

    api.chatStream(
      chatHistory,
      (chunk) => {
        const idx2 = this.data.messages.findIndex(m => m.id === msgId);
        if (idx2 === -1) return;
        const updated = this.data.messages.slice();
        updated[idx2] = {
          ...updated[idx2],
          isTyping: false,
          content: (updated[idx2].content || '') + chunk,
          time: this._getTime()
        };
        this.setData({ messages: updated, scrollToId: 'msg-' + msgId });
      },
      (fullText) => {
        this.setData({ isTyping: false });
        this._generateSuggestions(fullText);
      },
      (err) => {
        this._onAIError(msgId, err.message);
      }
    );
  },

  // ── 复制消息 ──────────────────────────────────────────────────
  copyMsg(e) {
    const content = e.currentTarget.dataset.content;
    wx.setClipboardData({
      data: content,
      success: () => wx.showToast({ title: '已复制', icon: 'success', duration: 1200 })
    });
  },

  // ── 语音朗读（VIP专属） ──────────────────────────────────────
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
    const content = e.currentTarget.dataset.content;
    if (!content) return;
    this.setData({ speaking: true, speakMsgId: e.currentTarget.dataset.id });
    wx.showToast({ title: '语音功能即将上线', icon: 'none', duration: 2000 });
    setTimeout(() => this.setData({ speaking: false, speakMsgId: null }), 2000);
  },

  // ── 清空对话 ──────────────────────────────────────────────────
  clearChat() {
    if (this.data.messages.length === 0) return;
    wx.showModal({
      title: '清空对话',
      content: '当前对话记录将被清除，确定吗？',
      confirmText: '清空',
      confirmColor: '#8B2500',
      success: res => {
        if (res.confirm) {
          this.setData({ messages: [], suggestions: [], isTyping: false, scrollToId: '' });
        }
      }
    });
  },

  // ── 历史会话 ──────────────────────────────────────────────────
  showHistoryPanel() {
    const historyList = storage.getChatHistory();
    this.setData({ showHistory: true, historyList });
  },

  closeHistory() {
    this.setData({ showHistory: false });
  },

  loadHistorySession(e) {
    const session = e.currentTarget.dataset.session;
    this.setData({
      messages: session.messages || [],
      showHistory: false,
      suggestions: [],
      scrollToId: session.messages && session.messages.length
        ? 'msg-' + session.messages[session.messages.length - 1].id
        : ''
    });
  },

  // ── 跳转会员页 ──────────────────────────────────────────────
  goVip() {
    wx.navigateTo({ url: '/pages/vip/index' });
  },

  // ── 空操作（防止弹窗穿透） ──────────────────────────────────
  noop() {},

  // ── 工具 ──────────────────────────────────────────────────
  _getTime() {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
});

function _defaultBadge(status) {
  if (!status) return '';
  if (status.isVip) return '👑 VIP';
  if (status.hasAdBonus) return '⚡ 无限';
  if (typeof status.remaining === 'number') return `剩余 ${status.remaining} 次`;
  return '';
}
