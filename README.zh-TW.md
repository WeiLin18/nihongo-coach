# Nihongo Coach

[English](README.md) | **繁體中文**

在日本生活用的日文口說助手。看到不懂的日文、想說卻不會說、說了覺得怪，都丟進來，結果會存成一張卡片。再用會話練習、讀音練習和開口複習練習說出口。

**版本 0.3.0** · [更新紀錄](CHANGELOG.md) · [發版流程](docs/RELEASING.md)

App 介面和說明都是繁體中文，寫給 JLPT N1 左右的台灣前端工程師。想改成自己的需求，提示詞在 [worker/lib/ai.ts](worker/lib/ai.ts)。

## 一分鐘看懂

iPhone PWA，底下四個分頁。設定（token、每天新卡片數）在右上角 ☰ 選單。

| 分頁 | 做什麼 |
|---|---|
| **查詢** | 選一種模式，打字或說話，結果存成卡片。**查詞**：看不懂的日文 → 意思、語感、例句。**我想說**：中文 → 自然的口語日文。**幫我改**：你的日文 → 自然講法，以及為什麼原本怪怪的。 |
| **練習** | 上方切換兩個子分頁。**會話**：工作與生活的短情境對話，用日文回答，邊聊邊幫你改。**讀音**：不看假名唸一段漢字短文，再顯示讀音，點選唸錯的字。 |
| **複習** | 「開口」的間隔重複複習：看題目、先說出日文，再看答案自評。 |
| **卡片** | 所有卡片依分類整理、可搜尋。每張卡都有字典重音高低線（不是 AI 猜的）、神經語音示範音，以及 **🎙 錄音比對**，把自己的音高跟字典比較。 |

卡片也可以從 App 外面進來：分享選單裡的 **iOS 捷徑**、Claude Code 的 **`/jp` skill**、Claude App 的 **MCP connector**。

## 示範影片

<p align="center">
  <img src="docs/images/demo.gif" width="320" alt="示範：在「我想說」輸入句子，卡片邊產生邊顯示">
</p>

<p align="center"><sub>輸入句子後約 1 秒開始出現答案，卡片邊產生邊顯示（15 秒，實際速度）。<a href="docs/images/demo.mp4">MP4 版本</a></sub></p>

## 畫面

