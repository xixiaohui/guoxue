// utils/user.js - 用户登录、收藏云同步

const PROFILE_KEY = 'user_profile';
const OPENID_KEY  = 'user_openid';

function isLogin() {
  return !!wx.getStorageSync(OPENID_KEY) && !!wx.getStorageSync(PROFILE_KEY);
}

function getProfile() {
  return wx.getStorageSync(PROFILE_KEY) || null;
}

function getOpenid() {
  return wx.getStorageSync(OPENID_KEY) || '';
}

function saveProfile(profile) {
  wx.setStorageSync(PROFILE_KEY, profile);
  const app = getApp();
  if (app) {
    app.globalData.userInfo = profile;
    app.globalData.isLogin = true;
  }
}

function saveOpenid(openid) {
  wx.setStorageSync(OPENID_KEY, openid);
  const app = getApp();
  if (app) app.globalData.openid = openid;
}

function clearLogin() {
  wx.removeStorageSync(PROFILE_KEY);
  wx.removeStorageSync(OPENID_KEY);
  const app = getApp();
  if (app) {
    app.globalData.userInfo = null;
    app.globalData.isLogin = false;
    app.globalData.openid = '';
  }
}

async function wxLogin() {
  return new Promise((resolve, reject) => {
    wx.login({
      success: async (res) => {
        if (!res.code) { reject(new Error('wx.login 失败')); return; }
        try {
          const r = await wx.cloud.callFunction({ name: 'quickstartFunctions', data: { type: 'getOpenId' } });
          const openid = r.result?.openid;
          if (!openid) throw new Error('获取 openid 失败');
          saveOpenid(openid);
          resolve(openid);
        } catch (e) { reject(e); }
      },
      fail: reject
    });
  });
}

/** 将微信头像临时文件保存为本地持久文件（重启仍有效，仅本机） */
function saveAvatarLocal(tempFilePath) {
  return new Promise((resolve) => {
    try {
      wx.getFileSystemManager().saveFile({
        tempFilePath,
        success: (res) => resolve(res.savedFilePath || tempFilePath),
        fail: (err) => {
          console.warn('[User] saveAvatarLocal failed:', err);
          resolve(tempFilePath);
        }
      });
    } catch (_) {
      resolve(tempFilePath);
    }
  });
}

/** 将微信头像上传到云存储（跨设备、重启均有效），失败返回 null */
async function uploadAvatarToCloud(tempFilePath) {
  const openid = getOpenid();
  if (!openid) return null;
  try {
    const ext = (String(tempFilePath).match(/\.(\w+)$/) || [])[1] || 'png';
    const res = await wx.cloud.uploadFile({
      cloudPath: `avatars/${openid}_${Date.now()}.${ext}`,
      filePath: tempFilePath
    });
    return res.fileID || null;
  } catch (e) {
    console.warn('[User] uploadAvatarToCloud failed:', e);
    return null;
  }
}

async function syncFavoritesToCloud(openid) {
  if (!openid) return;
  const favs = wx.getStorageSync('fav_poems') || [];
  try {
    await wx.cloud.callFunction({
      name: 'guoxueDB',
      data: {
        type: 'set',
        contentType: 'user_fav',
        key: openid,
        title: 'user_fav_' + openid,
        content: JSON.stringify(favs),
        meta: { openid, count: favs.length, updatedAt: Date.now() }
      }
    });
  } catch (e) { console.warn('[User] syncFavoritesToCloud failed:', e); }
}

async function pullFavoritesFromCloud(openid) {
  if (!openid) return [];
  try {
    const r = await wx.cloud.callFunction({
      name: 'guoxueDB',
      data: { type: 'get', contentType: 'user_fav', key: openid }
    });
    if (r.result?.data?.content) {
      const list = JSON.parse(r.result.data.content);
      wx.setStorageSync('fav_poems', list);
      return list;
    }
  } catch (e) { console.warn('[User] pullFavoritesFromCloud failed:', e); }
  return wx.getStorageSync('fav_poems') || [];
}

module.exports = {
  isLogin,
  getProfile,
  getOpenid,
  saveProfile,
  saveOpenid,
  clearLogin,
  wxLogin,
  saveAvatarLocal,
  uploadAvatarToCloud,
  syncFavoritesToCloud,
  pullFavoritesFromCloud,
};
