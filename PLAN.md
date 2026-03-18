# PainPoint OpenClaw Fleet Dashboard — Planning Document

**專案名稱：** PainPoint OpenClaw Fleet Dashboard
**代號：** Fleet
**開始日期：** 2026-03-19
**Team：** 小龍蝦 🦞 (Lead) + Alex (Product Owner)
**基礎：** Paperclip fork（MIT 開源）
**GitHub：** https://github.com/lobster-assist-max/PainPointOpenclawFleet

---

## 🎯 核心概念

**一句話：** OpenClaw 多 bot 部署的管理 Dashboard — 監控、管理、追蹤你的 AI bot 車隊。

**跟原版 Paperclip 的根本差異：**
- Paperclip = 自己啟動 agent，自己管任務
- Fleet = **連接已存在的 OpenClaw bot**，讀取它們的真實狀態

```
Fleet Dashboard (Web App)
    ↓ 連接
OpenClaw Bot A (MacBook Pro :18789)
OpenClaw Bot B (Mac Mini :18789)  
OpenClaw Bot C (Mac Mini :18793)
OpenClaw Bot D (Mac Mini :18797)
    ↓ 讀取
Sessions, Memory, Skills, Cron, Status, Token Usage
    ↓ 顯示
Dashboard + Org Chart + Cost Tracking
```

---

## 🏗️ 架構改動（從 Paperclip 改什麼）

### 術語改名
| Paperclip 原版 | Fleet 版 |
|---------------|----------|
| Company | Fleet |
| Agent | Bot |
| Hire | Connect / Attach |
| Heartbeat | Sync |

### Onboarding Wizard 重設計
**原版流程：** Create Company → Create Agent → Create Task → Launch
**Fleet 流程：**
1. **Create Fleet** — 命名你的 bot 車隊
2. **Connect First Bot** — 輸入 OpenClaw Gateway URL + Token → 自動拉取 bot 資訊（名稱、skills、memory）
3. **Bot Profile** — 自動填充（從 IDENTITY.md / SOUL.md 讀取），可手動調整職位
4. **Connect More** — 加更多 bot 或稍後再加（生成邀請連結）
5. **Dashboard** — 完成！

### 新增的 API Endpoints
```
GET /api/bots/:id/sync          — 從 OpenClaw gateway 拉最新狀態
GET /api/bots/:id/sessions      — 拉 session 列表
GET /api/bots/:id/memory        — 讀 MEMORY.md / STATE.md
GET /api/bots/:id/skills        — 讀 skills 清單
GET /api/bots/:id/cron          — 讀 cron jobs
GET /api/bots/:id/usage         — 讀 token 用量
POST /api/bots/:id/message      — 發訊息給 bot
POST /api/fleets/invite         — 生成邀請連結
POST /api/fleets/join           — bot 透過連結加入
```

### OpenClaw Gateway 整合
每個 bot 需要提供：
- Gateway URL（如 `http://192.168.50.73:18789`）
- Gateway Auth Token
- Fleet 定期 poll 或用 WebSocket 監聽

### 從 OpenClaw 拉取的資料
| 資料 | OpenClaw API / 方式 | 用途 |
|------|---------------------|------|
| Bot 狀態 | `GET /health` | 在線/離線 |
| Session 列表 | `sessions list` | 活躍對話 |
| Token 用量 | `/status` | 成本追蹤 |
| Skills | 讀 skills 目錄 | 能力展示 |
| Memory | 讀 MEMORY.md | bot 記憶 |
| State | 讀 STATE.md | 當前任務 |
| Identity | 讀 IDENTITY.md / SOUL.md | bot 介紹 |
| Cron Jobs | `cron list` | 排程任務 |
| 對話歷史 | session history | 聊天記錄 |

---

## 🎨 UI/UX 設計方向

### 視覺風格
- **Pixel Art** 路線（跟原版 Paperclip 類似但不同）
- **Pain Point 品牌色** — 從 https://painpoint-ai.com 提取
  - 主色調待確認（需要看官網）
- **每個 bot 有自己的 pixel art 頭像**
  - 🦞 小龍蝦 — 像素龍蝦
  - 🐿️ 飛鼠 — 像素飛鼠
  - 🦚 孔雀 — 像素孔雀
  - 🐗 山豬 — 像素山豬

### 頁面結構
1. **Dashboard** — 所有 bot 的即時狀態概覽
2. **Fleet** — 車隊管理（加/移除 bot）
3. **Org Chart** — 組織圖（誰 report to 誰）
4. **Bot Detail** — 個別 bot 的詳細資訊（skills、memory、sessions）
5. **Costs** — 成本追蹤（從每個 bot 拉 token 用量）
6. **Activity** — 全車隊活動紀錄
7. **Settings** — Fleet 設定

### 邀請流程
1. Fleet 管理者（Alex/小龍蝦）生成邀請連結
2. 連結包含 Fleet ID + 一次性 token
3. Bot 的 OpenClaw 收到連結 → 自動連接 → 出現在 Dashboard
4. 或手動輸入 Gateway URL + Token

---

## 📅 Phase 計畫

### Phase 1: 基礎結構 (Planning, 今晚 cron)
- [ ] 完整計畫文件
- [ ] 術語改名（Company → Fleet, Agent → Bot）
- [ ] 確認 OpenClaw Gateway API 支援哪些操作
- [ ] 確認 Pain Point 品牌色
- [ ] 設計 Onboarding Wizard 流程
- [ ] Notion 專案建立

### Phase 2: 核心功能 (開發)
- [ ] 改 Onboarding Wizard（Gateway URL + Token 連接方式）
- [ ] 實作 OpenClaw Gateway 連接器
- [ ] 實作 bot 狀態同步
- [ ] 實作 dashboard 即時顯示

### Phase 3: 完整功能 (開發)
- [ ] 邀請連結系統
- [ ] 成本追蹤
- [ ] Skills 展示
- [ ] Memory / State 讀取
- [ ] 對話歷史瀏覽

### Phase 4: UI + 品牌 (設計)
- [ ] Pain Point 品牌色套用
- [ ] Pixel art 頭像
- [ ] 手機 responsive
- [ ] 邀請頁面

---

## 📝 Planning Phase 記錄

### Planning #1 — 2026-03-19 01:10
- 建立計畫文件
- 建立 GitHub repo
- 建立 Notion 專案
- 核心概念定義完成
- 術語改名定義完成
- Onboarding 流程初版設計完成
- 下一步：確認 OpenClaw Gateway API、品牌色

### Planning #2 — 2026-03-19 01:42
**研究成果：**

**1. OpenClaw Gateway API 確認可用：**
- `GET /health` → `{"ok":true,"status":"live"}` ✅
- `openclaw sessions` — 列出 session 列表
- `openclaw status` — 顯示 channel health + token 用量
- `openclaw cron list` — 列出 cron jobs
- `openclaw agents` — 管理 agents
- Gateway 有 WebSocket API，可即時監控

**2. Pain Point 品牌色提取完成：**
```
主色調：
- 背景色：#FAF9F6 (rgb(250,249,246)) — 溫暖米白
- 深色文字：#2C2420 (rgb(44,36,32)) — 深棕/炭黑
- 品牌金：#D4A373 (rgb(212,163,115)) — 金棕色（主 accent）
- 邊框灰：#E5E7EB (rgb(229,231,235)) — 淺灰

色彩系統：
- Primary: #D4A373 (金棕) — 按鈕、連結、重點
- Background: #FAF9F6 (米白) — 頁面背景
- Foreground: #2C2420 (深棕) — 文字
- Muted: #E5E7EB (淺灰) — 邊框、分隔線
```

**3. Onboarding Wizard 細化：**
```
Step 1: "Create Your Fleet"
  - Fleet 名稱（如 "Pain Point AI Fleet"）
  - Fleet 描述（選填）

Step 2: "Connect Your First Bot"
  - 輸入 Gateway URL（如 http://192.168.50.73:18789）
  - 輸入 Gateway Token
  - 點擊 "Test Connection"
  - ✅ 成功 → 自動拉取 bot 名稱、skills、memory
  - ❌ 失敗 → 顯示錯誤 + 排錯指南

Step 3: "Bot Profile"（自動填充）
  - 名稱（從 IDENTITY.md 讀）
  - 角色/職位（手動選）
  - Emoji 頭像
  - 技能列表（從 skills 讀）

Step 4: "Your Fleet"
  - 顯示已連接的 bot
  - "Connect Another Bot" 或 "Generate Invite Link"
  - "Go to Dashboard"
```

**4. 技術決定：**
- Gateway 通訊用 WebSocket（即時）+ HTTP（polling backup）
- Bot 狀態每 30 秒同步一次
- 連接資訊（URL + Token）加密存在 Paperclip 的 DB
- 前端用 Pain Point 色系替換 Paperclip 原色

