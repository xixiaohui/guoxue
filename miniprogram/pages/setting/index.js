const user = require('../../utils/user');
const settings = require('../../utils/settings');

Page({
  data: {
    isLogin: false,
    profile: null,
    fontSize: 'normal',
    fontFamily: 'default',
    theme: 'classic',
    cacheSize: '0 KB',
    version: '1.0.0'
  },

  onLoad() {
    this._calcCache();
    const info = wx.getAccountInfoSync();
    if (info && info.miniProgram && info.miniProgram.version) {
      this.setData({ version: info.miniProgram.version });
    }
  },

  onShow() {
    const s = settings.getSettings();
    this.setData({
      isLogin: user.isLogin(),
      profile: user.getProfile(),
      fontSize: s.fontSize,
      fontFamily: s.fontFamily,
      theme: s.theme
    });
  },

  // ── 登录 ──────────────────────────────
  async onLoginTap() {
    if (this.data.isLogin) return;
    wx.showLoading({ title: '登录中…' });
    try {
      const openid = await user.wxLogin();
      const profile = { openid, nickName: '微信用户', avatarUrl: '', loginAt: Date.now() };
      user.saveProfile(profile);
      await user.syncFavoritesToCloud(openid);
      this.setData({ isLogin: true, profile });
      wx.showToast({ title: '登录成功', icon: 'success' });
    } catch (e) {
      console.error('[Setting] login failed:', e);
      wx.showToast({ title: '登录失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  /** 微信头像选择（open-type="chooseAvatar"） */
  onChooseAvatar(e) {
    const tempPath = e.detail && e.detail.avatarUrl;
    if (!tempPath) return;
    const profile = user.getProfile() || {};
    const done = (path) => {
      profile.avatarUrl = path;
      user.saveProfile(profile);
      this.setData({ profile });
      wx.showToast({ title: '头像已更新', icon: 'success' });
    };
    // 头像为临时路径，重启小程序会失效，保存为本地持久文件
    try {
      wx.getFileSystemManager().saveFile({
        tempFilePath: tempPath,
        success: (res) => done(res.savedFilePath),
        fail: () => done(tempPath)
      });
    } catch (_) {
      done(tempPath);
    }
  },

  /** 微信昵称填写（input type="nickname"，失焦保存） */
  onNicknameInput(e) {
    const nickName = (e.detail && e.detail.value || '').trim();
    if (!nickName) return;
    const profile = user.getProfile() || {};
    profile.nickName = nickName;
    user.saveProfile(profile);
    this.setData({ profile });
    wx.showToast({ title: '昵称已更新', icon: 'success' });
  },

  onLogoutTap() {
    wx.showModal({
      title: '退出登录',
      content: '退出后本地收藏仍保留，但不再同步到云端',
      confirmColor: '#8B2500',
      success: (res) => {
        if (res.confirm) {
          user.clearLogin();
          this.setData({ isLogin: false, profile: null });
          wx.showToast({ title: '已退出登录', icon: 'none' });
        }
      }
    });
  },

  // ── 字体 ──────────────────────────────
  setFontSize(e) {
    const v = e.currentTarget.dataset.size;
    settings.setSetting('fontSize', v);
    this.setData({ fontSize: v });
    wx.showToast({ title: '字号已调整', icon: 'none' });
  },

  /** 正文字体（宋体/楷体等） */
  setFontFamily(e) {
    const v = e.currentTarget.dataset.font;
    settings.setSetting('fontFamily', v);
    this.setData({ fontFamily: v });
    wx.showToast({ title: '字体已切换', icon: 'none' });
  },

  // ── 主题 ──────────────────────────────
  setTheme(e) {
    const v = e.currentTarget.dataset.theme;
    settings.setSetting('theme', v);
    this.setData({ theme: v });
    const app = getApp();
    if (app && app.applyTheme) app.applyTheme();
    wx.showToast({ title: '主题已切换', icon: 'none' });
  },

  // ── 缓存 ──────────────────────────────
  _calcCache() {
    try {
      const keys = ['fav_poems', 'fav_idioms', 'viewed_poems', 'app_settings', 'user_profile', 'user_openid'];
      let total = 0;
      keys.forEach(k => {
        const v = wx.getStorageSync(k);
        if (v) total += JSON.stringify(v).length;
      });
      this.setData({ cacheSize: total < 1024 ? total + ' B' : (total / 1024).toFixed(1) + ' KB' });
    } catch (_) { this.setData({ cacheSize: '--' }); }
  },

  clearCache() {
    wx.showModal({
      title: '清除缓存',
      content: '将清除本地收藏、浏览记录与设置，云端数据不受影响',
      confirmColor: '#8B2500',
      success: (res) => {
        if (res.confirm) {
          try {
            wx.clearStorageSync();
            this._calcCache();
            const app = getApp();
            if (app) {
              app.globalData.settings = null;
              app.globalData.isLogin = false;
              app.globalData.userInfo = null;
              app.globalData.openid = '';
            }
            this.setData({ isLogin: false, profile: null, fontSize: 'normal', fontFamily: 'default', theme: 'classic' });
            wx.showToast({ title: '缓存已清除', icon: 'success' });
          } catch (e) {
            wx.showToast({ title: '清除失败', icon: 'none' });
          }
        }
      }
    });
  },

  // ── 同步收藏 ──────────────────────────────
  async syncFavorites() {
    if (!this.data.isLogin) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }
    wx.showLoading({ title: '同步中…' });
    try {
      await user.syncFavoritesToCloud(user.getOpenid());
      wx.showToast({ title: '同步成功', icon: 'success' });
    } catch (e) {
      wx.showToast({ title: '同步失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  // ── 关于 ──────────────────────────────
  goFavorite() {
    wx.navigateTo({ url: '/pages/favorite/index' });
  },

  checkUpdate() {
    const mgr = wx.getUpdateManager();
    mgr.onCheckForUpdate((res) => {
      if (res.hasUpdate) {
        wx.showToast({ title: '有新版本，等待下载…', icon: 'none' });
      } else {
        wx.showToast({ title: '已是最新版本', icon: 'none' });
      }
    });
  }
});
