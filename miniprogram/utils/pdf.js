const fs = wx.getFileSystemManager();

function sanitizeFileName(name = 'document.pdf') {
  return name.replace(/[\\/:*?"<>|]/g, '_');
}

/**
 * 下载 PDF
 * @param {Object} options
 * @param {string} options.url PDF 下载地址
 * @param {string} [options.fileName] 本地保存文件名
 * @param {Object} [options.header] 请求头，比如 token
 * @param {boolean} [options.openAfterDownload=true] 下载后立即打开
 * @param {boolean} [options.persist=true] 是否保存到本地持久目录
 */
function downloadPdf(options = {}) {
  const {
    url,
    fileName = 'document.pdf',
    header = {},
    openAfterDownload = true,
    persist = true
  } = options;

  return new Promise((resolve, reject) => {
    if (!url) {
      reject(new Error('缺少 PDF 地址'));
      return;
    }

    wx.showLoading({ title: '下载中...' });

    const task = wx.downloadFile({
      url,
      header,
      success: (res) => {
        if (res.statusCode !== 200 || !res.tempFilePath) {
          wx.hideLoading();
          reject(new Error(`下载失败，状态码：${res.statusCode}`));
          return;
        }

        const tempFilePath = res.tempFilePath;

        // 只预览，不持久化
        if (!persist) {
          wx.hideLoading();

          if (openAfterDownload) {
            wx.openDocument({
              filePath: tempFilePath,
              fileType: 'pdf',
              showMenu: true,
              success: () => resolve({ tempFilePath }),
              fail: reject
            });
          } else {
            resolve({ tempFilePath });
          }
          return;
        }

        const targetPath = `${wx.env.USER_DATA_PATH}/${sanitizeFileName(fileName)}`;

        fs.saveFile({
          tempFilePath,
          filePath: targetPath,
          success: (saveRes) => {
            wx.hideLoading();

            const savedFilePath = saveRes.savedFilePath || targetPath;

            if (openAfterDownload) {
              wx.openDocument({
                filePath: savedFilePath,
                fileType: 'pdf',
                showMenu: true,
                success: () => resolve({ savedFilePath }),
                fail: reject
              });
            } else {
              resolve({ savedFilePath });
            }
          },
          fail: (err) => {
            wx.hideLoading();
            reject(err);
          }
        });
      },
      fail: (err) => {
        wx.hideLoading();
        reject(err);
      }
    });

    task.onProgressUpdate((res) => {
      console.log('下载进度：', res.progress);
    });
  });
}

/**
 * 直接打开已保存的 PDF
 */
function openSavedPdf(filePath) {
  return wx.openDocument({
    filePath,
    fileType: 'pdf',
    showMenu: true
  });
}

/**
 * 删除已保存 PDF
 */
function removeSavedPdf(filePath) {
  return new Promise((resolve, reject) => {
    fs.unlink({
      filePath,
      success: resolve,
      fail: reject
    });
  });
}

/**
 * 获取已保存文件列表
 */
function getSavedFiles() {
  return new Promise((resolve, reject) => {
    fs.getSavedFileList({
      success: (res) => resolve(res.fileList || []),
      fail: reject
    });
  });
}

module.exports = {
  downloadPdf,
  openSavedPdf,
  removeSavedPdf,
  getSavedFiles
};
