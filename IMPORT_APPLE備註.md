# BloomBody 匯入說明（手動匯入／微信運動）

BloomBody **不會**在微信小程序或網頁直接連接 Apple Health（HealthKit）。  
若要取得運動、睡眠、經期、體重等資料，請使用下列方式之一。

## 開啟注意（Windows Excel）

本檔 `IMPORT_TEMPLATE.csv` 為 **UTF-8 含 BOM**。請直接用 Excel 開啟；若仍出現亂碼，請用「資料 → 從文字／CSV」並選擇 UTF-8。

## 方式一：BloomBody 範本 CSV（建議）

1. 開啟同資料夾的 `IMPORT_TEMPLATE.csv`
2. 依欄位填入（可刪示範列）：
   - `date`：`YYYYMMDD` 或 `YYYY-MM-DD`
   - `type`：`body`｜`sleep`｜`period`｜`exercise`（亦可寫中文：體重／睡眠／經期／運動）
   - 體重：`weight_kg`、`body_fat_pct`
   - 睡眠：`sleep_hours`、`sleep_time`、`wake_time`（`HH:MM`）
   - 經期：`period_phase`＝`period_start` 或 `period_end`（亦可寫「開始／結束」）
   - 運動：`ex_type`、`minutes`、`kcal`、`steps`
3. 網頁設定頁 →「匯入 CSV／範本」；小程序設定頁 →「匯入本機 CSV／JSON」

## 方式二：對話／貼上一句話

例：
- `體重 58.2`
- `睡眠 7.5 小時` 或 `睡 23:30 起 07:00`
- `經期開始`／`經期結束`
- `步數 8000`／`跑步 30 分鐘`

## 方式三：微信運動（僅步數）

小程序設定 →「授權並同步近約 30 日步數」  
寫入運動記錄，類型為「微信運動」；同一日重複同步會更新，不會盲目重複新增。

## 方式四：從 Apple 健康匯出後自行對齊

1. iPhone「健康」App → 個人頭像 → **匯出所有健康資料**（ZIP／XML，體積可能很大）
2. 自行在試算表中取出需要的日期與數值
3. 複製到 `IMPORT_TEMPLATE.csv` 對應欄位後，再於 BloomBody 匯入

亦可先在 BloomBody 網頁「匯出 Health-shaped CSV／JSON」（僅作互換格式），再用試算表對齊後重新匯入。  
**此路徑為手動對齊，並非小程序連接 Apple Health。**

## 注意

- 熱量、步數、睡眠時長為參考估算，不構成醫療診斷。
- 經期資料建議保持私密；性別為「女」時介面才顯示經期相關入口。
- 匯入時相同 `recordId` 會覆蓋；範本列若無 `recordId` 則依日期＋類型產生新記錄（微信運動步數則按日期冪等更新）。


## 今日狀態（心情＋身體一詞）／海豹日記旁白

- CSV 可填 `type=checkin`（或 `mood_body`／`今日狀態`），並用欄位 `mood_word`、`body_word`（各最多 8 字）。
- 同一日僅保留一筆狀態；重複匯入會更新。
- **小程序無法連接 Apple 健康**；狀態請手動入帳或 CSV。
- 「海豹日記旁白」為模板文案（非 AI、非醫療），僅彙整當日已有步數／睡眠／運動／狀態用詞；設定可關閉「顯示海豹日記旁白」。
