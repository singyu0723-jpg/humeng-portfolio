/* ============================================================
   狐濛哥 · 報價後端（Cloudflare Worker）
   用途：從瀏覽器直接呼叫證交所/Yahoo 會被 CORS 擋；這個 Worker
        幫你在伺服器端代抓，回傳乾淨 JSON 並加上 CORS 標頭，
        前端就不必依賴公開代理（更穩、更快）。

   端點：  GET https://你的worker網址/?code=2330&market=tw
           GET https://你的worker網址/?code=6442&market=tw   (上櫃自動處理)
           GET https://你的worker網址/?code=QQQ&market=us
   回傳：  {"code":"2330","price":1234.5,"prev":1220,"high":1240,"low":1218,"src":"TWSE"}

   部署：  1. Cloudflare 後台 → Workers & Pages → Create → Worker
           2. 把整份檔案貼進去 → Deploy
           3. 複製 *.workers.dev 網址，填到 index.html 的 const BACKEND='...'
   ============================================================ */
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': '*',
  'Cache-Control': 'no-store'
};

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    const url = new URL(request.url);
    const code = (url.searchParams.get('code') || '').trim();
    const market = (url.searchParams.get('market') || 'tw').trim();
    if (!code) return json({ error: 'missing code' }, 400);

    try {
      let q = null;
      if (market === 'us') {
        q = await yahoo(code);
      } else {
        q = await twse(code);                       // 證交所即時（上市/上櫃自動試）
        if (!q) q = await yahoo(code + '.TW');       // 備援
        if (!q) q = await yahoo(code + '.TWO');
      }
      if (!q) return json({ code, error: 'not found' }, 404);
      q.code = code;
      return json(q);
    } catch (e) {
      return json({ code, error: String(e) }, 500);
    }
  }
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', ...CORS } });
}
const n = v => { const x = parseFloat(v); return isFinite(x) ? x : null; };

/* 證交所 MIS 即時報價（tse=上市 / otc=上櫃 自動試） */
async function twse(code) {
  for (const ex of ['tse', 'otc']) {
    const api = `https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=${ex}_${code}.tw&json=1&delay=0&_=${Date.now()}`;
    const r = await fetch(api, { headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://mis.twse.com.tw/stock/index.jsp' } });
    if (!r.ok) continue;
    const j = await r.json().catch(() => null);
    const m = j && j.msgArray && j.msgArray[0];
    if (!m) continue;
    let price = n(m.z);
    if (price == null) price = n((m.b || '').split('_')[0]);
    if (price == null) price = n((m.a || '').split('_')[0]);
    if (price == null) price = n(m.y);
    if (price == null) continue;
    return { price, prev: n(m.y), high: n(m.h), low: n(m.l), src: 'TWSE' };
  }
  return null;
}

/* Yahoo Finance（美股 + 台股備援） */
async function yahoo(sym) {
  const api = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=5d&interval=1d`;
  const r = await fetch(api, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!r.ok) return null;
  const j = await r.json().catch(() => null);
  const res = j && j.chart && j.chart.result && j.chart.result[0];
  if (!res) return null;
  const meta = res.meta || {};
  const price = meta.regularMarketPrice;
  if (!isFinite(price)) return null;
  const q = (res.indicators && res.indicators.quote && res.indicators.quote[0]) || {};
  const highs = (q.high || []).filter(x => x != null), lows = (q.low || []).filter(x => x != null);
  return {
    price,
    prev: meta.chartPreviousClose || meta.previousClose || null,
    high: meta.regularMarketDayHigh || (highs.length ? highs[highs.length - 1] : null),
    low: meta.regularMarketDayLow || (lows.length ? lows[lows.length - 1] : null),
    src: 'Yahoo'
  };
}
