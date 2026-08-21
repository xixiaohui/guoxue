/**
 * 临时诊断：/categories 朝代名 与 /poems/random?dynasty= 匹配性
 */
const https = require('https');
const { URL } = require('url');

function get(url) {
  return new Promise((resolve) => {
    const u = new URL(url);
    https.get(u, { headers: { 'Content-Type': 'application/json' }, timeout: 15000 }, (res) => {
      let raw = '';
      res.setEncoding('utf8');
      res.on('data', (c) => (raw += c));
      res.on('end', () => {
        let body = {};
        try { body = JSON.parse(raw); } catch (e) {}
        resolve({ statusCode: res.statusCode, body });
      });
    }).on('error', (err) => resolve({ statusCode: 0, body: { err: err.message } }));
  });
}

const BASE = 'https://www.chinesepoetry.space/api/v1';

(async () => {
  const cats = await get(BASE + '/categories');
  const d = cats.body && cats.body.data !== undefined ? cats.body.data : cats.body;
  const unwrap = (v) => (Array.isArray(v) ? v : (v && Array.isArray(v.data) ? v.data : []));
  const dynasties = unwrap(d && d.dynasties);
  const types = unwrap(d && d.types);
  console.log('朝代列表：', dynasties.map((x) => x.name).join(' | '));
  console.log('体裁列表：', types.map((x) => x.name).join(' | '));

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  for (const dy of dynasties.slice(0, 8)) {
    const r = await get(BASE + '/poems/random?dynasty=' + encodeURIComponent(dy.name));
    let title = '';
    const pd = r.body && r.body.data !== undefined ? r.body.data : r.body;
    const poem = pd && pd.poem ? pd.poem : pd;
    if (poem && poem.title) title = poem.title + ' · ' + (poem.author || '');
    console.log(`dynasty=${dy.name} -> HTTP ${r.statusCode} ${title ? '| ' + title : ''}`);
    await sleep(200);
  }

  for (const ty of types.slice(0, 8)) {
    const r = await get(BASE + '/poems/random?type=' + encodeURIComponent(ty.name));
    let title = '';
    const pd = r.body && r.body.data !== undefined ? r.body.data : r.body;
    const poem = pd && pd.poem ? pd.poem : pd;
    if (poem && poem.title) title = poem.title + ' · ' + (poem.author || '');
    console.log(`type=${ty.name} -> HTTP ${r.statusCode} ${title ? '| ' + title : ''}`);
    await sleep(200);
  }
})();
