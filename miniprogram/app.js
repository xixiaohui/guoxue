// app.js - 国学AI助手（生产级 · 含变现闭环全局状态）
App({
  onLaunch() {
    // ── 云环境初始化 ──────────────────────────────
    const ENV_ID = 'guoxue-9gszzase2c934dcd';

    if (!wx.cloud) {
      console.error('[App] 请使用 2.2.3 或以上的基础库以使用云能力');
    } else {
      wx.cloud.init({
        env: ENV_ID,
        traceUser: true,
      });
    }

    this.globalData = {
      env: ENV_ID,
      userInfo: null,
      // 会员/配额状态（启动后异步加载）
      quotaStatus: null,
      isVip: false,
      theme: {
        primary: '#8B2500',
        secondary: '#C4882E',
        background: '#FDF6E3',
        textPrimary: '#2C1810',
        textSecondary: '#6B5B45',
        cardBg: '#FFFBF0',
        divider: '#E8D5A3'
      }
    };

    // ── 全局未捕获异常处理 ──────────────────────────────
    wx.onError && wx.onError((err) => {
      console.error('[App][GlobalError]', err);
    });

    // ── 检查版本更新 ──────────────────────────────
    this._checkUpdate();

    // ── 系统信息（用于自适应布局） ──────────────────────────────
    try {
      const sysInfo = wx.getSystemInfoSync();
      this.globalData.statusBarHeight = sysInfo.statusBarHeight || 0;
      this.globalData.windowHeight = sysInfo.windowHeight || 0;
      this.globalData.pixelRatio = sysInfo.pixelRatio || 2;
    } catch (e) {
      console.warn('[App] getSystemInfo failed:', e);
    }

    // ── 异步拉取配额状态（启动时静默获取，供全局使用）──────────────────────────────
    this._loadQuotaStatus();
  },

  onShow() {
    // 每次切换到前台刷新配额状态
    this._loadQuotaStatus();
  },

  // ── 加载配额状态 ──────────────────────────────
  _loadQuotaStatus() {
    wx.cloud.callFunction({
      name: 'userQuota',
      data: { type: 'getStatus' }
    }).then(res => {
      const data = res.result;
      if (data && data.success) {
        this.globalData.quotaStatus = data;
        this.globalData.isVip = !!data.isVip;
        console.log('[App] quotaStatus:', { isVip: data.isVip, remaining: data.remaining });
      }
    }).catch(err => {
      console.warn('[App] quota status load failed:', err);
    });
  },

  // ── 版本更新检测 ──────────────────────────────
  _checkUpdate() {
    if (!wx.canIUse('getUpdateManager')) return;
    const updateManager = wx.getUpdateManager();
    updateManager.onUpdateReady(() => {
      wx.showModal({
        title: '发现新版本',
        content: '新版本已就绪，重启后即可体验最新功能，是否立即重启？',
        confirmText: '立即重启',
        confirmColor: '#8B2500',
        success: (res) => {
          if (res.confirm) {
            updateManager.applyUpdate();
          }
        }
      });
    });
    updateManager.onUpdateFailed(() => {
      console.warn('[App] 版本更新失败');
    });
  },

  globalData: {
    env: '',
    userInfo: null,
    quotaStatus: null,
    isVip: false,
    statusBarHeight: 0,
    windowHeight: 0,
    pixelRatio: 2
  }
});
