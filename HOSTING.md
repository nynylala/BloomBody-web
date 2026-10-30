# BloomBody 公開網頁託管說明

## 朋友請開這個連結

**https://nynylala.github.io/BloomBody-web/**

（亦可開 https://nynylala.github.io/BloomBody-web/BloomBody_Chat_Tracker.html ）

用手機 Safari／Chrome 等瀏覽器直接開啟即可，**無需登入 GitHub**。

## 資料存在哪裡

- 每部手機／每個瀏覽器各自把記錄存在**本機**（localStorage）。
- 甲的手機看不到乙的資料；清掉網站資料或換瀏覽器會像「空帳」。
- 建議在應用內定期「匯出備份 JSON／CSV」，以免換機遺失。
- 雲端同步／API 為可選功能，朋友使用核心打卡**不必**開通。

## 與微信小程序的關係

- 本連結是 **Web SPA**（免費 GitHub Pages）。
- 微信小程序仍須真實 AppID 與微信發佈流程，**尚未**等同於此連結上線。
- 請勿把本網址當成「已上架小程序」。

## 更新後如何看到新版

1. 關閉分頁後重新開啟上述連結。
2. 若畫面仍舊：在瀏覽器重新整理（必要時長按重新整理 → 清空快取），或到網站設定清除此站資料後再開。
3. 本站 Service Worker 快取名已升級；多數情況重新整理即可取得新資源。

## 倉庫

原始碼（僅 SPA，無伺服器密鑰）：https://github.com/nynylala/BloomBody-web

託管：GitHub Pages · 分支 `main` · 站點根目錄 `/`

## 微信後台可用的法律頁（HTTPS）

- 隱私政策：https://nynylala.github.io/BloomBody-web/privacy.html
- 用戶協議：https://nynylala.github.io/BloomBody-web/terms.html

將上述 URL 填入微信公眾平台 → 用戶隱私保護指引／相關外鏈欄位。此舉**不代表**小程序已上架。

