# 🦊 狐濛哥 · 投資控制台 — 部署說明

一份單檔網站 + 三個後端零件。照下面順序做，全部免費。

```
humeng-site/
├─ index.html                 ← 網站本體（直接開就能用，部署後更完整）
├─ worker.js                  ← 報價後端（Cloudflare Worker）
├─ data.json                  ← 每日盤後資料（Actions 自動更新）
├─ config/watchlist.json      ← 盤後排程要追蹤的股票清單（持股有進出改這裡）
├─ scripts/fetch_data.py      ← 盤後抓 MA/三關價的程式
└─ .github/workflows/daily-data.yml  ← 每交易日 17:10 自動跑
```

> 不想搞後端也行：`index.html` 直接用瀏覽器打開就能跑（報價走公開代理、資料存本機）。下面是要做到「上線 + 自己的報價後端 + 每日盤後自動更新 + 跨裝置同步」的完整步驟。

---

## ① GitHub Pages — 把網站放上線（免費網址）

1. 到 GitHub 建一個新的 repo，例如 `humeng-portfolio`（Public）。
2. 把這個資料夾裡的**所有檔案**上傳進去（含 `.github` 資料夾）。
   - 網頁上傳：repo → **Add file → Upload files** → 把檔案拖進去 → Commit。
3. repo → **Settings → Pages** → Source 選 **Deploy from a branch** → Branch 選 `main` / `/(root)` → Save。
4. 等一分鐘，頁面上方會出現網址：`https://你的帳號.github.io/humeng-portfolio/`
   → 這就是狐濛哥的網站，手機加到主畫面即可當 App 用。

---

## ② Firebase — 跨手機/電腦同步（選用，但建議）

沒做這步：資料只存「目前這台裝置的瀏覽器」，換手機不會同步。

1. 到 <https://console.firebase.google.com> → 建立專案。
2. 左側 **Build → Firestore Database → 建立資料庫**（正式版或測試版皆可）。
3. **Build → Authentication → Sign-in method → 啟用 Google**。
4. 專案設定（齒輪）→ 你的應用程式 → 選 **Web `</>`** → 註冊 → 複製那段 `firebaseConfig`。
5. 打開 `index.html`，找到 `const FB_CONFIG={...}`，把 `PASTE_ME` 換成你複製的值，Commit。
6. 之後打開網站，右上角點「🔑 登入啟用雲端同步」用 Google 登入即可。
   （兩台裝置登同一個 Google 帳號就會即時同步。）

> Firestore 規則建議：只允許登入者讀寫自己的資料。
> ```
> match /users/{uid}/{document=**} { allow read, write: if request.auth.uid == uid; }
> ```

---

## ③ Cloudflare Worker — 自己的報價後端（穩定即時價）

公開 CORS 代理偶爾會塞車，自己的 Worker 最穩。

1. 到 <https://dash.cloudflare.com> → **Workers & Pages → Create → Create Worker**。
2. 取個名字（如 `humeng-quote`）→ Deploy → **Edit code**。
3. 把 `worker.js` 整份內容貼進去蓋掉預設 → **Deploy**。
4. 複製你的 Worker 網址，例如 `https://humeng-quote.你的帳號.workers.dev`。
5. 打開 `index.html`，找到 `const BACKEND='';`，填成：
   ```js
   const BACKEND='https://humeng-quote.你的帳號.workers.dev';
   ```
   Commit。之後報價會優先走這個後端，抓不到才退回公開代理。

測試：瀏覽器open `https://humeng-quote.xxx.workers.dev/?code=2330&market=tw`
應回傳 `{"code":"2330","price":...}`。

---

## ④ 每日盤後自動更新（GitHub Actions，已內建）

`.github/workflows/daily-data.yml` 會在**每交易日台灣時間 17:10** 自動跑
`scripts/fetch_data.py`，算各持股的 MA20/MA60/三關價寫進 `data.json`，
網站盯盤頁就會用這份更準的數字（抓不到才退回即時樞紐推算）。

要啟用：
1. repo → **Settings → Actions → General → Workflow permissions**
   → 選 **Read and write permissions** → Save。（讓 Actions 能把 data.json 推回 repo）
2. 想立刻跑一次：repo → **Actions → 每日盤後資料 → Run workflow**。
3. **持股有進出時**：改 `config/watchlist.json`，把股票加進去或拿掉即可。

> 排程時間 cron 用 UTC：`10 9 * * 1-5` = 台灣 17:10、週一～週五。要改時間改這行。
> 之後想加「法人買賣超 / 融資融券」：`scripts/fetch_data.py` 裡有標「擴充位」的註解，
> 補上 TWSE openapi 的抓取、塞進每檔的 `fg5` 等欄位即可。

---

## 常見問題

- **盤中沒有即時價？** 台股即時來源在盤後/假日會回收盤或空值，屬正常；開盤(9:00–13:30)會動。
- **某檔抓不到價？** 確認股號正確；上櫃股（如光聖 6442、華孚 6235）程式會自動試 `.TWO`，不用手動改。
- **改了 index.html 沒生效？** GitHub Pages 有快取，等 1–2 分鐘或強制重新整理（Ctrl/Cmd+Shift+R）。
- **三關價怎麼算的？** 樞紐點：中關=(高+低+收)/3，上關=2×中關−低，下關=2×中關−高；有盤後 data.json 時優先用它。

非投資建議，數字僅供個人參考。
