// app.js - 国学AI助手
App({
  onLaunch: function () {
    this.globalData = {
      // 请填入您的云开发环境ID
      env: "guoxue-9gszzase2c934dcd",
      userInfo: null,
      // 主题色配置
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
    
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力');
    } else {
      wx.cloud.init({
        env: this.globalData.env,
        traceUser: true,
      });
    }
    
    // 检查更新
    if (wx.canIUse('getUpdateManager')) {
      const updateManager = wx.getUpdateManager();
      updateManager.onUpdateReady(function () {
        wx.showModal({
          title: '更新提示',
          content: '新版本已经准备好，是否重启应用？',
          success: function (res) {
            if (res.confirm) {
              updateManager.applyUpdate();
            }
          }
        });
      });
    }
  },
  
  globalData: {
    env: '',
    userInfo: null
  }
});
