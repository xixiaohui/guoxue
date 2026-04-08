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
    },

    // 激励广告
    enableRewardAd: {
      type: Boolean,
      value: true
    },
    rewardAdUnitId: {
      type: String,
      value: 'adunit-513a37c7d48cdf7f'
    },
    adFailBehavior: {
      type: String,
      value: 'block' // block | direct
    },

    // 已缓存后二次打开免广告
    rewardForCachedOpen: {
      type: Boolean,
      value: false
    },

    // 广告确认文案
    openAdConfirmTitle: {
      type: String,
      value: '打开文档'
    },
    openAdConfirmContent: {
      type: String,
      value: '观看完整广告后可打开文档'
    },
    downloadAdConfirmTitle: {
      type: String,
      value: '下载文档'
    },
    downloadAdConfirmContent: {
      type: String,
      value: '观看完整广告后可下载文档'
    },

    // 删除缓存文案
    deleteCacheConfirmTitle: {
      type: String,
      value: '删除缓存'
    },
    deleteCacheConfirmContent: {
      type: String,
      value: '删除本地缓存后，下次打开将重新观看广告并下载，是否继续？'
    }
  },

  data: {
    loading: false,
    files: [],
    filteredFiles: [],
    progressMap: {},
    adReady: false,
    keyword: '',
    activeFilter: 'all'
  },

  lifetimes: {
    attached() {
      this._rewardedVideoAd = null;
      this._pendingRewardAction = null;
      this._pendingRewardMeta = null;
      this._isAdShowing = false;

      if (this.properties.enableRewardAd) {
        this._initRewardedVideoAd();
      }

      if (this.properties.autoLoad) {
        this.loadFiles();
      }
    },

    detached() {
      this._rewardedVideoAd = null;
      this._pendingRewardAction = null;
      this._pendingRewardMeta = null;
      this._isAdShowing = false;
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
            this.setData({
              loading: false,
              files: [],
              filteredFiles: []
            });
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
          }, () => {
            this._applyFilters();
          });

          this.triggerEvent('loaded', { files });
        },
        fail: (err) => {
          this.setData({
            loading: false,
            files: [],
            filteredFiles: []
          });
          this._showError('网络异常，加载失败');
          this.triggerEvent('error', { type: 'load', error: err });
        }
      });
    },

    // ===== 搜索 / 筛选 =====
    handleSearchInput(e) {
      const keyword = (e.detail.value || '').trim();
      this.setData({ keyword }, () => {
        this._applyFilters();
      });
    },

    clearKeyword() {
      this.setData({ keyword: '' }, () => {
        this._applyFilters();
      });
    },

    handleFilterChange(e) {
      const filter = e.currentTarget.dataset.filter;
      if (!filter || filter === this.data.activeFilter) return;

      this.setData({ activeFilter: filter }, () => {
        this._applyFilters();
      });
    },

    resetFilters() {
      this.setData({
        keyword: '',
        activeFilter: 'all'
      }, () => {
        this._applyFilters();
      });
    },

    _applyFilters() {
      const { files, keyword, activeFilter } = this.data;
      const lowerKeyword = String(keyword || '').toLowerCase();

      let list = [...files];

      if (lowerKeyword) {
        list = list.filter(item =>
          String(item.name || '').toLowerCase().includes(lowerKeyword)
        );
      }

      if (activeFilter === 'cached') {
        list = list.filter(item => !!item.downloaded);
      } else if (activeFilter === 'needAd') {
        list = list.filter(item => !item.downloaded);
      }

      list.sort((a, b) => {
        const ta = new Date(a.mtime).getTime() || 0;
        const tb = new Date(b.mtime).getTime() || 0;
        return tb - ta;
      });

      this.setData({
        filteredFiles: list
      });
    },

    // ===== 打开 =====
    handleOpen(e) {
      const { url, name } = e.currentTarget.dataset;
      const file = { url, name };
      const cacheMap = this._getCacheMap();
      const savedFilePath = cacheMap[file.url];

      // 已缓存且允许免广告直接打开
      if (savedFilePath && !this.properties.rewardForCachedOpen) {
        this._openDocument(savedFilePath)
          .then(() => {
            this.triggerEvent('opened', {
              url: file.url,
              name: file.name,
              fromCache: true,
              adRequired: false
            });
          })
          .catch(() => {
            this._removeCache(file.url);
            this._markDownloaded(file.url, false);

            this._confirmAndRunRewardAd({
              type: 'open',
              file,
              title: this.properties.openAdConfirmTitle,
              content: this.properties.openAdConfirmContent,
              action: () => this._downloadAndSave(file, true)
            });
          });

        return;
      }

      this._confirmAndRunRewardAd({
        type: 'open',
        file,
        title: this.properties.openAdConfirmTitle,
        content: this.properties.openAdConfirmContent,
        action: () => this._openOrDownload(file)
      });
    },

    // ===== 下载 =====
    handleDownload(e) {
      const { url, name } = e.currentTarget.dataset;
      const file = { url, name };

      this._confirmAndRunRewardAd({
        type: 'download',
        file,
        title: this.properties.downloadAdConfirmTitle,
        content: this.properties.downloadAdConfirmContent,
        action: () => this._downloadAndSave(file, false)
      });
    },

    // ===== 删除缓存 =====
    handleDeleteCache(e) {
      const { url, name } = e.currentTarget.dataset;
      const file = { url, name };

      wx.showModal({
        title: this.properties.deleteCacheConfirmTitle,
        content: this.properties.deleteCacheConfirmContent,
        confirmText: '删除',
        confirmColor: '#cf1322',
        cancelText: '取消',
        success: (res) => {
          if (res.confirm) {
            this._deleteSavedFile(file);
          }
        }
      });
    },

    _deleteSavedFile(file) {
      const cacheMap = this._getCacheMap();
      const savedFilePath = cacheMap[file.url];

      if (!savedFilePath) {
        this._removeCache(file.url);
        this._markDownloaded(file.url, false);

        wx.showToast({
          title: '缓存已清理',
          icon: 'success'
        });

        this.triggerEvent('cachedeleted', {
          url: file.url,
          name: file.name,
          existed: false
        });
        return;
      }

      wx.showLoading({
        title: '删除中...'
      });

      fs.unlink({
        filePath: savedFilePath,
        success: () => {
          wx.hideLoading();

          this._removeCache(file.url);
          this._markDownloaded(file.url, false);

          wx.showToast({
            title: '缓存已删除',
            icon: 'success'
          });

          this.triggerEvent('cachedeleted', {
            url: file.url,
            name: file.name,
            filePath: savedFilePath,
            existed: true
          });
        },
        fail: (err) => {
          wx.hideLoading();

          this._removeCache(file.url);
          this._markDownloaded(file.url, false);

          wx.showToast({
            title: '缓存记录已清理',
            icon: 'none'
          });

          this.triggerEvent('cachedeleted', {
            url: file.url,
            name: file.name,
            filePath: savedFilePath,
            existed: false,
            error: err
          });
        }
      });
    },

    // ===== 广告确认 =====
    _confirmAndRunRewardAd({ type, file, title, content, action }) {
      const { enableRewardAd } = this.properties;

      if (!enableRewardAd) {
        action();
        return;
      }

      wx.showModal({
        title: title || '提示',
        content: content || '观看完整广告后可继续',
        confirmText: '去观看',
        cancelText: '取消',
        success: (res) => {
          if (res.confirm) {
            this._runWithRewardAd({ type, file, action });
          }
        }
      });
    },

    _runWithRewardAd({ type, file, action }) {
      const { enableRewardAd, adFailBehavior } = this.properties;

      if (!enableRewardAd) {
        action();
        return;
      }

      if (!wx.createRewardedVideoAd || !this._rewardedVideoAd) {
        if (adFailBehavior === 'direct') {
          action();
        } else {
          this._showError('广告暂不可用，请稍后再试');
        }
        return;
      }

      if (this._isAdShowing) {
        return;
      }

      this._pendingRewardAction = action;
      this._pendingRewardMeta = { type, file };
      this._isAdShowing = true;

      this._showRewardedVideo();
    },

    _initRewardedVideoAd() {
      const { rewardAdUnitId } = this.properties;

      if (!rewardAdUnitId || !wx.createRewardedVideoAd) {
        console.warn('当前环境不支持激励视频广告，或 adUnitId 未配置');
        return;
      }

      const videoAd = wx.createRewardedVideoAd({
        adUnitId: rewardAdUnitId
      });

      this._rewardedVideoAd = videoAd;

      videoAd.onLoad(() => {
        this.setData({ adReady: true });
        this.triggerEvent('adload');
      });

      videoAd.onError((err) => {
        console.error('激励视频广告加载失败', err);
        this.setData({ adReady: false });
        this.triggerEvent('aderror', { error: err });
      });

      videoAd.onClose((res) => {
        this._isAdShowing = false;

        const watchedFinished = res === undefined || !!(res && res.isEnded);
        const pendingAction = this._pendingRewardAction;
        const pendingMeta = this._pendingRewardMeta;

        this._pendingRewardAction = null;
        this._pendingRewardMeta = null;

        if (watchedFinished) {
          this.triggerEvent('adreward', pendingMeta || {});
          if (typeof pendingAction === 'function') {
            pendingAction();
          }
        } else {
          wx.showToast({
            title: '完整观看广告后才可继续',
            icon: 'none'
          });
          this.triggerEvent('adcancel', pendingMeta || {});
        }
      });

      videoAd.load().catch((err) => {
        console.warn('激励视频广告预加载失败', err);
      });
    },

    _showRewardedVideo() {
      const { adFailBehavior } = this.properties;
      const videoAd = this._rewardedVideoAd;

      if (!videoAd) {
        this._handleAdShowFail(new Error('广告实例不存在'), adFailBehavior);
        return;
      }

      videoAd.show().catch(() => {
        videoAd.load()
          .then(() => {
            this.setData({ adReady: true });
            return videoAd.show();
          })
          .catch((err) => {
            this._handleAdShowFail(err, adFailBehavior);
          });
      });
    },

    _handleAdShowFail(err, adFailBehavior) {
      console.error('激励视频广告显示失败', err);

      this._isAdShowing = false;

      const pendingAction = this._pendingRewardAction;
      const pendingMeta = this._pendingRewardMeta;

      this._pendingRewardAction = null;
      this._pendingRewardMeta = null;

      this.setData({ adReady: false });
      this.triggerEvent('aderror', {
        error: err,
        ...(pendingMeta || {})
      });

      if (adFailBehavior === 'direct') {
        wx.showToast({
          title: '广告暂不可用，已直接继续',
          icon: 'none'
        });

        if (typeof pendingAction === 'function') {
          pendingAction();
        }
      } else {
        wx.showToast({
          title: '广告加载失败，请稍后重试',
          icon: 'none'
        });
      }
    },

    // ===== 文件打开/下载 =====
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
            this._removeCache(file.url);
            this._markDownloaded(file.url, false);
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

          const targetPath = this._buildSavedFilePath(file);

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

    // ===== 缓存/状态 =====
    _markDownloaded(url, downloaded) {
      const files = this.data.files.map((item) => {
        if (item.url === url) {
          return { ...item, downloaded };
        }
        return item;
      });

      this.setData({ files }, () => {
        this._applyFilters();
      });
    },

    _clearProgress(url) {
      const nextMap = { ...this.data.progressMap };
      delete nextMap[url];
      this.setData({ progressMap: nextMap });
    },

    _removeCache(url) {
      const map = this._getCacheMap();
      delete map[url];
      this._setCacheMap(map);
    },

    _getCacheMap() {
      return wx.getStorageSync(CACHE_KEY) || {};
    },

    _setCacheMap(map) {
      wx.setStorageSync(CACHE_KEY, map || {});
    },

    // ===== 工具 =====
    _safeFileName(name) {
      return String(name).replace(/[\\/:*?"<>|]/g, '_');
    },

    _simpleHash(str = '') {
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash |= 0;
      }
      return Math.abs(hash);
    },

    _buildSavedFilePath(file) {
      const safeName = this._safeFileName(file.name || 'document.pdf');
      const hash = this._simpleHash(file.url || safeName);
      return `${wx.env.USER_DATA_PATH}/${hash}_${safeName}`;
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
