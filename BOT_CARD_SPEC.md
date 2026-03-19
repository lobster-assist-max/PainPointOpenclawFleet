# Bot Card 規格 — Alex 確認版

**日期：** 2026-03-19
**狀態：** ✅ Alex 確認

---

## Bot Card 顯示的資訊

每個 bot 在 Dashboard 上的卡片要顯示：

```
┌─────────────────────────────────────────┐
│  ┌──────────┐                           │
│  │          │  🦞 小龍蝦                 │
│  │  Avatar  │  CEO / 執行長              │
│  │ (方形大圖)│  🟢 Online                │
│  │          │                           │
│  └──────────┘                           │
│                                         │
│  📝 簡介                                │
│  Pain Point AI Tech 的核心 AI Agent，    │
│  負責團隊協調、專案管理、系統維護。        │
│                                         │
│  🧠 Context: ████████░░ 78% (156k/200k) │
│  💰 本月 Token: $42.50                   │
│                                         │
│  🔧 Skills                              │
│  ┌────────┐┌──────┐┌────────┐           │
│  │ GitHub ││ gog  ││ weather│           │
│  └────────┘└──────┘└────────┘           │
│  ┌─────────────┐┌───────┐              │
│  │ agent-browser││ imsg │              │
│  └─────────────┘└───────┘              │
│  +12 more                               │
│                                         │
└─────────────────────────────────────────┘
```

## 欄位定義

| 欄位 | 來源 | 必要 |
|------|------|------|
| Avatar | 使用者上傳（方形，最大尺寸） | ✅ |
| 名稱 | IDENTITY.md 或手動輸入 | ✅ |
| 職位 | Onboarding 時選的 role | ✅ |
| 狀態 | Gateway `GET /health` → 🟢 Online / 🔴 Offline / 🟡 Idle | ✅ |
| 簡介 | IDENTITY.md 的 Role 描述或手動輸入（1-2 句） | ✅ |
| Context % | Gateway `/status` → context tokens / max tokens | ✅ |
| 本月 Token | Gateway `/status` → 累計 token 費用 | ✅ |
| Skills | 讀 OpenClaw skills 清單（名稱 + emoji） | ✅ |

## 不要的
- ❌ Memory / MEMORY.md
- ❌ 對話歷史
- ❌ Telegram / Discord 訊息
- ❌ Cron jobs 詳情

## Skills 顯示方式
- 小 badge/tag 樣式
- 顯示前 5 個，其餘 "+N more"
- 每個 skill 顯示名稱（如果有 emoji 就加）
- 點擊 "+N more" 展開全部

## Context / Session 顯示方式
- 進度條（progress bar）
- 顯示百分比 + 實際數字（如 156k/200k）
- 顏色：< 50% 綠色，50-80% 黃色，> 80% 紅色

## Token 用量顯示方式
- 本月累計金額（USD）
- 如果有預算上限，顯示 bar（如 $42.50 / $100）

---

*Cron Job 在實作 Bot Card 時必須遵循此規格。*