**下一步 Planning #3：**
- 確認 OpenClaw Gateway WebSocket API 的具體 endpoints
- 設計 DB schema 改動（Company → Fleet, Agent → Bot）
- 列出需要改的前端檔案清單

### Planning #3 — 2026-03-19 02:30
**重大發現 & 新洞察：**

---

**1. OpenClaw Gateway WebSocket 深度解析（全新資料）**

Gateway 是 **WebSocket-first** 架構，單一 port 同時服務 WS + HTTP。

**連線握手流程（三步驟）：**
```
1. Gateway → Client:  connect.challenge  {nonce}
2. Client → Gateway:  connect  {protocol, role:"operator", scopes, auth.token, device.id, device.publicKey, device.signature, signedNonce}
3. Gateway → Client:  hello-ok  {protocol, policy, presence, health, auth.deviceToken}
```
→ 這比我們原本想的「URL + Token 就好」更複雜。需要實作 device identity + nonce signing。

**可用 RPC 方法（完整清單）：**
| 方法 | 用途 | Fleet 需要？ |
|------|------|-------------|
| `health` | 完整健康快照（channels, sessions, agents） | ✅ 核心 |
| `status` | Runtime 版本、heartbeat config、session details | ✅ 核心 |
| `system-presence` | 已連接的 devices/clients | ✅ 顯示誰在線 |
| `agent` | 啟動 agent turn（兩階段：ack → stream → final） | ⚠️ Phase 3 |
| `agent.wait` | 等待 agent 完成 | ⚠️ Phase 3 |
| `chat.send` | 發送聊天訊息（含 slash commands） | ✅ 核心（發指令給 bot） |
| `tools.catalog` | 取得 agent 的工具清單 | ✅ 顯示 bot 能力 |
| `skills.bins` | 取得 skill 執行檔清單 | ✅ Skills 展示 |
| `cron.*` | Cron job 管理 | ✅ 排程管理 |
| `device.pair.list` | 列出已配對裝置 | ✅ 連線管理 |
| `device.pair.approve` | 批准裝置配對 | ✅ 邀請流程 |
| `device.token.rotate` | 輪替裝置 token | ⚠️ 安全性 |
| `device.token.revoke` | 撤銷裝置 token | ⚠️ 安全性 |
| `exec.approval.resolve` | 解決執行批准請求 | ⚠️ Phase 3 |

**即時事件串流：**
- `agent` — agent 執行期間的串流事件
- `chat` — 聊天更新
- `presence` — 裝置上下線
- `tick` — 每 15 秒心跳
- `health` — 健康狀態變更
- `heartbeat` — heartbeat 活動
- `shutdown` — 優雅關機通知
- `exec.approval.requested` — 執行批准請求

**四種認證模式：**
| 模式 | 機制 | Fleet 適用？ |
|------|------|-------------|
| `none` | 無認證（僅 loopback） | ❌ 不安全 |
| `token` | 靜態共享 token | ✅ 最簡單，Phase 1 用這個 |
| `password` | 共享密碼 | ⚠️ 備選 |
| `trusted-proxy` | 反向代理 header | ⚠️ 生產環境用 |

**HTTP endpoints：**
| Endpoint | 說明 |
|----------|------|
| `GET /health` | `{"ok":true,"status":"live"}` |
| `POST /v1/chat/completions` | OpenAI-compatible（預設關閉） |
| `POST /v1/responses` | OpenResponses-compatible（預設關閉） |
| `POST /tools/invoke` | 直接調用工具 |

---

**2. 驚喜發現：openclaw-gateway adapter 已存在！**

Paperclip 已經有一個 `openclaw-gateway` adapter：
- `ui/src/adapters/openclaw-gateway/config-fields.tsx`

→ **這是巨大的加速器！** 我們不需要從零開始寫 OpenClaw 連接器。
→ 但需要擴展它——原版可能只支援基本連接，我們需要加入：
  - Device identity / pairing 流程
  - Real-time event subscription
  - Memory/State/Skills 讀取
  - Cost tracking integration

---

**3. Pain Point 雙品牌色系發現（全新）**

painpoint-ai.com 有 **兩套不同的視覺系統**：

**A. 首頁 "PAIN POINT" — 溫暖路線（已知，確認無誤）**
```css
--pp-dark-brown:    #3C3533;   /* 比原本的 #2C2420 略淺 */
--pp-brand-gold:    #D3A374;   /* 確認 ≈ #D4A373 */
--pp-cream-bg:      #FBFBF3;   /* 確認 ≈ #FAF9F6 */
--pp-taupe:         #B8ADA2;   /* 🆕 次要文字色 */
--pp-warm-gray:     #948F8C;   /* 🆕 中灰 */
--pp-light-warm:    #DCD1C7;   /* 🆕 卡片背景/分隔線 */
```

**B. 產品頁 "商機特工" — 冷色路線（全新發現）**
```css
--sa-navy:          #376492;   /* 🆕 主標題色 */
--sa-teal:          #30A1A8;   /* 🆕 主 accent */
--sa-dark-teal:     #32707F;   /* 🆕 深色背景 */
--sa-green:         #27BD74;   /* 🆕 CTA 按鈕 */
--sa-green-alt:     #2AC46B;   /* 🆕 活躍狀態 */
--sa-purple:        #9940ED;   /* 🆕 強調色 */
--sa-dark-text:     #1C252E;   /* 🆕 深色文字 */
--sa-border:        #D1D3DB;   /* 🆕 邊框灰 */
```

**CTA 漸層：** teal → navy（左到右），也有 green → teal 變體

**🎨 Fleet 設計決定：混合兩套色系**
```
Dashboard 外框/導航 → 溫暖路線（cream + gold + brown）— 品牌識別
狀態指示器 → 冷色路線：
  - 🟢 Online: #27BD74 (green)
  - 🔵 Working: #30A1A8 (teal)
  - 🟡 Idle: #D3A374 (gold)
  - 🔴 Error: destructive red
  - ⚫ Offline: #948F8C (warm-gray)
CTA 按鈕 → teal-to-navy gradient
資料視覺化 → 冷色系（navy, teal, green, purple）
```

**UI 設計 token（從官網提取）：**
```
border-radius（按鈕）: 24-32px（pill 膠囊型）
border-radius（卡片）: 16-20px
border-radius（輸入框）: 8px
nav 高度: 64-72px
內容最大寬度: 1200-1280px
section 間距: 80-120px
卡片內距: 24-32px
字型: Sans-serif（系統字型 + Noto Sans TC）
無 dark mode
```

---

**4. DB Schema 改動策略（新想法：漸進式，不破壞 migration history）**

**策略：View + Alias 優先，不直接改表名**

因為 Paperclip 有 56+ schema 檔案和既有 migration history，直接改表名風險太高。

**Phase 1：加 TypeScript alias（零風險）**
```typescript
// packages/db/src/schema/fleet-aliases.ts
export { companies as fleets } from './companies';
export { agents as bots } from './agents';
export { companyMemberships as fleetMemberships } from './company_memberships';
```

**Phase 2：前端 UI 只改顯示文字**
- "Company" → "Fleet"（只改 JSX 文字和 label）
- "Agent" → "Bot"（只改 JSX 文字和 label）
- 不改 API route paths（保持 `/api/companies/` 不變）

**Phase 3（如果需要完全改名）：**
- 新增 migration 加 view
- 逐步遷移 route paths

→ 這比 Planning #2 暗示的「直接改」安全得多。

---

**5. 需要修改的檔案清單（按優先順序）**

**🔴 Phase 1 — 核心改動（Onboarding + 連接器）：**
```
ui/src/components/OnboardingWizard.tsx        ← 重寫為 Fleet 版
ui/src/adapters/openclaw-gateway/             ← 擴展現有 adapter
ui/src/index.css                              ← 套用 Pain Point 色系
ui/src/context/CompanyContext.tsx              ← 加 Fleet alias
server/src/routes/companies.ts                ← 加 Fleet onboarding endpoints
server/src/services/companies.ts              ← 加 Gateway 連接邏輯
packages/db/src/schema/fleet-aliases.ts       ← 新增 alias 檔
```

**🟡 Phase 2 — 顯示改名：**
```
ui/src/pages/Companies.tsx                    ← 文字改 Fleet
ui/src/pages/Agents.tsx                       ← 文字改 Bot
ui/src/pages/AgentDetail.tsx                  ← 文字改 Bot
ui/src/components/CompanyRail.tsx             ← 文字改 Fleet
ui/src/components/CompanySwitcher.tsx          ← 文字改 Fleet
ui/src/components/SidebarAgents.tsx           ← 文字改 Bot
ui/src/components/AgentConfigForm.tsx         ← 文字改 Bot
```

**🟢 Phase 3 — 新功能頁面：**
```
ui/src/pages/Costs.tsx                        ← 整合 Gateway usage
ui/src/pages/Activity.tsx                     ← 整合 Gateway events
ui/src/pages/Org.tsx / OrgChart.tsx           ← Bot 組織圖
server/src/realtime/live-events-ws.ts         ← 橋接 Gateway → Fleet WS
```

