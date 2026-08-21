const https = require('https');
const { URL } = require('url');
function get(url) {
  return new Promise((resolve) => {
    const u = new URL(url);
    const req = https.get(u, { timeout: 15000 }, (res) => {
      res.resume();
      res.on('end', () => resolve(res.statusCode));
    });
    req.on('error', () => resolve(0));
  });
}
const BASE = 'https://www.chinesepoetry.space/api/v1';
const names = ['其他', '魏晋', '两汉', '南北朝', '隋', '乐府诗', '五代词', '诗经', '楚辞', '论语', '四书五经', '唐诗', '五言古诗', '七言古诗', '蒙学'];
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = [];
  for (const n of names) {
    const a = await get(BASE + '/poems/random?dynasty=' + encodeURIComponent(n));
    const b = await get(BASE + '/poems/random?type=' + encodeURIComponent(n));
    out.push(`${n}: d=${a} t=${b}`);
    await sleep(150);
  }
  console.log(out.join('\n'));
})();
