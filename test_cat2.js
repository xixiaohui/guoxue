/**
 * 临时诊断：/poems/random?type= 各体裁匹配性
 */
const https = require('https');
const { URL } = require('url');

function get(url) {
  return new Promise((resolve) => {
    const u = new URL(url);
    const req = https.get(u, { headers: { 'Content-Type': 'application/json' }, timeout: 15000 }, (res) => {
      let raw = '';
      res.setEncoding('utf8');
      res.on('data', (c) => (raw += c));
      res.on('end', () => {
        let body = {};
        try { body = JSON.parse(raw); } catch (e) {}
        resolve({ statusCode: res.statusCode, body });
      });
    });
    req.on('error', (err) => resolve({ statusCode: 0, body: { err: err.message } }));
  });
}

const BASE = 'https://www.chinesepoetry.space/api/v1';
const types = ['其他', '七言绝句', '七言律诗', '五言律诗', '宋词', '五言绝句', '元曲', '乐府诗', '五代词', '诗经', '楚辞', '论语', '四书五经', '唐诗', '五言古诗', '七言古诗', '蒙学'];

(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (const ty of types) {
    const r = await get(BASE + '/poems/random?type=' + encodeURIComponent(ty));
    let title = '';
    const pd = r.body && r.body.data !== undefined ? r.body.data : r.body;
    const poem = pd && pd.poem ? pd.poem : pd;
    if (poem && poem.title) title = poem.title + ' · ' + (poem.author || '');
    console.log(`type=${ty} -> HTTP ${r.statusCode} ${title ? '| ' + title : ''}`);
    await sleep(200);
  }
})();