---

**6. 即時事件橋接架構（新想法）**

```
OpenClaw Bot A ──WS──→ ┌──────────────────┐
OpenClaw Bot B ──WS──→ │ Fleet Gateway    │ ──WS──→ Dashboard
OpenClaw Bot C ──WS──→ │ Bridge Service   │
OpenClaw Bot D ──WS──→ └──────────────────┘
                              │
                         Normalize events
                         to Paperclip format
```

Fleet 後端建立一個 **Gateway Bridge Service**：
1. 對每個已連接的 bot，維持一條 WebSocket 到其 OpenClaw Gateway
2. 接收 OpenClaw events（agent, presence, health, tick）
3. 轉譯為 Paperclip live event 格式（activity.logged, agent.status 等）
4. 透過既有的 `live-events-ws.ts` 推送到 Dashboard

→ 這樣前端幾乎不用改 real-time 邏輯，只需要改資料來源。

---

**7. Device Pairing 作為邀請機制（新想法）**

OpenClaw 已有完整的 device pairing 系統。我們可以利用它：

**原本的邀請流程（Planning #2）：**
```
生成邀請連結 → Bot 收到 → 連接
```

**升級版（利用 device pairing）：**
```
1. Fleet Dashboard 生成 pairing request
2. Bot 的 OpenClaw 收到 → device.pair.approve
3. Gateway 發回 deviceToken（唯一、可撤銷）
4. Fleet 用 deviceToken 持續連線（不需要明文 token）
5. 管理員可從 Dashboard 撤銷（device.token.revoke）
```

→ 比明文 token 安全得多，而且 OpenClaw 已經內建這功能。

---

**8. Onboarding Wizard 重新設計（v3，結合 device pairing）**

```
Step 1: "Name Your Fleet"
  - Fleet 名稱
  - Fleet 描述（選填）
  - Fleet icon/色彩（選填）

Step 2: "Connect Your First Bot"
  - 方式 A: 輸入 Gateway URL → Test Connection（GET /health）
           → 成功 → 輸入 Gateway Token
           → 建立 WS 連線 → 拉取 bot 資訊
  - 方式 B: 掃描 QR Code（Gateway URL + pairing token）
           → 自動連線 + device pairing
  - 方式 C: 區網自動發現（mDNS / broadcast）
           → 顯示找到的 Gateway 列表

Step 3: "Bot Profile"（自動填充 + 可編輯）
  - 🖼️ Pixel art 頭像（根據 bot 名稱自動選）
  - 📛 名稱（從 IDENTITY.md）
  - 💼 角色/職位（手動選）
  - 🛠️ Skills 列表（從 tools.catalog + skills.bins）
  - 📊 當前狀態（從 health）

Step 4: "Fleet Overview"
  - Dashboard 預覽
  - "Connect Another Bot" / "Generate Invite Link" / "Go to Dashboard"
```

→ 新增 QR Code 和區網發現，降低手動輸入的摩擦。

---

**9. 技術風險評估（新增）**

| 風險 | 嚴重度 | 緩解方案 |
|------|--------|----------|
| OpenClaw WS 握手需要 crypto signing | 🟡 中 | 用 Node.js crypto 模組，參考 Gateway 文件 |
| 多 bot 同時 WS 連線的記憶體壓力 | 🟡 中 | 連線池 + 懶連接（只在 Dashboard 打開時連） |
| Gateway token 明文存 DB | 🔴 高 | 用 device pairing + 加密存儲（已有 company_secrets 機制） |
| Paperclip DB migration 衝突 | 🟡 中 | 用 alias 策略，不改表名 |
| 前端 56+ 檔案改名的 regression | 🟡 中 | Phase 1 只改文字，不改變數名 |

---

**下一步 Planning #4：**
- 設計 Gateway Bridge Service 的具體 class 架構
- 建立 Onboarding Wizard v3 的 Figma mockup / ASCII wireframe
- 評估 QR Code 掃描的可行性（需要攝影頭？或只是 URL？）
- 確認 `openclaw-gateway` adapter 目前支援什麼（讀原始碼）
- 開始寫 CSS 色彩變數（index.css）

### Planning #4 — 2026-03-19 04:15
**主題：架構範式轉移 + 全新 API 發現 + 簡化策略**

---

**1. 根本架構洞察：「Read-Only Operator」模式（全新思路）**

Planning #3 設計的 Gateway Bridge Service **方向有誤**。

原版 Paperclip 的 `openclaw-gateway` adapter 是 **「控制者」模式**：
```
Paperclip → 發任務給 OpenClaw → 等結果 → 記錄
```

Fleet 需要的是 **「觀察者」模式**——完全相反：
```
Fleet → 連線到 OpenClaw → 被動監聽 → 顯示即時狀態
```

**具體差異：**
| 面向 | Paperclip 原版 adapter | Fleet 需要的模式 |
|------|----------------------|----------------|
| 角色 | 發起 agent turn | 只讀監控 |
| WS 方向 | 主動發 `req agent` | 被動聽 events |
| Scope | `operator.admin` | `operator.read`（最小權限）|
| 連線數 | 一次一個 bot | 同時 N 個 bots |
| 生命週期 | 任務完成就斷 | 長駐連線 |

**結論：不要改原有 adapter，建立新的 `fleet-monitor` service。**

```typescript
// server/src/services/fleet-monitor.ts
class FleetMonitorService {
  private connections: Map<string, GatewayConnection>;  // botId → WS

  // 連接到一個 bot 的 OpenClaw Gateway
  async connectBot(botId: string, gatewayUrl: string, token: string): Promise<void>;

  // 斷開連接
  async disconnectBot(botId: string): Promise<void>;

  // 被動事件訂閱（不發 agent turn）
  private onHealthEvent(botId: string, event: HealthEvent): void;
  private onPresenceEvent(botId: string, event: PresenceEvent): void;
  private onChatEvent(botId: string, event: ChatEvent): void;
  private onTickEvent(botId: string, event: TickEvent): void;

  // 主動查詢（低頻率，按需）
  async getBotSessions(botId: string): Promise<Session[]>;
  async getBotUsage(botId: string, dateRange?: DateRange): Promise<UsageReport>;
  async getBotAgentFiles(botId: string): Promise<AgentFile[]>;
  async getBotChannelStatus(botId: string): Promise<ChannelStatus[]>;
}
```

→ 比 Planning #3 的 Bridge 架構**簡單一半**，因為不需要「事件轉譯」——直接暴露 OpenClaw 原生事件。

---

**2. 完整 OpenClaw Gateway RPC 方法清單（比 Planning #3 多 3 倍）**

深度研究 Gateway protocol schema 後，發現大量之前遺漏的 API：

**🆕 Session 管理（Fleet 核心）：**
| 方法 | 用途 | Fleet 優先級 |
|------|------|-------------|
| `sessions.list` | 列出所有 sessions（含篩選、搜尋、衍生標題） | ✅ P0 |
| `sessions.usage` | Token 用量統計（日期範圍、context weight 分析） | ✅ P0 |
| `sessions.preview` | Session 對話預覽 | ✅ P1 |
| `sessions.resolve` | 根據 key/id/label 解析 session | ⚠️ P2 |
| `sessions.patch` | 修改 session 設定（model、thinking level 等） | ⚠️ P2 |
| `sessions.compact` | 手動壓縮 session | ⚠️ P3 |
| `sessions.reset` | 重置 session | ⚠️ P3 |
| `sessions.delete` | 刪除 session | ⚠️ P3 |

**🆕 Agent 檔案存取（不需 SSH！）：**
| 方法 | 用途 | Fleet 優先級 |
|------|------|-------------|
| `agents.list` | 列出所有 agent 設定 | ✅ P0 |
| `agents.files.list` | 列出 workspace 檔案（IDENTITY.md, SOUL.md, MEMORY.md...） | ✅ P0 |
| `agents.files.get` | **直接讀取** bot 的 IDENTITY.md / MEMORY.md | ✅ P0 |
| `agents.files.set` | 遠端寫入 bootstrap 檔案 | ⚠️ P2（遠端管理用） |
| `agent.identity` | 取得 agent 名稱、avatar、emoji | ✅ P0 |

**🆕 Chat 操作（Fleet Phase 3）：**
| 方法 | 用途 | Fleet 優先級 |
|------|------|-------------|
| `chat.send` | 發訊息給 bot（觸發 agent turn） | ⚠️ P2 |
| `chat.abort` | 中止正在執行的 agent turn | ⚠️ P2 |
| `chat.inject` | 注入系統訊息（不觸發 turn） | ⚠️ P3 |
| `chat.history` | 取得完整對話歷史 | ✅ P1 |

