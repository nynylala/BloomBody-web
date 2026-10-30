# BloomBody · 心情＋身體一詞 & 海豹日記旁白

書面語 Traditional Chinese · 參考估算 · 非執業醫療 · 品牌僅 BloomBody。

## 1. 心情＋身體一詞（今日狀態）

### 資料模型
- `recordType`: `checkin`
- `data.kind`: `mood_body`
- `data.moodWord` / `data.bodyWord`（固定詞表或「其他」≤8 字）
- `data.dateKey`: `YYYYMMDD`
- 同一用戶同一日僅一筆（冪等更新）
- 預設私密（`isPublic: false`）

### 固定詞表
- 心情：精神、平穩、疲累、焦慮、低落、愉快
- 身體：輕盈、正常、僵硬、痠痛、不適、有力

### 入口（SPA ↔ 小程序對齊）
- 對話：例句「今天心情平穩身體正常」、快捷 chips、確認卡
- 對話／設定／報告：「補登今日狀態」／狀態面板
- CSV：`IMPORT_TEMPLATE.csv` 欄位 `mood_word`、`body_word`，`type=checkin`

### 報告「狀態與數據」
- 近 30 日頻次；≥5 日且有真實睡眠／步數／運動時才顯示關聯文案，標明「參考估算」
- 不捏造數字；不足時顯示提示文案

## 2. 海豹日記旁白

- 模板第三人口吻，僅用**當日真實**步數、睡眠小時、運動分鐘、moodWord／bodyWord
- 例：`小海豹記下：今天步行約 N 步，睡眠約 H 小時，身體感覺「…」。`
- 資料稀疏：`小海豹仍在等候今日的記錄。`
- 顯示於：對話今日摘要、報告全日總結（可選小海豹 chip）
- 設定「顯示海豹日記旁白」**預設 ON**；關閉則兩端皆隱藏
- **不呼叫 AI API**；明確為玩味旁白，非醫療

## 3. 檔案對照

| 能力 | SPA | 小程序 |
|------|-----|--------|
| 解析／upsert | `BloomBody_app.js` | `utils/moodBody.js` + `utils/parser.js` |
| 海豹模板 | `BloomBody_app.js`（composeSealDiaryLine） | `utils/sealDiary.js` |
| 開關 | `meta.showSealDiary`（設定 checkbox） | `utils/prefs.js` → `showSealDiary` |
| 雲函數 | — | `cloudfunctions/parseChat/moodBody.js`（與 utils 同步） |

## 4. 自檢要點
1. 「今天心情平穩身體正常」→ `checkin`，同日再送更新同一筆
2. 「體重 58」「膝蓋痛」不應被狀態解析搶走
3. 海豹日記無數據時為等候文案；有步數／睡眠才寫入數字
4. 關閉「顯示海豹日記旁白」後，對話摘要與報告皆不顯示

部署：刷新 `_deliver_BloomBody_2026-10-29`，解壓複製至 `D:\~Ny_Health\`（無 tgz）。勿推 GitHub、勿含密鑰。
