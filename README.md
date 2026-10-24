# Nihongo Coach

在日本生活用的日文口說助手。三種模式，結果都存成卡片：

- **查詞**：看到不懂的日文 → 中文、英文、語感、例句、自動分類
- **我想說**：說中文 → 自然的口語日文
- **幫我改**：說日文 → 自然講法 + 為什麼原本怪怪的

每張卡都附 **字典重音高低線**（不是 AI 猜的）和 **Azure 神經語音示範音**。

## 技術
- 前端：Vite + React + Tailwind，PWA（iPhone 可加入主畫面）
- 後端：Hono on Cloudflare Workers，D1（SQLite, Drizzle）、R2（音檔快取）
- AI：OpenAI API（查詞用 `OPENAI_MODEL_FAST`、中→日 / 自然化用 `OPENAI_MODEL_SMART`，在 `wrangler.jsonc` 改；`gpt-4o-transcribe` 語音轉文字）、Azure Speech（示範音）

> ChatGPT Plus / Pro 訂閱**不含** API 額度。API 要另外在 [platform.openai.com](https://platform.openai.com) 的 Billing 儲值，再到 API keys 建立 key。

## 本機開發

```bash
npm install
cp .dev.vars.example .dev.vars   # 填入各 API key 與自訂的 APP_TOKEN
npm run db:migrate:local
npm run dev
```

打開 http://localhost:5173 ，第一次會要你輸入 `APP_TOKEN`。

### 匯入重音字典
從 [Kanjium](https://github.com/mifunetoshiro/kanjium) 下載 `data/source_files/raw/accents.txt`，放到 `data/kanjium/accents.txt`（約 10.8 萬筆）：

```bash
curl -L -o data/kanjium/accents.txt https://raw.githubusercontent.com/mifunetoshiro/kanjium/master/data/source_files/raw/accents.txt
node scripts/import-accents.ts data/kanjium/accents.txt > data/kanjium/accents.sql
npx wrangler d1 execute nihongo-coach --local --file data/kanjium/accents.sql
```

沒匯入的話卡片仍可用，只是重音區會顯示「字典查無」。卡片詳情頁每次開啟都會重新查字典，所以匯入前建立的卡片也會補上重音。

重音資料來自 Kanjium，授權為 [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)，App 內已標示出處。

## 部署

```bash
npx wrangler login
npx wrangler d1 create nihongo-coach          # 把 database_id 貼進 wrangler.jsonc
npm run db:migrate:remote
npx wrangler d1 execute nihongo-coach --remote --file data/kanjium/accents.sql
npx wrangler secret put APP_TOKEN
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put AZURE_SPEECH_KEY
npm run deploy
```

R2（示範音快取）是選用的：先在 Cloudflare 後台開通 R2，執行 `npx wrangler r2 bucket create nihongo-coach-audio`，再把 `wrangler.jsonc` 的 `r2_buckets` 取消註解後重新部署。

> 改了 `database_id` 之後本機會換成一份新的空資料庫，要重跑 `npm run db:migrate:local` 和重音匯入。

iPhone Safari 打開部署網址 → 分享 → 加入主畫面。接著照 [docs/ios-shortcuts.md](docs/ios-shortcuts.md) 設定捷徑。

## API
所有路由都要 `Authorization: Bearer <APP_TOKEN>`。

| 方法 | 路徑 | 說明 |
|---|---|---|
| POST | `/api/ask` | `{ mode, text, context?, source? }` → 卡片；`?format=text` 回純文字（給捷徑用） |
| GET | `/api/cards?category=&q=` | 卡片列表 |
| GET / DELETE | `/api/cards/:id` | 單張卡片 |
| POST | `/api/transcribe` | multipart `audio` → `{ text }` |
| POST | `/api/tts` | `{ text }` → mp3 |

## 下一步（Phase 2 / 3）
- 情境包（沙龍、看醫生…）與「出發前複習」
- SRS 開口複習（`cards` 已預留 FSRS 欄位）
- 錄自己念 → 音高曲線與示範音疊圖比對
- 會議即時聽寫（Mac 分頁音訊 / iPhone 麥克風）
