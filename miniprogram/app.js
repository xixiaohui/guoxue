// app.js - 国文之学
App({
  onLaunch() {
    const ENV_ID = 'guoxue-9gszzase2c934dcd';

    if (!wx.cloud) {
      console.error('[App] 请使用 2.2.3 或以上的基础库以使用云能力');
    } else {
      wx.cloud.init({ env: ENV_ID, traceUser: true });
    }

    this.globalData = {
      env: ENV_ID,
      userInfo: null,
      isLogin: false,
      openid: '',
      settings: null,
      theme: {
        primary: '#8B2500',
        secondary: '#C4882E',
        background: '#FDF6E3',
        textPrimary: '#2C1810',
        textSecondary: '#6B5B45',
        cardBg: '#FFFBF0',
        divider: '#E8D5A3'
      },
      statusBarHeight: 0,
      windowHeight: 0,
      pixelRatio: 2
    };

    this._loadSettings();
    this._loadLoginState();
    this.applyTheme();

    wx.onError && wx.onError((err) => {
      console.error('[App][GlobalError]', err);
    });

    this._checkUpdate();

    try {
      const sysInfo = wx.getWindowInfo();
      this.globalData.statusBarHeight = sysInfo.statusBarHeight || 0;
      this.globalData.windowHeight    = sysInfo.windowHeight    || 0;
      this.globalData.pixelRatio      = sysInfo.pixelRatio      || 2;
    } catch (e) {
      console.warn('[App] getSystemInfo failed:', e);
    }
  },

  // ── 设置 ──────────────────────────────
  _loadSettings() {
    const raw = wx.getStorageSync('app_settings');
    const s = raw && typeof raw === 'object' ? raw : {};
    this.globalData.settings = {
      fontSize: s.fontSize || 'normal',       // small | normal | large
      theme: s.theme || 'classic',            // classic | dark | green
      fontFamily: s.fontFamily || 'default',  // default | song | kai | fangsong | hei | xingkai
      ...s
    };
  },

  saveSettings(patch) {
    if (!this.globalData.settings) this._loadSettings();
    Object.assign(this.globalData.settings, patch);
    wx.setStorageSync('app_settings', this.globalData.settings);
    if (patch.theme != null) this.applyTheme();
  },

  applyTheme() {
    const themeName = this.globalData.settings?.theme || 'classic';
    const map = {
      classic: { navBg: '#8B2500', navText: '#ffffff', pageBg: '#FDF6E3', pageColor: '#2C1810' },
      dark:    { navBg: '#1A1410', navText: '#ffffff', pageBg: '#1E1A14', pageColor: '#D8CFC0' },
      green:   { navBg: '#2B4E2D', navText: '#ffffff', pageBg: '#F0F6EB', pageColor: '#2C3E20' }
    };
    const t = map[themeName] || map.classic;
    wx.setNavigationBarColor({ frontColor: t.navText === '#ffffff' ? '#ffffff' : '#000000', backgroundColor: t.navBg });
    wx.setBackgroundColor({ backgroundColor: t.pageBg, backgroundColorTop: t.pageBg, backgroundColorBottom: t.pageBg });
  },

  getFontSizeClass() {
    const s = this.globalData.settings?.fontSize || 'normal';
    return s === 'small' ? 'fs-small' : s === 'large' ? 'fs-large' : 'fs-normal';
  },

  // ── 登录 ──────────────────────────────
  _loadLoginState() {
    const u = wx.getStorageSync('user_profile');
    const o = wx.getStorageSync('user_openid');
    if (u && o) {
      this.globalData.isLogin = true;
      this.globalData.userInfo = u;
      this.globalData.openid = o;
    }
  },

  async login() {
    return new Promise((resolve, reject) => {
      wx.login({
        success: async (res) => {
          if (!res.code) { reject(new Error('登录失败')); return; }
          try {
            const r = await wx.cloud.callFunction({ name: 'quickstartFunctions', data: { type: 'getOpenId' } });
            const openid = r.result?.openid;
            if (!openid) throw new Error('获取 openid 失败');
            this.globalData.openid = openid;
            this.globalData.isLogin = true;
            wx.setStorageSync('user_openid', openid);
            await this._syncFavoritesToCloud(openid);
            resolve({ openid });
          } catch (e) {
            reject(e);
          }
        },
        fail: reject
      });
    });
  },

  logout() {
    this.globalData.isLogin = false;
    this.globalData.userInfo = null;
    this.globalData.openid = '';
    wx.removeStorageSync('user_profile');
    wx.removeStorageSync('user_openid');
  },

  saveUserProfile(profile) {
    this.globalData.userInfo = profile;
    wx.setStorageSync('user_profile', profile);
  },

  async _syncFavoritesToCloud(openid) {
    if (!openid) return;
    try {
      const favs = wx.getStorageSync('fav_poems') || [];
      await wx.cloud.callFunction({
        name: 'guoxueDB',
        data: { type: 'set', contentType: 'user_fav', key: openid, title: 'user_fav_' + openid, content: JSON.stringify(favs), meta: { openid, count: favs.length } }
      });
    } catch (e) { console.warn('[App] syncFavoritesToCloud failed:', e); }
  },

  async pullFavoritesFromCloud() {
    if (!this.globalData.isLogin || !this.globalData.openid) return [];
    try {
      const r = await wx.cloud.callFunction({
        name: 'guoxueDB',
        data: { type: 'get', contentType: 'user_fav', key: this.globalData.openid }
      });
      if (r.result?.data?.content) {
        const list = JSON.parse(r.result.data.content);
        wx.setStorageSync('fav_poems', list);
        return list;
      }
    } catch (e) { console.warn('[App] pullFavoritesFromCloud failed:', e); }
    return wx.getStorageSync('fav_poems') || [];
  },

  // ── 版本更新 ──────────────────────────────
  _checkUpdate() {
    if (!wx.canIUse('getUpdateManager')) return;
    const mgr = wx.getUpdateManager();
    mgr.onUpdateReady(() => {
      wx.showModal({
        title: '发现新版本',
        content: '新版本已就绪，重启后即可体验最新功能，是否立即重启？',
        confirmText: '立即重启', confirmColor: '#8B2500',
        success: res => { if (res.confirm) mgr.applyUpdate(); }
      });
    });
    mgr.onUpdateFailed(() => { console.warn('[App] 版本更新失败'); });
  },

  globalData: {
    env: '', userInfo: null, isLogin: false, openid: '', settings: null,
    statusBarHeight: 0, windowHeight: 0, pixelRatio: 2
  }
});