**🆕 Config 管理（遠端管理）：**
| 方法 | 用途 | Fleet 優先級 |
|------|------|-------------|
| `config.get` | 取得完整運行中 config | ⚠️ P2 |
| `config.patch` | 部分 config 更新（JSON merge patch） | ⚠️ P3 |
| `config.schema` | 取得 config JSON schema + UI hints | ⚠️ P2（動態 config editor） |

**🆕 其他有用 API：**
| 方法 | 用途 | Fleet 優先級 |
|------|------|-------------|
| `channels.status` | 所有 channel 狀態（Telegram、Discord、WhatsApp...） | ✅ P1 |
| `logs.tail` | 遠端 log tailing（cursor-based） | ⚠️ P2 |
| `models.list` | 可用 model 列表 | ✅ P1 |
| `skills.status` | Skill 啟用狀態 | ✅ P1 |
| `skills.install` | 安裝新 skill | ⚠️ P3 |
| `cron.list` | Cron jobs + 篩選/排序 | ✅ P0 |
| `cron.runs` | Cron 執行歷史 + token 用量 | ✅ P1 |
| `wake` | 觸發即時/下次 heartbeat | ⚠️ P2 |

→ **重大簡化：`sessions.usage` 一個 endpoint 就能搞定整個成本追蹤頁。不需要自己聚合！**

---

**3. mDNS 自動發現 — 已原生支援！（驚喜）**

OpenClaw Gateway 廣播 `_openclaw-gw._tcp` Bonjour/mDNS。

Planning #3 提到「區網自動發現」作為 nice-to-have，但現在確認 **Gateway 已內建**。

**實作方式：**
```typescript
// 用 Node.js 的 mdns / bonjour 套件
import Bonjour from 'bonjour-service';
const bonjour = new Bonjour();

bonjour.find({ type: 'openclaw-gw' }, (service) => {
  // service.host = '192.168.50.73'
  // service.port = 18789
  // service.txt = { version: '2026.1.24-3', ... }
  console.log(`Found bot at ws://${service.host}:${service.port}`);
});
```

**Onboarding Wizard Step 2 升級為三合一：**
```
┌─────────────────────────────────────────┐
│  Connect Your First Bot                 │
│                                         │
│  🔍 Scan Network          [Scanning...] │
│  ┌─────────────────────────────────┐    │
│  │ 🟢 clawdbot (192.168.50.73)    │    │
│  │ 🟢 bot-mini-1 (192.168.50.74)  │    │
│  │ 🟡 bot-mini-2 (192.168.50.75)  │    │
│  └─────────────────────────────────┘    │
│                                         │
│  ── or ──                               │
│                                         │
│  📝 Enter URL manually                  │
│  ┌─────────────────────────────────┐    │
│  │ ws://                           │    │
│  └─────────────────────────────────┘    │
│                                         │
│  ── or ──                               │
│                                         │
│  📱 Scan QR Code                        │
│  (Bot 的 Control UI 會顯示 QR)          │
│                                         │
└─────────────────────────────────────────┘
```

→ mDNS 發現讓 onboarding 從「手動輸入 URL」變成「點一下就連上」。UX 飛躍。

---

**4. 現有 Adapter 深度分析（1434 行，比想像完整得多）**

`packages/adapters/openclaw-gateway/src/server/execute.ts` 已經實作：

| 功能 | 實作狀態 | Fleet 可複用？ |
|------|---------|--------------|
| Ed25519 device auth + nonce signing | ✅ 完整 | ✅ 直接複用 crypto 邏輯 |
| Auto device pairing | ✅ `autoPairOnFirstConnect` | ✅ Fleet 連接時自動配對 |
| WS connect + challenge/response | ✅ 完整 | ✅ 抽出為共用模組 |
| Agent turn execution | ✅ 完整 | ❌ Fleet 不需要 |
| Token usage parsing | ✅ 從 response metadata | ✅ 改用 `sessions.usage` |
| Stream event processing | ✅ agent/error/lifecycle | 🔄 需擴展為全事件監聽 |
| Session key strategies | ✅ 三種策略 | ❌ Fleet 用不同方式 |
| Runtime service reporting | ✅ preview URLs | ⚠️ 可能有用 |

**關鍵複用策略：**
```
packages/adapters/openclaw-gateway/
├── src/
│   ├── server/
│   │   ├── execute.ts        ← 原版（Paperclip 控制模式）
│   │   ├── test.ts           ← 可複用
│   │   └── fleet-monitor.ts  ← 🆕 Fleet 觀察模式
│   ├── shared/
│   │   ├── ws-connect.ts     ← 🆕 抽出 WS 握手邏輯（兩模式共用）
│   │   ├── device-auth.ts    ← 🆕 抽出 Ed25519 邏輯
│   │   └── types.ts          ← 🆕 共用型別
│   ├── ui/
│   │   └── parse-stdout.ts   ← 可複用
│   └── cli/
│       └── print-stream.ts   ← 可複用
```

→ 不是從零開始，而是**從 execute.ts 抽出 200-300 行共用邏輯**，然後建 fleet-monitor.ts。

---

**5. Pain Point 品牌色完整版 + OKLch 轉換（Paperclip 用 Tailwind v4）**

⚠️ **重要發現：** Paperclip 用 Tailwind CSS v4 + OKLch 色彩空間，但 painpoint-ai.com 用 Tailwind v3 + hex。需要轉換。

**完整品牌色 → OKLch 對照表：**
```css
/* Pain Point Fleet — Color System (OKLch for Tailwind v4) */

/* === 溫暖品牌色（首頁） === */
--pp-cream-bg:     oklch(0.979 0.007 90);    /* #FAF9F6 → 頁面背景 */
--pp-dark-brown:   oklch(0.282 0.030 55);    /* #2C2420 → 主文字 */
--pp-brand-gold:   oklch(0.758 0.095 68);    /* #D4A373 → 主 accent */
--pp-medium-brown: oklch(0.663 0.088 62);    /* #B08968 → 次 accent */
--pp-taupe:        oklch(0.756 0.023 65);    /* #B8ADA2 → 次要文字 */
--pp-warm-gray:    oklch(0.646 0.016 60);    /* #948F8C → 中灰 */
--pp-light-warm:   oklch(0.867 0.015 70);    /* #DCD1C7 → 卡片/分隔 */
--pp-dark-variant: oklch(0.316 0.025 50);    /* #3D3530 → 深色漸層 */

/* === 功能色（產品頁 + 狀態） === */
--pp-teal-dark:    oklch(0.422 0.075 210);   /* #264653 → 深 teal */
--pp-teal:         oklch(0.648 0.120 180);   /* #2A9D8F → 主 teal */
--pp-green:        oklch(0.720 0.175 155);   /* #27BD74 → 在線/成功 */
--pp-green-alt:    oklch(0.742 0.180 152);   /* #2AC46B → CTA */
--pp-navy:         oklch(0.468 0.080 245);   /* #376492 → 標題 */
--pp-purple:       oklch(0.530 0.235 300);   /* #9940ED → 強調 */

/* === 漸層預設 === */
--pp-gradient-warm:  linear-gradient(135deg, var(--pp-brand-gold), var(--pp-medium-brown));
--pp-gradient-dark:  linear-gradient(135deg, var(--pp-dark-brown), var(--pp-dark-variant));
--pp-gradient-cream: linear-gradient(135deg, var(--pp-cream-bg), oklch(0.961 0.010 80));
--pp-gradient-cta:   linear-gradient(90deg, var(--pp-teal), var(--pp-navy));

/* === 狀態色（混合兩套） === */
--status-online:   var(--pp-green);
--status-working:  var(--pp-teal);
--status-idle:     var(--pp-brand-gold);
--status-error:    oklch(0.637 0.237 25);    /* destructive red */
--status-offline:  var(--pp-warm-gray);
```

**新增設計 token（從官網提取）：**
```css
/* Pain Point 特有的 hover 效果 */
--hover-lift: translateY(-2px);
--hover-scale: scale(1.02);
--hover-shadow-glow: 0 8px 24px oklch(0.758 0.095 68 / 0.3);  /* gold glow */

/* 圓角系統（比 Paperclip 更圓潤） */
--radius-button: 1.5rem;   /* 24px — pill 膠囊型 */
--radius-card: 1rem;        /* 16px */
--radius-input: 0.5rem;     /* 8px */
```

---

**6. 控制 UI 整合策略（不重造輪子）**

**重大發現：** OpenClaw Gateway 本身已有 Control UI（`http://127.0.0.1:18789`）。

