# ChatGPT 設定：語音口說練習 + 存卡

用 ChatGPT 訂閱額度練對話，練完把修正過的句子存成 Nihongo Coach 卡片。重音一樣由伺服器查字典補上，ChatGPT 不會評論你的重音。

## 為什麼這樣設計

| 做法 | 結果 |
|---|---|
| 自訂 MCP connector（developer mode） | 會寫入資料的工具只開放 Business／Enterprise／Edu；Plus 不能用，Pro 只能唯讀 |
| Custom GPT + Action | 2026/12/11 退場，Action 不會轉到 plugin |
| **Project + Sites plugin**（本文） | Plus、Pro 都能用。Project 負責練習，Site 上的小 proxy 負責存卡 |

Site proxy 只轉發到現有的 `/mcp/<MCP_TOKEN>`，卡片規則還是由 MCP server 的工具說明提供，不用維護第二份。

## 檔案

- [project-instructions.md](project-instructions.md)：貼進 Project 的指示
- [site-prompt.md](site-prompt.md)：貼給 ChatGPT 建 Site proxy 的提示詞

## 設定步驟（只要做一次）

### 1. 建 Site plugin（電腦，ChatGPT 網頁版或桌面 App）

1. 開一個新對話，整段貼上 [site-prompt.md](site-prompt.md)。
2. ChatGPT 建好 Site 後，打開 Site 的設定 → Secrets，新增 `NIHONGO_MCP_URL`，值貼 `.prod.vars` 裡的 `MCP_URL`。在專案資料夾跑這行複製到剪貼簿，網址不會顯示在畫面上：
   ```bash
   grep '^MCP_URL=' .prod.vars | cut -d= -f2- | tr -d '\n' | pbcopy
   ```
3. 確認 Site 的存取權限是**只有自己**，不要設成公開或任何人可用連結開啟。
4. 發布（Publish）Site。ChatGPT 會跳出 plugin 卡片 → **Install** → 完成 Connect。
5. 在新對話輸入 `@Nihongo Coach 列出最近的卡片`，看到卡片清單就代表接通了。

### 2. 建 Project

1. 側邊欄 Projects → 新增 Project，名稱例如「日文口說」。
2. Project 設定 → Instructions，整段貼上 [project-instructions.md](project-instructions.md)。

### 3. 使用

1. 在這個 Project 開新對話，切到語音模式，說「練習」（或「練習 工作」「練習 生活」）。
2. ChatGPT 會先給情境和對方第一句，**不會先給標準答案**。你回答後，它會給自然的說法、用繁中解釋，再接著對話。大約 4 輪後收尾。
3. 結束語音，在同一個對話打「存卡」。修正過的句子會用 Nihongo Coach plugin 存成卡片，來源標為 `chatgpt`。
4. 打開 Nihongo Coach App，卡片會出現在列表裡，重音由伺服器補上。

## 待實測

- 手機 ChatGPT App 能不能執行 Site plugin：官方只說 plugin 列表在網頁、桌面、手機都看得到。手機不行的話，就在電腦上打開同一個對話說「存卡」。
- 語音模式中能不能直接呼叫 plugin：指示已經寫好，不行時會請你改用文字說「存卡」。

## 安全

- `MCP_URL` 只存在 `.prod.vars` 和 Site 的 secret，不要貼進對話或 Project 指示。
- Site 如果不小心公開，或懷疑網址外流：`npx wrangler secret put MCP_TOKEN` 換新 token，更新 `.prod.vars` 的 `MCP_URL`、Site secret 和 claude.ai 的 connector。
