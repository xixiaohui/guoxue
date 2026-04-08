// pages/guoxuedownload/index.js
Page({

  /**
   * 页面的初始数据
   */
  data: {

  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options) {

  },

  /**
   * 生命周期函数--监听页面初次渲染完成
   */
  onReady() {

  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow() {

  },

  /**
   * 生命周期函数--监听页面隐藏
   */
  onHide() {

  },

  /**
   * 生命周期函数--监听页面卸载
   */
  onUnload() {

  },

  /**
   * 页面相关事件处理函数--监听用户下拉动作
   */
  onPullDownRefresh() {

  },

  /**
   * 页面上拉触底事件的处理函数
   */
  onReachBottom() {

  },

  /**
   * 用户点击右上角分享
   */
  onShareAppMessage() {

  },

  onPdfLoaded(e) {
    console.log('文件列表已加载', e.detail.files);
  },

  onPdfOpened(e) {
    console.log('文档已打开', e.detail);
  },

  onPdfDownloaded(e) {
    console.log('文档已下载', e.detail);
  },

  onPdfCacheDeleted(e) {
    console.log('缓存已删除', e.detail);
  },

  onAdLoad() {
    console.log('广告加载成功');
  },

  onAdReward(e) {
    console.log('用户完整看完广告', e.detail);
  },

  onAdCancel(e) {
    console.log('用户未完整看完广告', e.detail);
  },

  onAdError(e) {
    console.error('广告错误', e.detail);
  },

  onPdfError(e) {
    console.error('PDF 组件错误', e.detail);
  }

})