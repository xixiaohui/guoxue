// pages/detail/index.js
Page({
  data: {
    title: '',
    content: ''
  },
  onLoad: function (options) {
    this.setData({
      title: decodeURIComponent(options.title || ''),
      content: decodeURIComponent(options.content || '')
    });
  }
});