**策略：Fleet Dashboard ≠ 重建 Control UI**
```
┌──────────────────────────────────────────────────┐
│  Fleet Dashboard（我們做的）                       │
│  ├── 多 bot 概覽（Control UI 做不到）              │
│  ├── 組織圖（Control UI 做不到）                   │
│  ├── 跨 bot 成本匯總（Control UI 做不到）          │
│  ├── 車隊活動時間線（Control UI 做不到）            │
│  └── Bot Detail → 嵌入/深連結到 Control UI        │
│       ├── Config Editor → iframe or link          │
│       ├── Session Browser → 我們自己做（更好的 UX） │
│       └── Log Viewer → link to Control UI         │
└──────────────────────────────────────────────────┘
```

→ Fleet 專注做 **「多 bot 獨有」** 的功能，單 bot 進階操作可以深連結到 Control UI。
→ 省下 50%+ 的開發時間。

---

**7. 成本追蹤架構（簡化為一個 API 呼叫）**

Planning #3 沒提到 `sessions.usage` 的強大：

```typescript
// 一次呼叫就拿到完整成本資料
const usage = await gateway.rpc('sessions.usage', {
  dateRange: { from: '2026-03-01', to: '2026-03-19' },
  includeContextWeight: true
});

// 回傳：
{
  sessions: [
    {
      sessionKey: 'patrol-morning',
      inputTokens: 45000,
      outputTokens: 12000,
      cachedInputTokens: 30000,
      // context weight = system prompt 佔多少
    }
  ],
  total: { inputTokens: 180000, outputTokens: 48000, ... }
}
```

**成本頁面設計（ASCII Wireframe）：**
```
┌─ Fleet Costs ──────────────────────────────────┐
│                                                 │
│  📊 This Month: $42.50 USD                     │
│  ├── 🦞 小龍蝦: $18.20 (43%)  ████████░░      │
│  ├── 🐿️ 飛鼠:   $12.30 (29%)  █████░░░░░      │
│  ├── 🦚 孔雀:   $8.00 (19%)   ███░░░░░░░      │
│  └── 🐗 山豬:   $4.00 (9%)    █░░░░░░░░░      │
│                                                 │
│  📈 Daily Trend                                 │
│  [Line chart: 30 天每日成本]                     │
│                                                 │
│  📋 By Session                                  │
│  ┌─────────────────────────────────────────┐    │
│  │ Bot      Session         Tokens    Cost │    │
│  │ 🦞       patrol-am       45K      $2.10│    │
│  │ 🦞       fleet-plan      32K      $1.50│    │
│  │ 🐿️       code-review     28K      $1.30│    │
│  └─────────────────────────────────────────┘    │
└─────────────────────────────────────────────────┘
```

---

**8. Dashboard 首頁 ASCII Wireframe（全新設計）**

```
┌─ Fleet Dashboard ────────────────────────────────────────┐
│                                                           │
│  ┌─ Fleet Health ──┐  ┌─ Today ───────┐  ┌─ Cost ──────┐│
│  │ 🟢 3 Online     │  │ 📨 47 msgs    │  │ 💰 $3.20    ││
│  │ 🟡 1 Idle       │  │ ✅ 12 tasks   │  │ ↑ 5% vs avg ││
│  │ 🔴 0 Error      │  │ 🔄 3 cron     │  │             ││
│  └─────────────────┘  └───────────────┘  └─────────────┘│
│                                                           │
│  ┌─ Bots ─────────────────────────────────────────────┐  │
│  │                                                     │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐         │  │
│  │  │ 🦞       │  │ 🐿️       │  │ 🦚       │         │  │
│  │  │ 小龍蝦   │  │ 飛鼠     │  │ 孔雀     │         │  │
│  │  │ 🟢 Online│  │ 🟢 Work  │  │ 🟡 Idle  │         │  │
│  │  │ 2 active │  │ 1 active │  │ 0 active │         │  │
│  │  │ sessions │  │ sessions │  │ sessions │         │  │
│  │  │          │  │          │  │          │         │  │
│  │  │ Last:    │  │ Last:    │  │ Last:    │         │  │
│  │  │ "fleet   │  │ "review  │  │ "3hr ago"│         │  │
│  │  │  plan.." │  │  PR #42" │  │          │         │  │
│  │  └──────────┘  └──────────┘  └──────────┘         │  │
│  │                                                     │  │
│  └─────────────────────────────────────────────────────┘  │
│                                                           │
│  ┌─ Recent Activity ──────────────────────────────────┐  │
│  │ 🦞 14:32  Completed "fleet planning iteration #4"  │  │
│  │ 🐿️ 14:28  Started code review on PR #42            │  │
│  │ 🦚 14:15  Cron "morning-report" finished           │  │
│  │ 🐗 13:50  Connected to fleet                       │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

---

**9. 修訂的 Phase 計畫（基於新發現重排優先順序）**

### 修訂 Phase 1: 基礎連接 (MVP)
```
Week 1:
- [x] 完整計畫文件（Planning #1-#4）
- [ ] 從 execute.ts 抽出共用模組（ws-connect.ts, device-auth.ts）
- [ ] 建立 FleetMonitorService（operator.read 模式）
- [ ] 實作 mDNS 自動發現（`_openclaw-gw._tcp`）
- [ ] 套用 Pain Point OKLch 色彩變數到 index.css
- [ ] 改 Onboarding Wizard（三合一連接方式）

Week 2:
- [ ] Dashboard 首頁（健康概覽 + bot 卡片）
- [ ] Bot Detail 頁（sessions.list + agent.identity + agents.files.get）
- [ ] 即時狀態更新（presence + health events）
```

### 修訂 Phase 2: 資料豐富化
```
- [ ] 成本追蹤頁（sessions.usage）
- [ ] Session 瀏覽器（chat.history）
- [ ] Channel 狀態顯示（channels.status）
- [ ] Cron 管理頁（cron.list + cron.runs）
- [ ] Skills 展示（tools.catalog + skills.status）
```

### 修訂 Phase 3: 互動功能
```
- [ ] 從 Dashboard 發訊息給 bot（chat.send）
- [ ] 從 Dashboard 中止 agent turn（chat.abort）
- [ ] 遠端 config 管理（config.get + config.patch + config.schema 動態 UI）
- [ ] 遠端 agent 檔案編輯（agents.files.set）
- [ ] 邀請連結 + device pairing 流程
- [ ] 組織圖（reportsTo 關係）
```

### 修訂 Phase 4: 打磨
```
- [ ] Pixel art bot 頭像
- [ ] 手機 responsive
- [ ] Control UI 深連結整合
- [ ] 效能優化（懶連接、event batching）
- [ ] Multi-fleet 支援
```

---

**10. 技術決定更新**

| 決定 | 原方案 | 新方案 | 原因 |
|------|--------|--------|------|
| 架構模式 | Gateway Bridge（轉譯事件） | FleetMonitorService（直接消費事件） | 不需要轉譯，省一半工作 |
| 連接方式 | 手動輸入 URL | mDNS + 手動 + QR | Gateway 已支援 Bonjour |
| 成本追蹤 | 自己聚合 turn-level 用量 | `sessions.usage` 一次拿 | API 已經做好了 |
| Bot 資訊讀取 | SSH / 檔案系統 | `agents.files.get` RPC | 不需要存取檔案系統 |
| 進階功能 | 全部自己做 | 深連結到 Control UI | 避免重造輪子 |
| 色彩空間 | hex | OKLch | Paperclip 用 Tailwind v4 |
| WS scope | operator.admin | operator.read（預設） | 最小權限原則 |

---

**11. 風險更新**

| 新風險 | 嚴重度 | 緩解 |
|--------|--------|------|
| mDNS 在某些網路環境被封鎖 | 🟡 中 | 保留手動輸入作為 fallback |
| `operator.read` scope 可能不夠用 | 🟡 中 | 按需升級到 `operator.write`，UI 提示授權 |
| 多 bot WS 長駐連線的 memory leak | 🟡 中 | 心跳檢測 + 自動重連 + 連線池上限 |
| OKLch 色彩轉換精度 | 🟢 低 | 用工具精確轉換，視覺比對 |
| Control UI iframe 跨域問題 | 🟡 中 | 改用深連結（新分頁），不用 iframe |

---

**下一步 Planning #5（如果執行）：**
- 🔧 **開始寫程式碼**（iteration >= 5）
  - 第一個 PR：CSS 色彩變數 + 術語改名
  - 第二個 PR：FleetMonitorService + ws-connect.ts + device-auth.ts
  - 第三個 PR：Onboarding Wizard 改版
- 需要 Alex 確認：mDNS vs 手動輸入的優先順序
- 需要 Alex 確認：Control UI 深連結 vs 自己重做的取捨

### Planning #5 — 2026-03-19 05:30
**主題：開始寫程式碼 + 產品定位洞察 + 通道感知設計 + 主題系統一鍵變身**

---

**🔧 iteration >= 5 → 正式進入開發階段**

本次 Planning 同時產出計畫更新 + 第一批程式碼改動。

---

**1. 重大產品洞察：Pain Point = 「商機特工」AI 語音問卷平台（全新發現）**

深度研究 painpoint-ai.com 後發現，這不是一個通用 AI 平台：

```
Pain Point 的產品名稱：「商機特工」(Pipeline Agent)
產品定位：AI 語音問卷平台
核心功能：AI 打語音電話做市場調查 / 銷售資格認證
```

**這完全改變了 Fleet Dashboard 的指標設計：**

| 原本（通用 bot 監控） | 升級版（商機特工車隊監控） |
|----------------------|------------------------|
| Messages sent | 📞 Calls made / Surveys completed |
| Tasks completed | 🎯 Leads qualified / Conversion rate |
| Active sessions | 📊 Active campaigns / Call queues |
| Token usage | 💰 Cost per lead / ROI per campaign |

**Dashboard 首頁 KPI 卡片重設計：**
```
┌─ Fleet Health ──┐  ┌─ Today ─────────┐  ┌─ Pipeline ─────┐
│ 🟢 3 Online     │  │ 📞 142 calls    │  │ 🎯 23 leads    │
│ 🟡 1 Idle       │  │ ✅ 89 completed │  │ 📈 16.2% conv  │
│ 🔴 0 Error      │  │ ⏱ avg 3m12s    │  │ 💰 $1.85/lead  │
└─────────────────┘  └─────────────────┘  └────────────────┘
```

→ 這些指標可以從 `sessions.usage` + `sessions.list` 推算。
→ Phase 2 可加入自定義 dashboard widget，讓使用者選擇要看的 KPI。

---

**2. LINE 通道整合發現（全新）**

painpoint-ai.com 使用 LINE 作為主要通訊通道：
- 發現 LINE 品牌色 `#00B900`（亮綠）在網站 CSS 中
- 也發現 hover 暗色 `#00A000`
- 這表示 OpenClaw bots 透過 LINE 與客戶對話

