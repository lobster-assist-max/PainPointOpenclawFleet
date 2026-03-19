# Fleet Onboarding Specification — Alex 確認版

**日期：** 2026-03-19
**狀態：** ✅ Alex 確認
**優先級：** 最高 — 這是 Fleet 的核心體驗

---

## 核心原則

1. **任何人都能用** — 不只我們，任何有 OpenClaw bot 的人都能裝
2. **拖拉式** — 不要打字，用拖的
3. **自動偵測** — 掃描電腦上已有的 bot
4. **取代原版 Paperclip onboarding** — 完全替換

---

## Onboarding 三步驟

### Step 1：建立 Fleet
- 輸入 Fleet 名稱
- 輸入 Mission（選填）
- 按 Next

### Step 2：選擇組織架構
- 顯示預設職位清單（checkbox 多選）
- 選完後即時預覽組織圖
- 空位方框顯示職位名稱
- 可新增自訂職位

#### 預設職位清單（下拉 / checkbox）

**C-Suite（高層）**
| ID | 英文 | 中文 | Level |
|----|------|------|-------|
| ceo | CEO | 執行長 / 總指揮 | 1 |
| cto | CTO | 技術長 | 2 |
| cmo | CMO | 行銷長 | 2 |
| cfo | CFO | 財務長 | 2 |
| coo | COO | 營運長 | 2 |
| cio | CIO | 資訊長 | 2 |
| cso | CSO | 安全長 | 2 |

**Head Level（部門主管）**
| ID | 英文 | 中文 | Level |
|----|------|------|-------|
| head-engineering | Head of Engineering | 工程主管 | 3 |
| head-marketing | Head of Marketing | 行銷主管 | 3 |
| head-sales | Head of Sales | 業務主管 | 3 |
| head-research | Head of Research | 研究主管 | 3 |
| head-design | Head of Design | 設計主管 | 3 |
| head-content | Head of Content | 內容主管 | 3 |
| head-cs | Head of Customer Success | 客戶成功主管 | 3 |
| head-ops | Head of Operations | 營運主管 | 3 |
| head-hr | Head of HR | 人資主管 | 3 |

**Individual Contributors（執行層）**
| ID | 英文 | 中文 | Level |
|----|------|------|-------|
| sr-engineer | Senior Engineer | 資深工程師 | 4 |
| engineer | Engineer | 工程師 | 4 |
| marketing-spec | Marketing Specialist | 行銷專員 | 4 |
| content-creator | Content Creator | 內容創作者 | 4 |
| designer | Designer | 設計師 | 4 |
| data-analyst | Data Analyst | 數據分析師 | 4 |
| researcher | Researcher | 研究員 | 4 |
| customer-support | Customer Support | 客服專員 | 4 |
| sales-rep | Sales Rep | 業務代表 | 4 |
| qa-engineer | QA Engineer | 測試工程師 | 4 |
| devops | DevOps Engineer | 維運工程師 | 4 |
| pm | Project Manager | 專案經理 | 4 |
| admin | Admin Assistant | 行政助理 | 4 |

**Custom — 使用者自訂職位**

### Step 3：連接 Bot（拖拉式）

#### 畫面佈局
```
┌─ 左側：偵測到的 Bot ─────┐  ┌─ 右側：組織圖 ────────────┐
│                          │  │                           │
│ 🦞 龍蝦小助理            │  │       ┌──────┐            │
│    :18789 MacBook Pro    │→拖→    │ CEO  │            │
│                          │  │       │      │            │
│ 🐿️ 飛鼠助理              │  │       └──┬───┘            │
│    :18789 Mac Mini       │  │    ┌─────┼─────┐          │
│                          │  │  ┌─┴──┐┌─┴──┐┌─┴──┐       │
│ 🦚 孔雀助理              │→拖→│CTO ││CMO ││Res.│       │
│    :18793 Mac Mini       │  │  │    ││    ││    │       │
│                          │  │  └────┘└────┘└────┘       │
│ 🐗 野豬助理              │  │                           │
│    :18797 Mac Mini       │  │  空位可稍後再填             │
│                          │  │                           │
│ [+ Manual Connect]       │  │                           │
└──────────────────────────┘  └───────────────────────────┘
```

#### 自動偵測機制
1. 掃描本機常見 port（18789, 18790, 18793, 18797, 18800）
2. 掃描區網 mDNS（找其他電腦上的 bot）
3. 掃描 Tailscale 網路
4. 讀取之前連過的紀錄（Supabase）
5. 都找不到 → 手動輸入 URL + Token

#### 拖進去後自動執行
1. ✅ 驗證 Gateway 連線（GET /health）
2. ✅ 拉取 bot 名稱（從 IDENTITY.md）
3. ✅ 拉取 skills 清單
4. ✅ 拉取 memory 摘要
5. ✅ 設定頭像上傳（方形，最大尺寸顯示）
6. ❌ 失敗 → 彈出手動輸入 Token 的對話框

