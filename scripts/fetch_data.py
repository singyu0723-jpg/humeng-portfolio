#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
狐濛哥 · 每日盤後資料產生器
由 GitHub Actions 每交易日 17:10(台灣) 自動執行。
讀 config/watchlist.json → 用 Yahoo 日線算 MA20/MA60 + 三關價(樞紐) → 寫 data.json。
（法人籌碼/融資融券留有擴充位，之後要加再補。）

GitHub Actions runner 在伺服器端，沒有 CORS 問題，可直接打 Yahoo。
"""
import json, os, sys, time, urllib.request, datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WATCH = os.path.join(ROOT, "config", "watchlist.json")
OUT   = os.path.join(ROOT, "data.json")
UA = {"User-Agent": "Mozilla/5.0 (compatible; humeng-bot/1.0)"}

def get_json(url, timeout=15):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8", "replace"))

def yahoo_daily(symbol):
    """回傳 (closes[], highs[], lows[]) 近 6 個月日線，新到舊無所謂這裡用時間序。"""
    url = ("https://query1.finance.yahoo.com/v8/finance/chart/"
           f"{symbol}?range=6mo&interval=1d")
    try:
        j = get_json(url)
        res = j["chart"]["result"][0]
        q = res["indicators"]["quote"][0]
        closes = [c for c in q.get("close", []) if c is not None]
        highs  = [c for c in q.get("high",  []) if c is not None]
        lows   = [c for c in q.get("low",   []) if c is not None]
        if len(closes) >= 5:
            return closes, highs, lows
    except Exception as e:
        print(f"  yahoo fail {symbol}: {e}", file=sys.stderr)
    return None

def ma(vals, n):
    if len(vals) < n:
        return None
    return round(sum(vals[-n:]) / n, 2)

def pivots(high, low, close):
    p = (high + low + close) / 3
    return {"up": round(2 * p - low, 2), "mid": round(p, 2), "dn": round(2 * p - high, 2)}

def fetch_stock(code, market):
    syms = [code] if market == "us" else [f"{code}.TW", f"{code}.TWO"]
    for sym in syms:
        d = yahoo_daily(sym)
        if d:
            closes, highs, lows = d
            out = {
                "close": round(closes[-1], 2),
                "ma20": ma(closes, 20),
                "ma60": ma(closes, 60),
                "yahoo": sym,
            }
            out.update(pivots(highs[-1], lows[-1], closes[-1]))
            # 擴充位（之後接籌碼時填）：
            # out["fg5"]   = [...]   # 近5日外資買賣超(張)
            # out["trust5"] = ...    # 投信5日
            # out["mBal"]  = ...     # 融資餘額
            return out
        time.sleep(0.4)
    return None

def main():
    with open(WATCH, encoding="utf-8") as f:
        wl = json.load(f)
    stocks = {}
    for s in wl.get("stocks", []):
        code, market = s["code"], s.get("market", "tw")
        print(f"fetch {code} ({market}) ...")
        info = fetch_stock(code, market)
        if info:
            stocks[code] = info
        time.sleep(0.6)
    now = datetime.datetime.utcnow() + datetime.timedelta(hours=8)  # 台灣時間
    data = {
        "tradeDate": now.strftime("%Y-%m-%d"),
        "updated": now.strftime("%Y-%m-%d %H:%M"),
        "stocks": stocks,
    }
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"wrote {OUT}: {len(stocks)} stocks")

if __name__ == "__main__":
    main()