**通道感知 Dashboard 設計：**

OpenClaw Gateway 的 `channels.status` API 回傳每個 bot 連接的通道。
Fleet Dashboard 應該用通道品牌色顯示：

```css
/* 通道品牌色 */
--channel-line:      #00B900;  /* LINE */
--channel-telegram:  #26A5E4;  /* Telegram */
--channel-discord:   #5865F2;  /* Discord */
--channel-whatsapp:  #25D366;  /* WhatsApp */
--channel-imessage:  #34C759;  /* iMessage */
--channel-slack:     #4A154B;  /* Slack */
--channel-web:       var(--pp-teal);  /* Web Chat */
```

**Bot 卡片加入通道指示器：**
```
┌──────────────┐
│ 🦞 小龍蝦    │
│ 🟢 Online    │
│              │
│ Channels:    │
│ ● LINE      │  ← 用 LINE 綠色圓點
│ ● Telegram  │  ← 用 Telegram 藍色圓點
│              │
│ 📞 42 calls │
│ 🎯 7 leads  │
└──────────────┘
```

---

**3. 主題系統一鍵變身策略（全新技術洞察）**

**發現：Paperclip 整個視覺身份由 `:root` 中 ~30 個 CSS custom properties 控制。**

這意味著：
- **改一個檔案（index.css）= 整個 app 變身 Pain Point 品牌**
- 不需要改任何 JSX/TSX 組件
- 所有按鈕、卡片、側邊欄、彈窗自動跟著變

**具體發現 — Paperclip 的 0 圓角設計：**
```css
/* Paperclip 原版 */
--radius: 0;        /* 完全直角 */
--radius-lg: 0px;   /* 大元素也是直角 */
--radius-xl: 0px;   /* 全部直角 */
```

**Pain Point 是膠囊/圓潤設計：**
```css
/* Fleet 版 */
--radius: 0.75rem;     /* 12px — 柔和圓角 */
--radius-sm: 0.5rem;   /* 8px */
--radius-md: 0.75rem;  /* 12px */
--radius-lg: 1rem;     /* 16px — 卡片 */
--radius-xl: 1.5rem;   /* 24px — 膠囊按鈕 */
```

→ **一個 CSS 變數就能讓整個 app 從「冷硬科技風」變成「溫暖品牌風」。**

**Dark Mode 策略（新決定）：**

Paperclip dark mode 用純灰色 `oklch(0.145 0 0)`。
Pain Point 沒有 dark mode，但我們要保留它（開發者喜歡）。
策略：**Warm Dark** — 用深棕色代替純灰。

```css
/* Paperclip 原版 dark */
--background: oklch(0.145 0 0);     /* 冷灰黑 */

/* Fleet 版 warm dark */
--background: oklch(0.155 0.015 55); /* 暖深棕 */
```

---

**4. OnboardingWizard.tsx 分析（全新，影響開發策略）**

OnboardingWizard.tsx 是 **1800+ 行、66.7KB** 的巨型組件。

**關鍵結構發現：**
- Step 1: 建立 Company（名稱、prefix、描述）
- Step 2: 選擇 Adapter 類型 + 設定（支援 claude-local、openclaw-gateway 等 7 種）
- Step 3: 建立第一個 Issue/Goal
- Step 4: 啟動 Agent

**Fleet 改造策略（漸進式，不整個重寫）：**

```
Step 1: "Create Your Fleet" ← 改 Company 表單文字
  - Company name → Fleet name
  - Issue prefix → Fleet prefix
  - 加入 Fleet icon/品牌色選擇器

Step 2: "Connect Your First Bot" ← 最大改動
  - 鎖定 adapter type = openclaw_gateway（隱藏其他選項）
  - 加入 mDNS 自動發現面板
  - 加入 "Test Connection" 按鈕（GET /health）
  - 加入 Bot Profile 自動填充（agent.identity + agents.files.get）

Step 3: "Set Up Monitoring" ← 改 Issue → Monitoring Goal
  - 不是建立 Issue，而是設定監控偏好
  - 選擇要追蹤的 KPI（calls, leads, cost）
  - 設定通知閾值

Step 4: "Launch Fleet" ← 改 Launch Agent → Start Monitoring
  - 不是啟動 agent（bot 已經在跑了）
  - 而是啟動 Fleet Monitor Service 連線
  - 顯示第一個 health check 結果
```

→ **Step 2 是唯一需要大改的步驟。其他 3 步只需改文字 + 微調。**

---

**5. 現有頁面 1:1 映射（零新頁面，全改名）**

| Paperclip 頁面 | Fleet 用途 | 改動量 |
|---------------|-----------|--------|
| Dashboard.tsx | Fleet 儀表板 | 🟡 改 KPI 來源 |
| Companies.tsx | Fleet 列表 | 🟢 只改文字 |
| Agents.tsx | Bot 列表 | 🟢 只改文字 |
| AgentDetail.tsx | Bot 詳情 | 🟡 加 Gateway 即時資料 |
| Costs.tsx | 成本追蹤 | 🟡 接 sessions.usage |
| Activity.tsx | 車隊活動 | 🟢 只改文字 |
| OrgChart.tsx | 組織圖 | 🟢 只改文字 |
| CompanySettings.tsx | Fleet 設定 | 🟢 只改文字 |
| Projects.tsx | 行銷活動管理（Campaign） | 🟡 改概念映射 |
| Issues.tsx | 任務/工單 | 🟢 保持原樣 |

→ **不需要建立任何新頁面檔案。** 所有 Fleet 功能都映射到現有頁面。

---

**6. 開發 Commit 計畫（Planning #5 產出）**

**Commit 1（本次執行）：🎨 Pain Point 品牌主題**
```
改動：ui/src/index.css
- :root 色彩全部換成 Pain Point 品牌色（OKLch）
- 圓角從 0 → 12-24px
- Dark mode 改為 warm dark
- 加入 Fleet 專用 CSS 變數（通道色、狀態色）
- 加入 Pain Point 設計 token（hover 效果、漸層）
```

**Commit 2（本次執行）：📦 Fleet Schema Aliases**
```
新增：packages/db/src/schema/fleet-aliases.ts
- export { companies as fleets } from './companies'
- export { agents as bots } from './agents'
- export { companyMemberships as fleetMemberships }
```

**Commit 3（本次執行）：✏️ UI 術語改名（高頻觸點）**
```
改動：
- ui/src/App.tsx — 頁面標題文字
- ui/src/components/Layout.tsx — 導航文字
- ui/src/pages/Companies.tsx — Company → Fleet
- ui/src/components/CompanyRail.tsx — 側欄文字
- ui/src/components/Sidebar.tsx — 側欄文字
```

**Commit 4（下次 iteration）：🔌 FleetMonitorService**
```
新增：server/src/services/fleet-monitor.ts
- WebSocket 連線管理（被動監聽模式）
- 複用 execute.ts 的 Ed25519 + nonce signing 邏輯
- 事件轉發到 live-events-ws.ts
```

---

**7. OpenClaw Gateway API 研究更新（補充確認）**