#### Manual Connect 流程
```
Gateway URL:  [http://192.168.50.73:18793]
Gateway Token: [••••••••••••••••]
               [Test Connection]
               ✅ Connected! Bot: 孔雀行銷助理
```

#### 完成
- 按 [Launch Fleet! 🚀]
- 進入 Dashboard
- 組織圖顯示已連接的 bot（有頭像 + 狀態指示燈）
- 空位顯示「Vacant — Connect Bot」

---

## 技術實作規格

### 拖拉元件
使用 `@dnd-kit`（Paperclip 已有此 dependency）
- DndContext 包住整個 Step 3
- Draggable = 左側 bot 卡片
- Droppable = 右側組織圖空位

### Bot 偵測 API
```typescript
// server/src/routes/fleet-discover.ts
GET /api/fleet/discover

Response: {
  bots: [
    {
      url: "http://127.0.0.1:18789",
      name: "龍蝦小助理",
      emoji: "🦞",
      status: "online",
      machine: "MacBook Pro",
      source: "local-scan"  // local-scan | mdns | tailscale | manual
    }
  ]
}
```

### 職位資料結構
```typescript
// ui/src/lib/fleet-roles.ts
export const FLEET_ROLES = {
  'c-suite': [
    { id: 'ceo', title: 'CEO', subtitle: '執行長 / 總指揮', level: 1 },
    { id: 'cto', title: 'CTO', subtitle: '技術長', level: 2 },
    { id: 'cmo', title: 'CMO', subtitle: '行銷長', level: 2 },
    { id: 'cfo', title: 'CFO', subtitle: '財務長', level: 2 },
    { id: 'coo', title: 'COO', subtitle: '營運長', level: 2 },
    { id: 'cio', title: 'CIO', subtitle: '資訊長', level: 2 },
    { id: 'cso', title: 'CSO', subtitle: '安全長', level: 2 },
  ],
  'head': [
    { id: 'head-engineering', title: 'Head of Engineering', subtitle: '工程主管', level: 3 },
    { id: 'head-marketing', title: 'Head of Marketing', subtitle: '行銷主管', level: 3 },
    { id: 'head-sales', title: 'Head of Sales', subtitle: '業務主管', level: 3 },
    { id: 'head-research', title: 'Head of Research', subtitle: '研究主管', level: 3 },
    { id: 'head-design', title: 'Head of Design', subtitle: '設計主管', level: 3 },
    { id: 'head-content', title: 'Head of Content', subtitle: '內容主管', level: 3 },
    { id: 'head-cs', title: 'Head of Customer Success', subtitle: '客戶成功主管', level: 3 },
    { id: 'head-ops', title: 'Head of Operations', subtitle: '營運主管', level: 3 },
    { id: 'head-hr', title: 'Head of HR', subtitle: '人資主管', level: 3 },
  ],
  'individual': [
    { id: 'sr-engineer', title: 'Senior Engineer', subtitle: '資深工程師', level: 4 },
    { id: 'engineer', title: 'Engineer', subtitle: '工程師', level: 4 },
    { id: 'marketing-spec', title: 'Marketing Specialist', subtitle: '行銷專員', level: 4 },
    { id: 'content-creator', title: 'Content Creator', subtitle: '內容創作者', level: 4 },
    { id: 'designer', title: 'Designer', subtitle: '設計師', level: 4 },
    { id: 'data-analyst', title: 'Data Analyst', subtitle: '數據分析師', level: 4 },
    { id: 'researcher', title: 'Researcher', subtitle: '研究員', level: 4 },
    { id: 'customer-support', title: 'Customer Support', subtitle: '客服專員', level: 4 },
    { id: 'sales-rep', title: 'Sales Rep', subtitle: '業務代表', level: 4 },
    { id: 'qa-engineer', title: 'QA Engineer', subtitle: '測試工程師', level: 4 },
    { id: 'devops', title: 'DevOps Engineer', subtitle: '維運工程師', level: 4 },
    { id: 'pm', title: 'Project Manager', subtitle: '專案經理', level: 4 },
    { id: 'admin', title: 'Admin Assistant', subtitle: '行政助理', level: 4 },
  ],
};
```

### 組織圖渲染
```typescript
// 根據選的職位 + level 自動排列
// Level 1 在最上面，Level 2 在第二排，以此類推
// 連線用 SVG path
// 空位顯示虛線框 + "Drag bot here"
// 已填位顯示 bot 頭像 + 名稱 + 🟢/🔴 狀態
```

### 需要改的原版 Paperclip 檔案
1. `ui/src/components/OnboardingWizard.tsx` → 完全替換
2. `ui/src/App.tsx` → 更新 routing
3. `ui/src/lib/router.tsx` → 加 fleet onboarding route
4. `server/src/routes/agents.ts` → 加 discover endpoint
5. `server/src/routes/index.ts` → 註冊新 routes

---

## 品牌色（Pain Point）
- Primary: #D4A373（金棕）
- Background: #FAF9F6（米白）
- Foreground: #2C2420（深棕）
- Muted: #E5E7EB（淺灰）

---

*此規格由 Alex 確認，Cron Job 在實作時必須遵循此文件。*