> 以下截圖使用 [mock 資料](scripts/demo-cards.json) 和 demo 模式，可以用 `npm run demo` 自己跑起來看（見下方 [Demo](#demomock-資料)）。

<table>
  <tr>
    <th colspan="4" align="left">查詢與卡片</th>
  </tr>
  <tr>
    <td align="center" width="25%"><img src="docs/images/home.jpg" width="180" alt="查詢頁：三種模式、輸入框、情境欄和麥克風"><br><sub>選模式、打字或錄音</sub></td>
    <td align="center" width="25%"><img src="docs/images/zh2ja.jpg" width="180" alt="我想說：中文轉成自然的日文，附讀音和例句"><br><sub>我想說：中文 → 自然口語日文</sub></td>
    <td align="center" width="25%"><img src="docs/images/naturalize.jpg" width="180" alt="幫我改：原句劃掉，說明為什麼改"><br><sub>幫我改：哪裡怪、為什麼</sub></td>
    <td align="center" width="25%"><img src="docs/images/cards.jpg" width="180" alt="卡片列表，可搜尋和依分類篩選"><br><sub>卡片依分類整理、可搜尋</sub></td>
  </tr>
  <tr>
    <th colspan="4" align="left">練習：會話與讀音</th>
  </tr>
  <tr>
    <td align="center"><img src="docs/images/practice.jpg" width="180" alt="會話練習：工作情境、你的角色和要回答的第一句話"><br><sub>會話：給情境，不給範例</sub></td>
    <td align="center"><img src="docs/images/practice-fix.jpg" width="180" alt="你的回答、修正後的說法與中文說明，以及對方下一句"><br><sub>會話：修正與說明</sub></td>
    <td align="center"><img src="docs/images/reading.jpg" width="180" alt="沒有假名的新聞稿段落"><br><sub>讀音：先不看假名唸一遍</sub></td>
    <td align="center"><img src="docs/images/reading-reveal.jpg" width="180" alt="同一段標上假名和翻譯，兩個字標記為唸錯"><br><sub>讀音：顯示讀音，點選唸錯的字</sub></td>
  </tr>
  <tr>
    <th colspan="4" align="left">複習與重音</th>
  </tr>
  <tr>
    <td align="center"><img src="docs/images/review.jpg" width="180" alt="複習正面：用日文說出中文題目，可以錄音"><br><sub>複習：先說出口再看答案</sub></td>
    <td align="center"><img src="docs/images/review-back.jpg" width="180" alt="複習背面：完整卡片與四個評分按鈕，各自顯示下次間隔"><br><sub>複習：對答案、自評</sub></td>
    <td align="center"><img src="docs/images/pitch.jpg" width="180" alt="重音高低線，疊上錄下來的音高曲線"><br><sub>🎙 錄音比對：你的音高 vs. 字典</sub></td>
    <td></td>
  </tr>
</table>

## 功能

### 查詢：做一張卡片

- **邊產生邊顯示**：送出後約 1 秒就開始出現答案（OpenAI 串流）。
- **打字或說話**：按麥克風用說的（`gpt-4o-transcribe`）。可以加情境（「在沙龍跟設計師說」），語氣會更貼切。
- **自動分類**：卡片會歸到 食、工作・會議、美容・沙龍…，在「卡片」可以搜尋。

### 練習 → 會話

每題先給情境、你的角色和對方的第一句話，不會先給範例答案：你用日文回答，可以打字或按麥克風。

- 每次回答後會給一個保留你原意的自然說法、難字標上讀音，並用繁體中文簡短說明改了什麼。接著對方回話，對話繼續。
- 大約 3–4 來回，最後簡短總結，附上值得記的說法。
- 按 **＋ 存成卡片** 會把修正存成一般的「幫我改」卡片（source `practice`），附重音，之後會出現在卡片列表與複習裡。
- 情境混合工作（進度報告、確認規格、請人 review、排優先順序、上線討論、E2E 測試掛掉…）與生活（購物、餐廳、住處、興趣…），一週大約 4 工作 3 生活。主題會輪替，最近練過的題目會帶進 prompt 避免重複；也可以自己選「工作」或「生活」。

Prompt 在 [worker/lib/practice.ts](worker/lib/practice.ts)，模型由 `wrangler.jsonc` 的 `OPENAI_MODEL_PRACTICE` 設定。

### 練習 → 讀音

產生一段短文，對話和新聞稿輪流出，場景是工作（會議、上線、規格）或東京生活。內容以 N1 程度設計，刻意放進容易唸錯的字（音讀訓讀、連濁、重複・相殺・早急這類特殊讀法）。

1. 不看假名先大聲唸一遍。可以錄下來回放，錄音只留在手機上。
2. 按「顯示讀音」：所有漢字詞標上假名、每句附中文翻譯，並列出容易唸錯的字（讀音、意思、為什麼容易唸錯）。
3. 在文中或清單點選唸錯的字，一鍵存成卡片（來源 `reading`，例句帶原文句子，重音查字典）。

最近的主題和字存在 D1，下一篇不會重複。不用語音轉文字評分，因為它回傳的是漢字，看不出你怎麼唸。

### 複習（開口 SRS）

間隔重複的「開口」複習，不是看了認得就好。每張卡片先出題，自己用日文說出口，再看答案：

- **我想說 / 幫我改** 的卡片：顯示中文意思（和你當初寫的），說出自然的日文。
- **查詞** 的卡片：顯示日文單字，說出意思和用法，並用它說一句話。

可以按 🎤 錄音自己說 錄下來回放（只存在這台裝置）。看答案後會顯示完整卡片，再自評 重來／困難／良好／簡單，按鈕上會顯示下次出現的間隔。排程用 [FSRS](https://github.com/open-spaced-repetition/ts-fsrs)，每次複習都記在 `review_logs`。

所有存下的卡片（App、`/jp`、MCP）都會自動加入複習。先複習到期的卡片，再加入每天最多 20 張新卡片（在 ☰ → 設定 調整）。分頁上的數字是今天還剩幾張，頁面上會顯示今天複習了幾張和連續天數。

### 卡片：重音與 🎙 錄音比對

- **重音不靠 AI 猜**：用 [Kanjium](https://github.com/mifunetoshiro/kanjium) 重音字典（約 10.8 萬筆）畫出 NHK 辭典式的高低線。
- **檢查自己的重音**：在重音區的單字按 🎙 錄音比對 念一次，就會看到你的音高曲線疊在字典高低線上，並告訴你該在哪一拍下降。勾「＋が」連助詞一起念，才分得出平板和尾高。全部在手機上分析，不上傳（[src/lib/pitch.ts](src/lib/pitch.ts)；`node scripts/check-pitch.ts` 用合成聲音跑檢查）。
- **神經語音示範音**：整句、每個例句、每個單字都能播（Azure Speech，有開 R2 會快取）。

### 其他入口

- **從任何 App 一鍵查詞**：iOS 捷徑放進分享選單，選取文字或截圖（自動 OCR）就能查。見 [docs/ios-shortcuts.md](docs/ios-shortcuts.md)。
- **電腦上走訂閱額度**：Claude Code 的 [`/jp` skill](#電腦上用訂閱額度jp-skill) 直接寫卡片存進 App，不花 API 費用。
- **手機 Claude App**：[MCP connector](#手機-claude-appmcp-connector) 讓 Claude 在任何對話裡存卡片。

## 架構

```mermaid
flowchart LR
  subgraph clients [入口]
    pwa["iPhone PWA"]
    sc["iOS 捷徑"]
    jp["Claude Code /jp"]
    mcpc["Claude App<br/>MCP connector"]
  end
  subgraph cf [Cloudflare Workers]
    api["Hono API<br/>/api/*"]
    mcp["MCP server<br/>/mcp/:token"]
    d1[("D1<br/>卡片・重音字典")]
  end
  pwa --> api
  sc --> api
  jp -->|"POST /api/cards"| api
  mcpc --> mcp
  api --> d1
  mcp --> d1
  api --> openai["OpenAI<br/>產卡片・語音轉文字"]
  api --> azure["Azure Speech<br/>示範音"]
```

1. 收到請求後驗 token、檢查格式（[shared/schema.ts](shared/schema.ts) 前後端共用）
2. OpenAI 照固定格式回 JSON（[worker/lib/ai.ts](worker/lib/ai.ts)），App 用 SSE 邊收邊顯示
3. 伺服器拿卡片裡的單字去查重音字典（[worker/lib/accent.ts](worker/lib/accent.ts)），補上高低線
4. 存進 D1，回傳卡片；`/jp` 和 MCP 是已經寫好的卡片，直接從第 3 步開始

## 技術
- 前端：Vite + React + Tailwind，PWA（iPhone 可加入主畫面）
- 後端：Hono on Cloudflare Workers，D1（SQLite, Drizzle）、R2（音檔快取）
- AI：OpenAI API（三種模式各自的模型：`OPENAI_MODEL_LOOKUP`、`OPENAI_MODEL_ZH2JA`、`OPENAI_MODEL_NATURALIZE`，會話練習用 `OPENAI_MODEL_PRACTICE`、讀音練習用 `OPENAI_MODEL_READING`，在 `wrangler.jsonc` 改；`gpt-4o-transcribe` 語音轉文字）、Azure Speech（示範音）

> ChatGPT Plus / Pro 訂閱**不含** API 額度。API 要另外在 [platform.openai.com](https://platform.openai.com) 的 Billing 儲值，再到 API keys 建立 key。

## 本機開發

```bash
npm install
cp .dev.vars.example .dev.vars   # 填入各 API key 與自訂的 APP_TOKEN
npm run db:migrate:local
npm run dev
```

打開 http://localhost:5173 ，第一次會要你輸入 `APP_TOKEN`。之後要改，點右上角 ☰ → 設定。

### 匯入重音字典
從 [Kanjium](https://github.com/mifunetoshiro/kanjium) 下載 `data/source_files/raw/accents.txt`，放到 `data/kanjium/accents.txt`（約 10.8 萬筆）：

```bash
curl -L -o data/kanjium/accents.txt https://raw.githubusercontent.com/mifunetoshiro/kanjium/master/data/source_files/raw/accents.txt
node scripts/import-accents.ts data/kanjium/accents.txt > data/kanjium/accents.sql
npx wrangler d1 execute nihongo-coach --local --file data/kanjium/accents.sql
```

沒匯入的話卡片仍可用，只是重音區會顯示「字典查無」。卡片詳情頁每次開啟都會重新查字典，所以匯入前建立的卡片也會補上重音。

重音資料來自 Kanjium，授權為 [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)，App 內已標示出處。

### Demo（mock 資料）

不用 API key 也能看畫面：用另一份本機資料庫，放入 [scripts/demo-cards.json](scripts/demo-cards.json) 的範例卡片。需要先照上一節下載重音字典，並在 `.dev.vars` 設好 `APP_TOKEN`。

```bash
npm run demo:setup          # 建 demo 資料庫並匯入重音字典
npm run demo                # http://localhost:5174
node scripts/seed-demo.ts   # 另開一個終端機，放入範例卡片
```

## 部署

```bash
cp .prod.vars.example .prod.vars             # 記下你的網址與 token（不會進 git）
npx wrangler login
npx wrangler d1 create nihongo-coach          # 把 database_id 貼進 wrangler.jsonc
npm run db:migrate:remote
npx wrangler d1 execute nihongo-coach --remote --file data/kanjium/accents.sql
npx wrangler secret put APP_TOKEN
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put AZURE_SPEECH_KEY
npm run deploy
```

> ⚠️ 遠端匯入重音字典大約會寫入 32 萬列（10.8 萬筆資料＋索引），超過免費方案每天 10 萬列的寫入上限。匯入本身會完成，但當天之後的寫入（存卡片）會被擋到隔天 00:00 UTC（日本時間 09:00）。只需要匯入一次；之後一般使用每張卡片只寫入幾列。

R2（示範音快取）是選用的：先在 Cloudflare 後台開通 R2，執行 `npx wrangler r2 bucket create nihongo-coach-audio`，再把 `wrangler.jsonc` 的 `r2_buckets` 取消註解後重新部署。

> 改了 `database_id` 之後本機會換成一份新的空資料庫，要重跑 `npm run db:migrate:local` 和重音匯入。

之後更新已部署的版本（備份 D1、套用新的 migration、從 tag 部署）請照 [docs/RELEASING.md](docs/RELEASING.md)。

iPhone Safari 打開部署網址 → 分享 → 加入主畫面。接著照 [docs/ios-shortcuts.md](docs/ios-shortcuts.md) 設定捷徑。

## 電腦上用訂閱額度：`/jp` skill

在電腦上用 Claude Code 時，可以用訂閱額度產生卡片，不花 API 費用，卡片一樣存進 App、手機上看得到。

```bash
ln -s "$PWD/skills/jp" ~/.claude/skills/jp   # 安裝一次，所有專案都能用
```

在任何 Claude Code 對話裡：

```
/jp 說 可以幫我把後面打薄一點嗎 @在沙龍跟設計師說
/jp 改 この件について確認してから返事します @會議中回答部長
/jp 查 推し活
```

不加「查／說／改」時會自動判斷。skill 直接讀 `worker/lib/ai.ts` 的提示詞和 `shared/schema.ts` 的格式，跟 App 用同一份規則；網址和 token 從 `.prod.vars` 讀，token 不會印出來。

## 手機 Claude App：MCP connector

Worker 在 `/mcp/<MCP_TOKEN>` 提供一個 MCP server（Streamable HTTP，無狀態），有兩個工具：

- `save_card`：Claude 照 App 的規則寫好卡片後存進來，伺服器補重音（來源標為 `claude-app`）
- `list_cards`：讀最近存的卡片，可依分類或文字篩選

claude.ai 的自訂 connector 只能填網址，所以密鑰放在路徑裡；網址錯誤一律回 404。

設定（只要做一次）：
1. `npx wrangler secret put MCP_TOKEN`（完整網址記在 `.prod.vars` 的 `MCP_URL`）
2. 在 **claude.ai 網頁版** → 設定 → Connectors → Add custom connector，名稱填 `Nihongo Coach`，網址貼 `MCP_URL`。手機 App 不能新增 connector，但網頁加好後手機就能用。Team／Enterprise 方案只有 Owner 能新增自訂 connector。
3. 手機 Claude App 對話時直接說「日文怎麼說：……」「幫我改：……」「查：諸々」，Claude 會呼叫 `save_card`。

用 [MCP Inspector](https://github.com/modelcontextprotocol/inspector) 測試：

```bash
npx @modelcontextprotocol/inspector --cli "$MCP_URL" --transport http --method tools/list
```

## API

所有路由都要 `Authorization: Bearer <APP_TOKEN>`。

| 方法 | 路徑 | 說明 |
|---|---|---|
| POST | `/api/ask` | `{ mode, text, context?, source? }` → 卡片；`?format=text` 回純文字（給捷徑用）；`?stream=1` 用 SSE 串流 |
| GET | `/api/cards?category=&q=&cursor=&limit=` | 卡片列表，新的在前：`{ cards, nextCursor }`。把 `nextCursor` 當 `cursor` 帶回去拿下一頁（最後一頁為 `null`）；`limit` 預設 30、最多 100 |
| POST | `/api/cards` | `{ mode, input, source?, draft }` 直接存一張已寫好的卡片（不呼叫 AI，給 `/jp` skill 用）；同樣支援 `?format=text` |
| GET / DELETE | `/api/cards/:id` | 單張卡片 |
| GET | `/api/practice?limit=` | 最近的會話練習 |
| POST | `/api/practice` | `{ kind?: "work" \| "life" }` → 開始一題；SSE 串流，最後是 `session` 事件 |
| GET | `/api/practice/:id` | 單題與所有回合 |
| POST | `/api/practice/:id/turns` | `{ text }` → 修正與對方下一句；SSE 串流，最後是 `turn` 事件 |
| POST | `/api/practice/turns/:id/card` | 把該回合的修正存成卡片 |
| POST | `/api/transcribe` | multipart `audio` → `{ text }` |
| POST | `/api/tts` | `{ text }` → mp3 |
| GET / POST | `/api/reading` | 最近的讀音段落／`{ kind? }`（`conversation` 或 `news`，不填就輪流）→ 新段落 |
| GET | `/api/reading/:id` | 單一段落 |
| POST | `/api/reading/:id/cards` | `{ words }`（段落 `words` 的索引）→ 把唸錯的字存成卡片 |
| GET | `/api/review/queue?tz=&new=` | 今天的複習佇列：`{ cards, stats }`，到期的在前，接著是新卡片。`tz` 是用戶端的 UTC 時差（分鐘，用來算「今天」）；`new` 是每天新卡片數（預設 20）。每張卡片附 `intervals`（評分 1–4 各自到下次的毫秒數） |
| GET | `/api/review/count?tz=&new=` | `{ due, new, reviewedToday, streak }` |
| POST | `/api/review/:id?tz=&new=` | `{ rating: 1 \| 2 \| 3 \| 4 }`（重來／困難／良好／簡單）重新排程這張卡片；回傳更新後的統計 |

## 下一步（Phase 2 / 3）
- 情境包（沙龍、看醫生…）與「出發前複習」
- 把示範音的音高曲線也疊上去比對（需要 Azure TTS）
- 會議即時聽寫（Mac 分頁音訊 / iPhone 麥克風）

## 版本紀錄

各版本內容見 [CHANGELOG.md](CHANGELOG.md)：0.1.0（Phase 1 MVP）、0.2.0（串流、`/jp`、MCP、demo 模式、公開 repo）、0.3.0（會話練習、讀音練習、開口複習、錄音比對）。打 tag 和部署的流程（含 D1 備份與 migration）見 [docs/RELEASING.md](docs/RELEASING.md)。

## 授權

程式碼採用 [MIT License](LICENSE)。重音字典資料來自 [Kanjium](https://github.com/mifunetoshiro/kanjium)，授權為 CC BY-SA 4.0，不包含在本 repo 中，需自行下載。