確認 OpenClaw Gateway 是 **AI agent 訊息路由器**（不是法律科技）：
- 核心功能：連接 messaging apps（LINE、Telegram、Discord 等）到 AI coding agents
- Gateway 是 WebSocket-first 架構，單一 port 服務 WS + HTTP
- mDNS 廣播 `_openclaw-gw._tcp`
- 完整的 device pairing + Ed25519 認證
- Node.js >= 22 運行時

確認 Planning #3-#4 的 API 清單準確無誤。新增確認：
- `openclaw gateway run` — 啟動 gateway
- `openclaw gateway health` — 健康檢查
- `openclaw gateway status` — 完整狀態
- `openclaw gateway probe` — 網路探測

---

**8. 品牌色最終確認（第三次研究，交叉驗證）**

三次獨立研究結果一致，最終確定：

```
核心三色：
  #2C2420  深棕（主文字）     — 三次研究一致 ✅
  #D4A373  金棕（主 accent）  — 三次研究一致 ✅（±1 hex）
  #FAF9F6  米白（背景）       — 三次研究一致 ✅（±2 hex）

次要色：
  #B08968  中棕（hover）      — 兩次確認 ✅
  #3D3530  深棕變體（漸層）    — 兩次確認 ✅
  #B8ADA2  灰褐（次要文字）    — 兩次確認 ✅
  #948F8C  暖灰（muted）      — 兩次確認 ✅

功能色（產品頁）：
  #264653  深 teal（標題）     — 兩次確認 ✅
  #2A9D8F  teal（accent）     — 兩次確認 ✅
  #376492  海軍藍（標題）      — 一次確認
  #27BD74  綠（CTA/在線）      — 兩次確認 ✅
  #9940ED  紫（強調）          — 一次確認

平台色：
  #00B900  LINE 綠             — 首次發現 🆕
  #00A000  LINE 深綠（hover）   — 首次發現 🆕
```

→ 品牌色已完全確定，不需要再研究。

---

**9. 風險更新**

| 新風險 | 嚴重度 | 緩解 |
|--------|--------|------|
| OnboardingWizard 1800 行改動風險 | 🔴 高 | 漸進式改造，只改 Step 1-2 文字，Step 2 連接邏輯分離成獨立組件 |
| 品牌色在 OKLch 轉換後色差 | 🟢 低 | 已用工具轉換，三次研究交叉驗證 |
| 「商機特工」專用 KPI 與通用 Dashboard 衝突 | 🟡 中 | Dashboard widget 系統，讓使用者選擇 KPI 類型 |
| LINE 通道色與狀態色混淆 | 🟢 低 | 通道色只用在通道指示器，狀態色用在 bot 卡片邊框 |

---

**下一步 Planning #6（如果需要）：**
- 開始 FleetMonitorService 開發（ws-connect.ts 共用模組）
- Onboarding Wizard Step 2 重寫（Gateway 連接 UI）
- mDNS 自動發現整合
- 第一次 end-to-end 測試（連接真實 OpenClaw bot）

### Planning #6 — 2026-03-19 06:45
**主題：連線韌性架構 + Bot 狀態機 + Mock Gateway + 實作 FleetMonitorService**

---

**🔧 iteration >= 5 → 繼續開發，本次產出 FleetMonitorService 核心程式碼**

---

**1. Bot 連線狀態機（全新設計，之前未提及）**

之前的 planning 只說「在線/離線」，但真實場景需要更細膩的狀態：

```
                    ┌──────────────────────────────────┐
                    │                                  │
  ┌─────────┐   connect()   ┌──────────────┐   challenge   ┌────────────────┐
  │ DORMANT │──────────────→│ CONNECTING   │─────────────→│ AUTHENTICATING │
  └─────────┘               └──────────────┘              └────────────────┘
       ↑                         │ error                        │ hello-ok
       │ max retries             ↓                              ↓
       │                   ┌──────────────┐              ┌──────────────┐
       └───────────────────│ BACKOFF      │              │ MONITORING   │
                           └──────────────┘              └──────────────┘
                                 ↑                          │    │
                                 │ reconnect timer          │    │ health/presence/tick
                                 │                          │    ↓
                                 │                     ┌──────────────┐
                                 └─────────────────────│ DISCONNECTED │
                                                       └──────────────┘
```

**狀態定義：**
```typescript
type BotConnectionState =
  | "dormant"          // 從未連接，或已放棄重連
  | "connecting"       // WebSocket 正在建立 TCP 連線
  | "authenticating"   // WS 開了，等待 challenge → connect → hello-ok
  | "monitoring"       // 已連接，正在接收事件
  | "disconnected"     // 連線斷開，等待重連
  | "backoff"          // 重連中，等待 backoff timer
  | "error";           // 永久錯誤（如 token 被撤銷、Gateway 不存在）
```

**每次狀態轉換都會：**
1. 更新 DB 中的 `agentRuntimeState`
2. 發布 `agent.status` LiveEvent → 前端即時更新 bot 卡片
3. 記錄 `activityLog` 條目 → 出現在活動時間線

→ **之前只想到「連上/斷開」，現在有完整的狀態機，UI 可以顯示精確的連線階段。**

---

**2. 重連韌性架構（全新，之前只提到「自動重連」但沒設計）**

**指數退避 + 抖動（Exponential Backoff with Jitter）：**
```typescript
const RECONNECT_CONFIG = {
  initialDelayMs: 1_000,       // 第一次重連等 1 秒
  maxDelayMs: 60_000,          // 最長等 1 分鐘
  multiplier: 2,               // 每次翻倍
  jitterFactor: 0.3,           // ±30% 隨機抖動（避免 thundering herd）
  maxAttempts: Infinity,       // 永不放棄（除非是永久錯誤）
  resetAfterMs: 300_000,       // 穩定連線 5 分鐘後，重置 retry 計數
};
```

**Circuit Breaker 模式（新增，之前沒有）：**
```
正常 ←──────── 半開 ←──── 冷卻計時 ←──── 斷開
  │                │                        ↑
  │ N 次失敗       │ 測試連線成功             │ 測試連線失敗
  └───→ 斷開 ──→ 冷卻計時 ──→ 半開 ──→ 正常  │
                                    └────────┘
```

當某個 bot 的 Gateway 連續失敗 5 次，進入「circuit breaker 斷開」狀態：
- 停止嘗試連線 2 分鐘
- 2 分鐘後發一次「半開」測試（HTTP GET /health）
- 成功 → 恢復 WS 連線
- 失敗 → 再等 4 分鐘（指數增長）

→ **避免對已死 Gateway 無限重連浪費資源。**

---

**3. 資料新鮮度指示器（全新 UX 概念）**

**問題：** 當 WS 斷線時，Dashboard 顯示的是過期資料，但使用者不知道。

**解決方案：每筆資料都帶 timestamp，UI 顯示新鮮度：**

```typescript
type DataFreshness = {
  lastUpdated: Date;
  source: "realtime" | "poll" | "cached";
  staleAfterMs: number;  // 超過這個時間就標記為 stale
};
```

**UI 表現：**
```
🟢 2s ago     — 即時（綠色，正常顯示）
🟡 45s ago    — 輕微延遲（黃色小標記）
🟠 2m ago     — 資料可能過時（橘色標記 + "May be outdated"）
🔴 5m+ ago   — 資料過時（紅色標記 + "Connection lost — reconnecting..."）
⚫ Unknown    — 從未成功取得資料
```

**Bot 卡片顯示：**
```
┌──────────────────┐
│ 🦞 小龍蝦        │
│ 🟢 Online        │
│                   │
│ 📊 $3.20 today  │
│ 📞 42 calls     │
│                   │
│ ⏱ Updated 2s ago │  ← 新增：新鮮度指示器
└──────────────────┘
```

→ **使用者永遠知道他們看到的資料有多新。這是監控 Dashboard 的核心 UX 要求。**

---

**4. Mock Gateway Server（全新，開發必需品）**

**問題：** 沒有 Mock Gateway，開發者必須啟動真實 OpenClaw bot 才能開發 Fleet Dashboard。

**解決方案：建立輕量 Mock Gateway 用於開發和測試。**

```typescript
// scripts/mock-gateway.ts
// 用 Node.js ws + http 啟動一個假的 Gateway
// - GET /health → {"ok":true,"status":"live"}
// - WS 握手 → 發 connect.challenge → 接受任何 token
// - 定期發送模擬事件（presence、health、tick）
// - sessions.list → 回傳假資料
// - sessions.usage → 回傳假 token 用量
// - agents.files.get → 回傳假 IDENTITY.md
```

**使用方式：**
```bash
# 開發時啟動 3 個假 bot
pnpm mock-gateway --port 18789 --name "小龍蝦" --emoji "🦞"
pnpm mock-gateway --port 18790 --name "飛鼠" --emoji "🐿️"
pnpm mock-gateway --port 18791 --name "孔雀" --emoji "🦚"
```

