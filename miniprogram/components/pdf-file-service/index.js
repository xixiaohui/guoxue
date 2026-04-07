const CACHE_KEY = 'READMEET_PDF_CACHE_MAP_V1';
const DEFAULT_API_URL = 'https://www.readmeet.club/api/files';

const fs = wx.getFileSystemManager();

Component({
  properties: {
    title: {
      type: String,
      value: 'PDF文库'
    },
    apiUrl: {
      type: String,
      value: DEFAULT_API_URL
    },
    autoLoad: {
      type: Boolean,
      value: true
    },
    emptyText: {
      type: String,
      value: '暂无文档'
    },
    requestHeader: {
      type: Object,
      value: {}
    },
    downloadHeader: {
      type: Object,
      value: {}
    },
    enableCache: {
      type: Boolean,
      value: true
    }
  },

  data: {
    loading: false,
    files: [],
    progressMap: {}
  },

  lifetimes: {
    attached() {
      if (this.properties.autoLoad) {
        this.loadFiles();
      }
    }
  },

  methods: {
    reload() {
      this.loadFiles();
    },

    loadFiles() {
      const { apiUrl, requestHeader } = this.properties;

      this.setData({ loading: true });

      wx.request({
        url: apiUrl,
        method: 'GET',
        header: requestHeader,
        success: (res) => {
          const data = res.data || {};
          if (res.statusCode !== 200 || !data.success || !Array.isArray(data.files)) {
            this._showError('文件列表加载失败');
            this.setData({ loading: false, files: [] });
            this.triggerEvent('error', { type: 'load', response: res });
            return;
          }

          const cacheMap = this._getCacheMap();
          const files = data.files.map((item) => ({
            ...item,
            sizeText: this._formatBytes(item.size || 0),
            mtimeText: this._formatTime(item.mtime),
            downloaded: !!cacheMap[item.url]
          }));

          this.setData({
            loading: false,
            files
          });

          this.triggerEvent('loaded', { files });
        },
        fail: (err) => {
          this.setData({ loading: false, files: [] });
          this._showError('网络异常，加载失败');
          this.triggerEvent('error', { type: 'load', error: err });
        }
      });
    },

    handleOpen(e) {
      const { url, name } = e.currentTarget.dataset;
      const file = { url, name };
      this._openOrDownload(file);
    },

    handleDownload(e) {
      const { url, name } = e.currentTarget.dataset;
      const file = { url, name };
      this._downloadAndSave(file, false);
    },

    _openOrDownload(file) {
      const cacheMap = this._getCacheMap();
      const savedFilePath = cacheMap[file.url];

      if (savedFilePath) {
        this._openDocument(savedFilePath)
          .then(() => {
            this.triggerEvent('opened', {
              url: file.url,
              name: file.name,
              fromCache: true
            });
          })
          .catch(() => {
            // 本地缓存失效，重新下载
            this._downloadAndSave(file, true);
          });
        return;
      }

      this._downloadAndSave(file, true);
    },

    _downloadAndSave(file, openAfterDownload) {
      const { downloadHeader, enableCache } = this.properties;

      wx.showLoading({
        title: openAfterDownload ? '加载中...' : '下载中...'
      });

      const task = wx.downloadFile({
        url: file.url,
        header: downloadHeader,
        success: (res) => {
          if (res.statusCode !== 200 || !res.tempFilePath) {
            wx.hideLoading();
            this._clearProgress(file.url);
            this._showError('下载失败');
            this.triggerEvent('error', {
              type: 'download',
              file,
              response: res
            });
            return;
          }

          // 不缓存：直接打开临时文件
          if (!enableCache) {
            wx.hideLoading();
            this._clearProgress(file.url);

            if (openAfterDownload) {
              this._openDocument(res.tempFilePath)
                .then(() => {
                  this.triggerEvent('opened', {
                    url: file.url,
                    name: file.name,
                    fromCache: false
                  });
                })
                .catch((err) => {
                  this._showError('打开失败');
                  this.triggerEvent('error', {
                    type: 'open',
                    file,
                    error: err
                  });
                });
            } else {
              wx.showToast({ title: '下载成功', icon: 'success' });
            }

            return;
          }

          const safeName = this._safeFileName(file.name || 'document.pdf');
          const targetPath = `${wx.env.USER_DATA_PATH}/${safeName}`;

          fs.saveFile({
            tempFilePath: res.tempFilePath,
            filePath: targetPath,
            success: (saveRes) => {
              wx.hideLoading();
              this._clearProgress(file.url);

              const savedFilePath = saveRes.savedFilePath || targetPath;
              const cacheMap = this._getCacheMap();
              cacheMap[file.url] = savedFilePath;
              this._setCacheMap(cacheMap);
              this._markDownloaded(file.url, true);

              this.triggerEvent('downloaded', {
                url: file.url,
                name: file.name,
                savedFilePath
              });

              if (openAfterDownload) {
                this._openDocument(savedFilePath)
                  .then(() => {
                    this.triggerEvent('opened', {
                      url: file.url,
                      name: file.name,
                      fromCache: false
                    });
                  })
                  .catch((err) => {
                    this._showError('打开失败');
                    this.triggerEvent('error', {
                      type: 'open',
                      file,
                      error: err
                    });
                  });
              } else {
                wx.showToast({
                  title: '已下载',
                  icon: 'success'
                });
              }
            },
            fail: (err) => {
              wx.hideLoading();
              this._clearProgress(file.url);
              this._showError('保存失败');
              this.triggerEvent('error', {
                type: 'save',
                file,
                error: err
              });
            }
          });
        },
        fail: (err) => {
          wx.hideLoading();
          this._clearProgress(file.url);
          this._showError('下载失败，请检查网络');
          this.triggerEvent('error', {
            type: 'download',
            file,
            error: err
          });
        }
      });

      task.onProgressUpdate((progress) => {
        const nextMap = {
          ...this.data.progressMap,
          [file.url]: progress.progress
        };
        this.setData({ progressMap: nextMap });
      });
    },

    _openDocument(filePath) {
      return new Promise((resolve, reject) => {
        wx.openDocument({
          filePath,
          fileType: 'pdf',
          showMenu: true,
          success: resolve,
          fail: reject
        });
      });
    },

    _markDownloaded(url, downloaded) {
      const files = this.data.files.map((item) => {
        if (item.url === url) {
          return { ...item, downloaded };
        }
        return item;
      });
      this.setData({ files });
    },

    _clearProgress(url) {
      const nextMap = { ...this.data.progressMap };
      delete nextMap[url];
      this.setData({ progressMap: nextMap });
    },

    _safeFileName(name) {
      return String(name).replace(/[\\/:*?"<>|]/g, '_');
    },

    _getCacheMap() {
      return wx.getStorageSync(CACHE_KEY) || {};
    },

    _setCacheMap(map) {
      wx.setStorageSync(CACHE_KEY, map || {});
    },

    _formatBytes(bytes = 0) {
      if (bytes < 1024) return `${bytes} B`;
      if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
      return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    },

    _formatTime(timeStr) {
      if (!timeStr) return '未知时间';
      const date = new Date(timeStr);
      const y = date.getFullYear();
      const m = `${date.getMonth() + 1}`.padStart(2, '0');
      const d = `${date.getDate()}`.padStart(2, '0');
      return `${y}-${m}-${d}`;
    },

    _showError(title) {
      wx.showToast({
        title,
        icon: 'none'
      });
    }
  }
});