**好處：**
- 前端開發不需要真 bot → 開發速度翻倍
- CI 測試可以用 Mock Gateway → 不需要 bot 基礎設施
- 可以模擬各種邊界情況（斷線、高延遲、錯誤回應）

→ **Planning #5 開始寫程式碼但沒提到開發工具。Mock Gateway 是開發效率的關鍵。**
→ **留到下一個 iteration 實作，本次先完成 FleetMonitorService。**

---

**5. Progressive Enhancement 策略（全新，之前只想到 WS）**

**分三層資料取得方式，向下相容：**

```
Layer 3: WebSocket 即時事件（最佳體驗）
  ↑ 需要 WS 長駐連線
  │
Layer 2: HTTP Polling（降級方案）
  ↑ 只需要 GET /health，每 30 秒 poll 一次
  │
Layer 1: 靜態快取（離線方案）
  ↑ 上次成功取得的資料 + timestamp
```

**為什麼這很重要：**
- 並非所有 Gateway 都開放 WS（可能只有 HTTP /health）
- 防火牆可能封 WS（企業環境常見）
- 手機上 WS 可能被 OS 殺掉

**FleetMonitorService 的 transport 選擇邏輯：**
```typescript
async function negotiateTransport(gatewayUrl: string): Promise<"ws" | "http-poll"> {
  // 1. 先嘗試 WS
  // 2. 如果 WS 失敗，fallback 到 HTTP polling
  // 3. 如果 HTTP 也失敗，用 cached data + stale indicator
}
```

→ **之前假設所有 bot 都能用 WS，但現實中需要 graceful degradation。**

---

**6. Fleet Event Bus 內部架構（全新，解耦 Gateway 連線與 UI 消費者）**

**問題：** FleetMonitorService 直接呼叫 `publishLiveEvent()` 耦合太緊。

**解決方案：內部 Event Bus 解耦。**

```
Gateway WS ──→ FleetMonitorService ──→ FleetEventBus ──→ LiveEvents (existing)
                                           │
                                           ├──→ CostAggregator
                                           ├──→ ActivityLogger
                                           └──→ AlertService (future)
```

```typescript
// Fleet-specific events（不修改 Paperclip 的 LIVE_EVENT_TYPES）
type FleetEventType =
  | "fleet.bot.health"       // bot 健康狀態變更
  | "fleet.bot.presence"     // bot 上下線
  | "fleet.bot.chat"         // bot 收到/發出聊天
  | "fleet.bot.tick"         // 15 秒心跳
  | "fleet.bot.connected"    // Fleet 成功連上 bot
  | "fleet.bot.disconnected" // Fleet 與 bot 斷線
  | "fleet.bot.error"        // bot 連線錯誤
  | "fleet.cost.updated"     // 某 bot 的成本更新
  | "fleet.alert.triggered"; // 觸發了告警（成本超標、bot 離線太久等）
```

→ **比直接改 Paperclip 的 LIVE_EVENT_TYPES 安全，Fleet 事件在自己的 namespace。**
→ **也為未來的 AlertService（成本超標通知、bot 離線告警）提供基礎。**

---

**7. Gateway 能力偵測（全新，版本相容性）**

**問題：** 不同版本的 OpenClaw Gateway 支援不同的 RPC 方法。

**hello-ok 回應中的 `features.methods` 告訴我們 Gateway 支援什麼：**
```json
{
  "features": {
    "methods": ["health", "status", "sessions.list", "sessions.usage", ...],
    "events": ["agent", "chat", "presence", "tick", "health", ...]
  }
}
```

**FleetMonitorService 根據 capabilities 調整行為：**
```typescript
class BotConnection {
  private capabilities: Set<string>;

  // 只在 Gateway 支援時才呼叫
  async getSessions(): Promise<Session[] | null> {
    if (!this.capabilities.has("sessions.list")) return null;
    return this.rpc("sessions.list", {});
  }

  async getUsage(): Promise<UsageReport | null> {
    if (!this.capabilities.has("sessions.usage")) return null;
    return this.rpc("sessions.usage", {});
  }
}
```

→ **之前假設所有 Gateway 都支援全部 API。實際上不同版本可能差異很大。**

---

**8. 連線預算與背壓控制（全新，大規模場景）**

**問題：** 如果某個 Fleet 有 50 個 bot，同時建 50 個 WS 連線會：
- 佔用大量 memory（每個 WS buffer ~256KB-1MB）
- 造成 event flooding（50 個 bot 同時發 tick = 每 15 秒 50 個事件）

**解決方案：連線預算系統。**
```typescript
const CONNECTION_BUDGET = {
  maxConcurrentWs: 20,         // 最多 20 個 WS 長駐連線
  overflowStrategy: "http-poll", // 超出的 bot 用 HTTP polling
  priorityBasis: "lastActivity", // 最近活躍的 bot 優先用 WS
  eventBatchIntervalMs: 2_000,  // 批次處理事件，每 2 秒推送一次
};
```

**優先級排序：**
1. 🟢 Online + Active session → WS 連線
2. 🟡 Online + Idle → WS 連線（如果預算夠）
3. ⚫ Offline → HTTP poll 每分鐘一次
4. 🔴 Error → Circuit breaker（不消耗預算）

→ **Planning #4 提到「連線池 + 懶連接」但沒有具體設計。現在有了完整的連線預算系統。**

---

**9. 本次程式碼產出**

**Commit 5: FleetGatewayClient — 長駐 WS 連線客戶端**
```
新增：server/src/services/fleet-gateway-client.ts
- 基於 execute.ts 的 GatewayWsClient 模式
- 但設計為長駐連線（不是一次性 agent turn）
- 自動重連 + 指數退避 + circuit breaker
- 事件轉發（被動監聽模式）
- Capability detection（從 hello-ok 讀取 features）
- Ed25519 device auth（複用 execute.ts 邏輯）
```

**Commit 6: FleetMonitorService — 核心監控服務**
```
新增：server/src/services/fleet-monitor.ts
- 管理多個 BotConnection
- 連線預算控制
- Fleet Event Bus 整合
- 主動查詢方法（getSessions、getUsage、getFiles）
- 資料新鮮度追蹤
- 整合到 Paperclip 的 LiveEvent 系統
```

**Commit 7: Fleet Monitor API Routes**
```
新增：server/src/routes/fleet-monitor.ts
- POST /api/fleet-monitor/connect — 連接 bot
- DELETE /api/fleet-monitor/disconnect/:botId — 斷開
- GET /api/fleet-monitor/status — 所有 bot 連線狀態
- GET /api/fleet-monitor/bot/:botId/health — 即時健康
- GET /api/fleet-monitor/bot/:botId/sessions — Session 列表
- GET /api/fleet-monitor/bot/:botId/usage — Token 用量
- GET /api/fleet-monitor/bot/:botId/files/:filename — 讀取檔案
```

---

**10. 風險更新**

| 新風險 | 嚴重度 | 緩解 |
|--------|--------|------|
| WS 長駐連線的 memory leak（event listeners 累積） | 🔴 高 | 嚴格的 removeListener + WeakRef + 定期 GC 檢查 |
| 50+ bot 同時重連的 thundering herd | 🟡 中 | Jitter + 連線預算 + staggered reconnect |
| Gateway 版本不相容（缺少 features 欄位） | 🟡 中 | Graceful fallback + 手動 capability override |
| Mock Gateway 與真 Gateway 行為偏差 | 🟡 中 | Mock 基於 Protocol v3 spec，定期對照真實 Gateway |
| FleetEventBus 訂閱者忘記 unsubscribe 造成 memory leak | 🟡 中 | WeakRef 訂閱 + 自動清理 dead listeners |

---

**11. 與前幾次 Planning 的關鍵差異**

| 面向 | 之前的想法 | Planning #6 的改進 |
|------|----------|-------------------|
| 連線狀態 | 「在線/離線」二元 | 7 狀態狀態機 + 每次轉換觸發 UI 更新 |
| 重連策略 | 「自動重連」一句帶過 | 指數退避 + jitter + circuit breaker |
| 資料顯示 | 假設資料永遠是最新的 | 新鮮度指示器 + stale data UI |
| 開發工具 | 無 | Mock Gateway Server |
| 傳輸層 | 只有 WebSocket | Progressive Enhancement（WS → HTTP → Cache） |
| 事件系統 | 直接 publishLiveEvent | Fleet Event Bus（解耦 + 可擴展） |
| 大規模 | 「連線池」一句帶過 | 連線預算 + 優先級 + 背壓控制 |
| Gateway 相容性 | 假設所有 API 都可用 | 能力偵測 + graceful degradation |

---

**下一步 Planning #7（如果需要）：**
- Mock Gateway Server 實作
- Onboarding Wizard Step 2 前端改造
- mDNS 自動發現整合到 Onboarding
- AlertService 設計（成本超標、bot 離線告警）
- 第一次 end-to-end 測試（用 Mock Gateway）
