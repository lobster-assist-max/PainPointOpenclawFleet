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

### Planning #7 — 2026-03-19 08:00
**主題：Bot 健康評分演算法 + 時序資料策略 + Fleet 指揮中心 + AlertService + Mock Gateway 實作**

---

**🔧 iteration #7 → 繼續開發，本次產出 Mock Gateway + Bot Health Score + AlertService 基礎**

---

**1. Bot 健康評分演算法（全新概念，之前只有二元「在線/離線」+ 狀態機）**

Planning #6 設計了 7 狀態的連線狀態機，但那只描述**連線層**。
使用者真正想知道的是：**「這個 bot 健不健康？」**

**問題：** 一個 bot 可能連線正常（state=monitoring），但：
- 回應延遲飆高（平均 15 秒才回覆）
- Token 用量異常（某個 session 燒了 10 倍的 token）
- Channel 掉線（LINE 斷了但 Telegram 還活著）
- Cron job 失敗率上升

**解決方案：Bot Health Score（0-100 分複合指標）**

```typescript
interface BotHealthScore {
  overall: number;         // 0-100 加權總分
  breakdown: {
    connectivity: number;  // 30% — WS 連線穩定度（uptime ratio + 重連頻率）
    responsiveness: number; // 25% — 平均 event → response 延遲
    efficiency: number;    // 20% — Token 使用效率（cached ratio, context weight）
    channels: number;      // 15% — Channel 健康（connected/total channels ratio）
    cron: number;          // 10% — Cron 執行成功率
  };
  trend: "improving" | "stable" | "degrading";  // 過去 1hr vs 現在
  grade: "A" | "B" | "C" | "D" | "F";
}
```

**評分演算法：**
```
connectivity (30%):
  base = (uptimeMs / totalMs) × 100
  penalty = min(reconnectCount × 5, 50)  // 每次重連扣 5 分，最多扣 50
  score = max(base - penalty, 0)

responsiveness (25%):
  avgLatency = mean(last 20 event round-trip times)
  if avgLatency < 500ms → 100
  if avgLatency < 2000ms → 80
  if avgLatency < 5000ms → 60
  if avgLatency < 10000ms → 30
  else → 10

efficiency (20%):
  cachedRatio = cachedInputTokens / totalInputTokens
  score = cachedRatio × 100  // 越多 cache hit 越好
  bonus: if contextWeight < 30% → +10

channels (15%):
  connectedChannels / totalConfiguredChannels × 100
  如果沒有配置 channel → 100（不扣分）

cron (10%):
  successfulRuns / totalRuns × 100（過去 24hr）
  如果沒有 cron → 100（不扣分）

overall = weighted sum
grade: A(90+) B(75+) C(60+) D(40+) F(<40)
trend: compare current 1hr avg vs previous 1hr avg
```

**Dashboard 顯示：**
```
┌──────────────────┐
│ 🦞 小龍蝦        │
│ Health: 92 A     │  ← 健康分數 + 等級
│ █████████░       │  ← 視覺化進度條
│ 📶 ↑ improving   │  ← 趨勢指標
│                   │
│ 🔗 100% connect  │
│ ⚡ 420ms latency │
│ 💰 45% cached    │
│ 📡 2/2 channels  │
│ ⏰ 12/12 cron ok │
└──────────────────┘
```

→ **比「🟢 Online」有用 10 倍。管理者一眼就能看出哪個 bot 需要關注。**
→ **Health Score 還能用來排序 Dashboard：最差的 bot 排最前面（attention-first 設計）。**

---

**2. 時序資料聚合策略（全新，填補「只有即時快照」的重大缺口）**

**問題：** 目前的 FleetMonitorService 只保留「最新狀態」。
使用者問「上週的成本趨勢是什麼？」→ 答不上來。

**但我們不要建自己的時序資料庫。** Paperclip 已有 `cost_events` 和 `activity_log` 表。

**策略：分層時序存儲（利用既有 DB）**

```
Layer 1: 即時（記憶體）
  → FleetMonitorService.botSnapshots: Map<botId, LatestSnapshot>
  → 每 15 秒 tick 事件更新
  → 保留最近 5 分鐘的事件環形緩衝區（ring buffer）

Layer 2: 分鐘級（DB cost_events 表）
  → 每收到 sessions.usage 回應，寫入 cost_events
  → Paperclip 已有的 costs 頁面 + API 自動可用

Layer 3: 小時級快照（新增 fleet_snapshots 表）
  → 每小時快照一次每個 bot 的 health score + usage + channel status
  → 用於趨勢圖和歷史報表
  → 自動清理 > 90 天的資料

Layer 4: 日級摘要（新增 fleet_daily_summary 表）
  → 每天凌晨聚合：總 token、總成本、平均 health score、uptime %
  → 永久保留（資料量很小，每 bot 每天一筆）
```

**DB Migration 設計：**
```sql
-- fleet_snapshots: 小時級快照
CREATE TABLE fleet_snapshots (
  id TEXT PRIMARY KEY,
  bot_id TEXT NOT NULL REFERENCES agents(id),
  company_id TEXT NOT NULL REFERENCES companies(id),
  captured_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  health_score INTEGER,          -- 0-100
  health_grade TEXT,             -- A/B/C/D/F
  connection_state TEXT,         -- monitoring/disconnected/etc
  input_tokens_1h INTEGER,
  output_tokens_1h INTEGER,
  cached_tokens_1h INTEGER,
  active_sessions INTEGER,
  connected_channels INTEGER,
  total_channels INTEGER,
  cron_success_rate REAL,        -- 0.0-1.0
  avg_latency_ms INTEGER
);
CREATE INDEX idx_fleet_snap_bot_time ON fleet_snapshots(bot_id, captured_at);

-- fleet_daily_summary: 日級摘要
CREATE TABLE fleet_daily_summary (
  id TEXT PRIMARY KEY,
  bot_id TEXT NOT NULL REFERENCES agents(id),
  company_id TEXT NOT NULL REFERENCES companies(id),
  date DATE NOT NULL,
  avg_health_score REAL,
  min_health_score INTEGER,
  uptime_pct REAL,               -- 0.0-1.0
  total_input_tokens BIGINT,
  total_output_tokens BIGINT,
  total_cached_tokens BIGINT,
  estimated_cost_usd REAL,
  total_sessions INTEGER,
  total_cron_runs INTEGER,
  cron_success_rate REAL,
  UNIQUE(bot_id, date)
);
CREATE INDEX idx_fleet_daily_bot ON fleet_daily_summary(bot_id, date);
```

**趨勢圖 API：**
```
GET /api/fleet-monitor/bot/:botId/trend?range=7d&metric=health_score
GET /api/fleet-monitor/bot/:botId/trend?range=30d&metric=cost
GET /api/fleet-monitor/fleet/:companyId/trend?range=7d&metric=total_cost
```

→ **之前所有 Planning 都只想到即時監控。但 Dashboard 的價值一半在歷史趨勢。**
→ **利用 Paperclip 既有的 cost_events 表，不需要額外基礎設施。**

---

**3. Fleet 指揮中心（Batch Operations — 全新功能類別）**

**問題：** 目前的設計是「監控」+ 「單 bot 操作」。
但如果你有 10 個 bot，想要「全部 bot 更新 config」→ 要點 10 次。

**Fleet Dashboard 的殺手功能：多 bot 批量操作**

這是 **單 bot Control UI 永遠做不到的事**——真正的「Fleet」獨有能力。

**Fleet Command Center 設計：**
```
┌─ Fleet Command Center ──────────────────────────────────────┐
│                                                               │
│  Select Bots:                                                │
│  ☑ 🦞 小龍蝦  ☑ 🐿️ 飛鼠  ☑ 🦚 孔雀  ☐ 🐗 山豬(offline) │
│  [Select All] [Select Online] [Select None]                  │
│                                                               │
│  Command:                                                    │
│  ┌──────────────────────────────────────────────────┐       │
│  │ 📡 Broadcast Message                             │       │
│  │ 🔄 Trigger Cron Job (select job)                 │       │
│  │ ⚙️ Push Config Update (JSON patch)               │       │
│  │ 🔑 Rotate All Tokens                             │       │
│  │ 📊 Collect Usage Report                          │       │
│  │ 🛑 Abort All Active Sessions                     │       │
│  └──────────────────────────────────────────────────┘       │
│                                                               │
│  Execution Mode:                                             │
│  ○ Parallel (all at once)                                    │
│  ● Rolling (one by one, stop on error)                      │
│  ○ Canary (1 bot first, then rest after 60s)                │
│                                                               │
│  [Execute Command]                                           │
└───────────────────────────────────────────────────────────────┘
```

**Batch Execution Engine：**
```typescript
interface FleetCommand {
  id: string;
  type: "broadcast" | "cron-trigger" | "config-push" | "token-rotate" | "usage-collect" | "abort-all";
  targetBotIds: string[];
  executionMode: "parallel" | "rolling" | "canary";
  payload: Record<string, unknown>;
  createdAt: Date;
  createdBy: string;
}

interface FleetCommandResult {
  commandId: string;
  results: Array<{
    botId: string;
    status: "success" | "failed" | "skipped" | "timeout";
    response?: unknown;
    error?: string;
    durationMs: number;
  }>;
  summary: {
    total: number;
    success: number;
    failed: number;
    skipped: number;
  };
}
```

**API 設計：**
```
POST /api/fleet-command/execute         — 發送批量命令
GET  /api/fleet-command/:id/status      — 查詢執行進度（rolling 模式下）
GET  /api/fleet-command/history         — 歷史命令列表
POST /api/fleet-command/:id/abort       — 中止進行中的 rolling 命令
```

**Canary 模式特別有趣：**
1. 先對 1 個 bot 執行 config push
2. 等 60 秒觀察 health score 有無下降
3. 如果穩定 → 自動對剩餘 bot 執行
4. 如果 health 下降 → 停止 + alert + 自動 rollback 第一個 bot

→ **這才是「Fleet」的核心價值。不只是看，還能批量操作。**
→ **Canary 模式讓 config 變更有安全網，這在管理 10+ bot 時是救命功能。**

---

**4. AlertService 架構（Planning #6 提到但沒設計，本次完整設計）**

**Rules Engine 設計：**
```typescript
interface AlertRule {
  id: string;
  name: string;
  enabled: boolean;
  // 觸發條件
  condition: {
    metric: "health_score" | "cost_1h" | "cost_24h" | "uptime" |
            "error_rate" | "channel_disconnected" | "bot_offline_duration" |
            "cron_failure_rate" | "latency_avg";
    operator: "lt" | "gt" | "eq" | "gte" | "lte";
    threshold: number;
    // 持續多久才觸發（避免瞬間波動誤報）
    sustainedForMs: number;
  };
  // 適用範圍
  scope: {
    type: "fleet" | "bot";
    botIds?: string[];  // 空 = 全部 bot
  };
  // 通知方式
  actions: Array<{
    type: "dashboard_badge" | "webhook" | "email" | "fleet_event";
    config: Record<string, unknown>;
  }>;
  // 冷卻（同一 alert 不重複觸發）
  cooldownMs: number;
}
```

**預設 Alert Rules（開箱即用）：**
```typescript
const DEFAULT_ALERT_RULES: AlertRule[] = [
  {
    name: "Bot Offline > 5 minutes",
    condition: { metric: "bot_offline_duration", operator: "gt", threshold: 300_000, sustainedForMs: 0 },
    actions: [{ type: "dashboard_badge", config: { severity: "warning" } }],
    cooldownMs: 600_000,  // 10 分鐘冷卻
  },
  {
    name: "Health Score Critical",
    condition: { metric: "health_score", operator: "lt", threshold: 40, sustainedForMs: 120_000 },
    actions: [{ type: "dashboard_badge", config: { severity: "critical" } }, { type: "fleet_event", config: {} }],
    cooldownMs: 300_000,
  },
  {
    name: "Hourly Cost Spike",
    condition: { metric: "cost_1h", operator: "gt", threshold: 5.00, sustainedForMs: 0 },
    actions: [{ type: "dashboard_badge", config: { severity: "warning" } }],
    cooldownMs: 3600_000,  // 1 小時冷卻
  },
  {
    name: "Channel Disconnected",
    condition: { metric: "channel_disconnected", operator: "gt", threshold: 0, sustainedForMs: 60_000 },
    actions: [{ type: "dashboard_badge", config: { severity: "info" } }],
    cooldownMs: 300_000,
  },
  {
    name: "Cron Failure Rate High",
    condition: { metric: "cron_failure_rate", operator: "gt", threshold: 0.3, sustainedForMs: 0 },
    actions: [{ type: "dashboard_badge", config: { severity: "warning" } }],
    cooldownMs: 3600_000,
  },
];
```

**Alert 生命週期：**
```
Rule Check (每 30 秒) → Condition Met? → Sustained? → Cooldown OK? → FIRE
                          ↓ no             ↓ no         ↓ no
                        skip             reset        skip (已觸發過)

FIRE → 執行 actions:
  dashboard_badge → 側邊欄顯示紅/黃標記 + 通知數字
  fleet_event → publishLiveEvent("fleet.alert.triggered", {...})
  webhook → POST 到使用者設定的 URL（可串 Slack/Discord）
  email → 寄信（Phase 4 再做）
```

**Dashboard Alert Panel：**
```
┌─ ⚠️ Active Alerts (2) ──────────────────────────────────┐
│                                                           │
│  🔴 CRITICAL  🐗 山豬 — Health Score 28 (Grade F)       │
│     Since 14:32 · Bot offline for 23 minutes             │
│     [View Bot] [Acknowledge] [Mute 1hr]                  │
│                                                           │
│  🟡 WARNING   🦚 孔雀 — LINE channel disconnected       │
│     Since 14:45 · 1 of 2 channels down                  │
│     [View Bot] [Acknowledge] [Mute 1hr]                  │
│                                                           │
│  ── Resolved ──                                          │
│  ✅ 🦞 小龍蝦 — Hourly cost spike ($6.20)              │
│     Resolved at 14:20 · Duration: 45m                    │
│                                                           │
└───────────────────────────────────────────────────────────┘
```

→ **Alert 系統讓 Fleet Dashboard 從「被動監控面板」升級為「主動告警平台」。**
→ **預設 5 條 rules 開箱即用，使用者不需要設定就能收到關鍵告警。**

---

**5. Mock Gateway Server 實作（本次程式碼產出 #1）**

Planning #6 設計了 Mock Gateway 但沒有實作。本次實作。

**設計要點：**
- 完整模擬 WS 握手（challenge → connect → hello-ok）
- 定期發送模擬事件（tick/health/presence）
- 支援 RPC 方法（health, sessions.list, sessions.usage, agent.identity, agents.files.get）
- 命令列參數控制 bot 名稱、emoji、port、模擬延遲
- 可模擬斷線、高延遲等邊界情況

→ **見 scripts/mock-gateway.ts 程式碼**

---

**6. Bot Health Score 服務實作（本次程式碼產出 #2）**

基於上面的演算法設計，實作 `fleet-health-score.ts`。

→ **見 server/src/services/fleet-health-score.ts 程式碼**

---

**7. AlertService 基礎實作（本次程式碼產出 #3）**

基於上面的架構設計，實作核心 rule evaluation engine。

→ **見 server/src/services/fleet-alerts.ts 程式碼**

---

**8. 與前幾次 Planning 的關鍵差異**

| 面向 | 之前的想法 | Planning #7 的改進 |
|------|----------|-------------------|
| Bot 健康 | 在線/離線 + 7 狀態 | 0-100 複合健康分數 + A-F 等級 + 趨勢 |
| 歷史資料 | 只有即時快照 | 4 層時序存儲（記憶體 → 分鐘 → 小時 → 日） |
| 操作模式 | 只有監控 + 單 bot 操作 | Fleet Command Center（批量操作 + Canary 部署） |
| 告警 | 「以後再做」 | 完整 Rules Engine + 5 條預設規則 + Dashboard Panel |
| 開發工具 | 計畫中 | Mock Gateway Server 實際實作 |
| Dashboard 排序 | 固定順序 | Attention-first（健康分數最差的排最前） |
| Config 變更 | 一次一個 bot | Canary 模式（1 bot 先測 → 觀察 → 全部推送） |

---

**9. 風險更新**

| 新風險 | 嚴重度 | 緩解 |
|--------|--------|------|
| Health Score 權重不準（初始值不合理） | 🟡 中 | 提供管理員介面調整權重 + 收集實際數據後校準 |
| 時序資料 DB 膨脹（大量 bot + 長時間） | 🟡 中 | fleet_snapshots 90 天自動清理 + 日摘要永久保留 |
| Batch Command 對目標 bot 造成 DDoS | 🟡 中 | Rolling/Canary 模式 + rate limiting + 連線預算 |
| AlertService 誤報太多導致 alert fatigue | 🟡 中 | sustainedForMs 防瞬間波動 + cooldownMs 防重複 + mute 功能 |
| Mock Gateway 行為偏差（與真 Gateway） | 🟢 低 | 基於 Protocol v3 spec + 定期對照 |

---

**10. 修訂的整體進度追蹤**

```
✅ Planning #1-4: 概念、API 研究、架構設計
✅ Planning #5: 品牌主題 CSS + DB aliases + 術語改名
✅ Planning #6: FleetGatewayClient + FleetMonitorService + API routes
✅ Planning #7: Mock Gateway + Health Score + AlertService + 時序策略 + Command Center
⬜ Next: Onboarding Wizard Step 2 前端 + Dashboard 首頁 + 趨勢圖
⬜ Next: Fleet Command Center 實作
⬜ Next: end-to-end 測試（Mock Gateway → Fleet → Dashboard）
```

---

**下一步 Planning #8（如果需要）：**
- Onboarding Wizard Step 2 前端改造（React 組件）
- Dashboard 首頁實作（KPI 卡片 + Bot 列表 + Activity Feed）
- 趨勢圖組件（Recharts/Nivo + fleet_snapshots 資料源）
- Fleet Command Center 前端 + 後端實作
- DB migration 實作（fleet_snapshots + fleet_daily_summary）
- 第一次 end-to-end 測試（Mock Gateway → FleetMonitor → Dashboard UI）

### Planning #8 — 2026-03-19 09:30
**主題：前端資料管線 + 組件架構 + 成本估算引擎 + 注意力優先 Dashboard + LiveEvent 橋接**

---

**🔧 iteration #8 → 前端全面突破：React Query 整合 + 核心 UI 組件 + 新架構洞察**

之前 7 次 Planning 建立了完整的後端基礎設施（FleetGatewayClient、FleetMonitorService、HealthScore、AlertService、MockGateway）。但**前端只完成了 CSS 主題**。

本次 Planning 的核心問題：**如何把後端的豐富資料流，高效、一致地呈現在 React UI 上？**

---

**1. 前端資料管線架構（全新，填補後端→前端的斷層）**

Planning #6 設計了 `FleetEventBus` 在後端，但**從未設計前端如何消費這些事件**。

**發現：Paperclip 已有完整的前端即時更新管線。**

```
Server → WebSocket (/api/companies/:id/events/ws)
  → LiveUpdatesProvider.tsx
    → handleLiveEvent()
      → queryClient.invalidateQueries() ← 自動讓 React Query 重新拉資料
      → pushToast() ← 即時通知
```

**Fleet 整合策略（不建新 WS，擴展現有的）：**

```
FleetMonitorService
  → FleetEventBus
    → publishLiveEvent() ← 已整合到 Paperclip 的 LiveEvent 系統
      → WebSocket → 前端 LiveUpdatesProvider
        → handleLiveEvent() ← 需要新增 fleet.* 事件處理
          → queryClient.invalidateQueries(["fleet", ...])
```

**需要在 `handleLiveEvent()` 中新增的 fleet 事件：**
```typescript
case "fleet.bot.health":
  queryClient.invalidateQueries({ queryKey: ["fleet", "status", companyId] });
  queryClient.invalidateQueries({ queryKey: ["fleet", "bot-health", event.payload.botId] });
  break;
case "fleet.bot.connected":
case "fleet.bot.disconnected":
  queryClient.invalidateQueries({ queryKey: ["fleet", "status", companyId] });
  pushToast({ type: event.type === "fleet.bot.connected" ? "success" : "warning",
              message: `${event.payload.botEmoji} ${event.payload.botName} ${event.type === "fleet.bot.connected" ? "connected" : "disconnected"}` });
  break;
case "fleet.alert.triggered":
  queryClient.invalidateQueries({ queryKey: ["fleet", "alerts", companyId] });
  pushToast({ type: "warning", message: event.payload.message });
  break;
case "fleet.cost.updated":
  queryClient.invalidateQueries({ queryKey: ["fleet", "bot-usage", event.payload.botId] });
  break;
```

→ **這是最小侵入的整合方式——不建新 WS，不改 LiveUpdatesProvider 結構，只加 case 分支。**
→ **React Query 的 staleTime + refetchInterval 作為 fallback：即使 WS 斷了，hooks 仍會定期 poll。**

---

**2. Fleet Query Key 設計（全新，React Query 最佳實踐）**

之前沒有定義 fleet 的 query key 結構。這次完整設計：

```typescript
// 新增到 lib/queryKeys.ts
fleet: {
  status:      (companyId: string) => ["fleet", "status", companyId],
  botHealth:   (botId: string) => ["fleet", "bot-health", botId],
  botSessions: (botId: string) => ["fleet", "bot-sessions", botId],
  botUsage:    (botId: string, from?, to?) => ["fleet", "bot-usage", botId, from, to],
  botIdentity: (botId: string) => ["fleet", "bot-identity", botId],
  botChannels: (botId: string) => ["fleet", "bot-channels", botId],
  botCron:     (botId: string) => ["fleet", "bot-cron", botId],
  botFile:     (botId: string, filename: string) => ["fleet", "bot-file", botId, filename],
  alerts:      (companyId: string, state?) => ["fleet", "alerts", companyId, state],
}
```

**Stale time 分層策略：**
| 資料類型 | staleTime | refetchInterval | 原因 |
|----------|-----------|-----------------|------|
| Fleet status | 5s | 10s | 核心即時資料，WS 也會推送 |
| Bot health | 10s | 15s | 計算密集，不需要太頻繁 |
| Bot sessions | 15s | 30s | 變化較慢 |
| Bot usage | 60s | — | 只按需查詢 |
| Bot identity | 5min | — | 幾乎不變 |
| Alerts | 10s | 15s | 需要及時更新 |

→ **分層 staleTime 避免無意義的重複請求，同時保證即時性。**

---

**3. 成本估算引擎（全新，之前只有原始 token 數）**

**問題：** `sessions.usage` 回傳 token 數，但 Dashboard 需要顯示美金。

**挑戰：** 不同 bot 可能用不同的 model（Claude Opus 4 vs Sonnet 4 vs Haiku 4.5），pricing 不同。

**解決方案：前端 cost estimator + 可更新的 pricing table**

```typescript
// hooks/useFleetMonitor.ts — estimateCostUsd()
// 定價表（隨 model 更新）
const MODEL_PRICING: Record<string, { input: number; output: number; cachedInput: number }> = {
  "claude-opus-4":    { input: 15,  output: 75,  cachedInput: 1.50 },  // $/1M tokens
  "claude-sonnet-4":  { input: 3,   output: 15,  cachedInput: 0.30 },
  "claude-haiku-4-5": { input: 0.8, output: 4,   cachedInput: 0.08 },
};

function estimateCostUsd(usage: TokenUsage, model: string = "claude-sonnet-4"): number {
  const pricing = MODEL_PRICING[model] ?? MODEL_PRICING["claude-sonnet-4"];
  const freshInput = usage.inputTokens - usage.cachedInputTokens;
  return (freshInput / 1e6) * pricing.input
       + (usage.cachedInputTokens / 1e6) * pricing.cachedInput
       + (usage.outputTokens / 1e6) * pricing.output;
}
```

**Model 偵測：** 從 `config.get` 或 `agent.identity` 的回應推斷。
**Phase 2 改進：** 後端直接從 Gateway 取得 model 資訊 (`models.list`)，前端不需猜。

→ **Planning #7 的 Cost Tracking 假設後端會做聚合，但前端也需要即時估算。兩者互補。**

---

**4. 注意力優先（Attention-First）Dashboard 設計（全新 UX 理念）**

Planning #7 提到「健康分數最差的排最前」但沒有完整設計。

**核心理念：Dashboard 不是報表，是指揮台。最需要你關注的東西最先出現。**

**排序演算法：**
```
Priority 1: connectionState === "error" → 永遠最前
Priority 2: healthScore < 40 (Grade F/D) → 第二區
Priority 3: alerts.firing > 0 → 第三區
Priority 4: 其餘按 healthScore 升序 → 最差的排前面
```

**視覺差異化：**
```
🔴 Error bot card:     紅色左邊框 + 淡紅背景 + pulse 動畫
🟡 Degrading bot card: 黃色左邊框 + 淡黃背景
🟢 Healthy bot card:   正常邊框 + 正常背景
⚫ Dormant bot card:   灰色 + 降低透明度
```

→ **使用者打開 Dashboard 的第一秒就知道哪裡有問題。不需要掃描所有卡片。**

---

**5. Bot 狀態卡片的漸進式內容載入（全新，提升感知性能）**

**問題：** 從 `fleet.status` API 回來的資料可能不完整（某些 bot 的 health 還在計算中）。

**解決方案：三階段漸進式載入**

```
Stage 1 (即時): name + emoji + connectionState
  → 來自 fleet.status（一次 API 呼叫）
  → 卡片立刻出現，顯示基本資訊

Stage 2 (~500ms): healthScore + channels + activeSessions
  → 來自 fleet.status.bots[].healthScore
  → HealthRing 和 channel pills 淡入

Stage 3 (~2s): sparkline + freshness + cost estimate
  → 來自個別 bot 的 usage 查詢（只對可見的 bot 查詢）
  → sparkline 和成本數字淡入
```

**Intersection Observer 優化：**
只對 viewport 內可見的 bot 卡片發起 Stage 3 查詢。
10 個 bot 但只有 4 個可見 → 只發 4 個 usage 請求。

→ **比一次載入所有資料快 3 倍，且使用者感知到的載入速度更快（因為名字和狀態立刻出現）。**

---

**6. 活動 Sparkline（全新微型視覺化，零依賴）**

**在每個 bot 卡片右下角顯示 24 小時活動趨勢的微型折線圖。**

```
不需要 Recharts/Nivo！純 SVG polyline：
<svg viewBox="0 0 64 20">
  <polyline points="0,18 5,15 10,12 15,16 ..." fill="none" stroke="currentColor" />
</svg>
```

**資料來源：** `sessions.usage` 的 per-session token 數，按小時聚合。
**或更輕量：** 從 FleetMonitorService 的 ring buffer 中取每小時的事件計數。

**效果：**
```
┌──────────────┐
│ 🦞 小龍蝦    │
│ 🟢 Online    │
│              │
│ 2 sessions   │  ╱╲  ╱╲
│ 92pts  2s ago│ ╱  ╲╱  ╲_  ← 24h sparkline
└──────────────┘
```

→ **一眼看出 bot 的活動模式：白天忙晚上閒、突然飆升、一直平穩等。**
→ **比純數字「42 messages」有資訊量 10 倍。**

---

**7. ConnectBotWizard 組件架構（全新前端設計，取代 OnboardingWizard Step 2）**

**決定：不直接修改 1800 行的 OnboardingWizard.tsx，而是建立獨立的 ConnectBotWizard 組件。**

**原因：**
1. OnboardingWizard 支援 7 種 adapter，改動風險太高
2. ConnectBotWizard 可以同時用在 Onboarding 和 Dashboard 的「Connect Bot」按鈕
3. 獨立組件更容易測試

**ConnectBotWizard 三步驟：**
```
Sub-step 1: Gateway URL
  ┌─────────────────────────────────┐
  │ Gateway URL                     │
  │ ┌─────────────────────────────┐ │
  │ │ http://192.168.50.73:18789  │ │
  │ └─────────────────────────────┘ │
  │ Usually http://IP:18789         │
  │                       [Next →]  │
  └─────────────────────────────────┘

Sub-step 2: Token + Test
  ┌─────────────────────────────────┐
  │ Authentication                  │
  │ Token for 192.168.50.73:18789   │
  │ ┌─────────────────────────┐ 👁  │
  │ │ ••••••••••••            │     │
  │ └─────────────────────────┘     │
  │ ✅ Connected! Found: 🦞 小龍蝦  │
  │ [← Back]       [Test Connection]│
  └─────────────────────────────────┘

Sub-step 3: Bot Profile
  ┌─────────────────────────────────┐
  │ Bot Profile                     │
  │ ┌───────────────────────────┐   │
  │ │ 🦞 小龍蝦                 │   │
  │ │ AI assistant for fleet... │   │
  │ │ Channels: 🟢 LINE 🟢 TG  │   │
  │ │ Gateway v2026.1.24-3      │   │
  │ └───────────────────────────┘   │
  │ [← Back]         [Add to Fleet] │
  └─────────────────────────────────┘
```

**整合方式：**
```typescript
// OnboardingWizard.tsx Step 2 中嵌入
{adapterType === "openclaw_gateway" && (
  <ConnectBotWizard
    onComplete={(botId) => {
      setCreatedAgentId(botId);
      setStep(3);
    }}
  />
)}
```

→ **比重寫整個 OnboardingWizard 安全 10 倍。最小改動 = 最大效果。**

---

**8. LiveEvent 橋接實作策略（全新，補齊 Planning #6 的 Fleet Event Bus → 前端的最後一哩）**

**後端已完成：** FleetEventBus 發射 `fleet.bot.*` 事件。
**但缺少：** 這些事件如何進入 Paperclip 的 LiveEvent WebSocket。

**發現 Paperclip LiveEvent 系統的關鍵入口：**
```
server/src/realtime/live-events-ws.ts
  → publishLiveEvent(companyId, event)
    → 廣播到所有訂閱該 company 的 WS clients
```

**整合方案：FleetMonitorService 訂閱 FleetEventBus，轉發為 LiveEvent**

```typescript
// 在 FleetMonitorService.start() 中
this.eventBus.on("fleet.*", (event) => {
  publishLiveEvent(event.companyId, {
    type: event.type,
    payload: event.payload,
    timestamp: new Date().toISOString(),
  });
});
```

**前端 handleLiveEvent() 中新增 fleet case：**
```typescript
// LiveUpdatesProvider.tsx
if (parsed.type.startsWith("fleet.")) {
  // Invalidate fleet queries
  queryClient.invalidateQueries({
    queryKey: ["fleet"],
    predicate: (query) => query.queryKey[0] === "fleet",
  });
  // Show toast for important events
  if (parsed.type === "fleet.bot.disconnected" || parsed.type === "fleet.alert.triggered") {
    pushToast({ type: "warning", message: parsed.payload.message });
  }
  return;
}
```

→ **不需要改 Paperclip 的 LiveEvent 系統——只是多發一種事件類型。前端也只多幾行 case。**
→ **這完成了完整的即時管線：Gateway WS → FleetGatewayClient → FleetEventBus → LiveEvent WS → React Query invalidation → UI 自動更新。**

---

**9. 本次程式碼產出**

**Commit 8: Fleet Frontend Data Pipeline**
```
新增：ui/src/api/fleet-monitor.ts
  — Fleet Monitor API client（types + API methods）
  — FleetAlerts API client
  — 完整的 TypeScript 型別定義（BotStatus, HealthScore, Alert 等）

修改：ui/src/lib/queryKeys.ts
  — 新增 fleet.* query key 結構

修改：ui/src/lib/status-colors.ts
  — 新增 botConnectionDot, botConnectionBadge
  — 新增 healthGradeColor, channelBrandColor, alertSeverityBadge
```

**Commit 9: Fleet React Hooks**
```
新增：ui/src/hooks/useFleetMonitor.ts
  — useFleetStatus() — 全車隊狀態（10s refetch）
  — useBotFromFleet() — 從車隊狀態中取出單 bot
  — useBotHealth() — 單 bot 健康分數（15s refetch）
  — useBotSessions(), useBotUsage(), useBotIdentity(), useBotChannels(), useBotCron()
  — useFleetAlerts() — 告警列表（15s refetch）
  — useConnectBot(), useDisconnectBot(), useTestConnection() — mutations
  — useAcknowledgeAlert() — mutation
  — connectionStateLabel(), timeAgo(), estimateCostUsd() — utility functions
```

**Commit 10: Fleet UI Components**
```
新增：ui/src/components/fleet/BotStatusCard.tsx
  — Bot 狀態卡片（emoji、名稱、連線狀態、health ring、channel pills、sparkline、freshness）
  — 內建 Sparkline 組件（純 SVG，零依賴）
  — 內建 HealthRing 組件（圓形進度指示器）
  — 注意力優先排序（error → low health → normal）
  — Hover 時展開 health breakdown

新增：ui/src/components/fleet/FleetDashboard.tsx
  — Fleet 儀表板主頁
  — KPI 摘要列（online/total, sessions, avg health, cost）
  — Alert banner（firing alerts 時顯示）
  — Bot grid（attention-first 排序）
  — Alert list（最近 5 條）
  — Empty state（無 bot 時顯示 Connect Bot CTA）

新增：ui/src/components/fleet/ConnectBotWizard.tsx
  — 獨立的三步驟 bot 連接精靈
  — Step 1: Gateway URL 輸入
  — Step 2: Token 輸入 + Test Connection（帶成功/失敗視覺反饋）
  — Step 3: Bot Profile 預覽 + 確認加入 Fleet
  — 可嵌入 OnboardingWizard 或獨立使用
  — 進度點指示器

新增：ui/src/components/fleet/index.ts
  — Barrel export
```

---

**10. 與前幾次 Planning 的關鍵差異**

| 面向 | 之前的想法 | Planning #8 的改進 |
|------|----------|-------------------|
| 前端資料 | 沒有設計 | React Query hooks + staleTime 分層策略 |
| 即時更新 | 後端 EventBus 停在後端 | 完整管線：EventBus → LiveEvent → React Query invalidation |
| Dashboard | ASCII wireframe | 實際 React 組件（FleetDashboard + BotStatusCard） |
| 連接 bot | 改 1800 行 OnboardingWizard | 獨立 ConnectBotWizard 組件（可嵌入） |
| 成本顯示 | 只有 token 數 | 前端 cost estimator + model pricing table |
| Bot 卡片 | 靜態資料 | 漸進式載入 + sparkline + freshness indicator |
| 排序邏輯 | 未定義 | Attention-first（error → degrading → healthy） |
| 視覺化 | 「以後用 Recharts」 | 零依賴 SVG Sparkline + HealthRing 組件 |

---

**11. 新發現：OpenClaw Gateway API 完整 RPC 清單（第四次研究，最完整版本）**

本次研究確認 Gateway 有 **70+ RPC 方法**，比之前記錄的多出以下重要方法：

| 新發現方法 | 用途 | Fleet 優先級 |
|-----------|------|-------------|
| `agents.create` | 遠端建立新 agent | ⚠️ P3（Fleet 不需要建 agent） |
| `agents.update` | 遠端更新 agent config | ⚠️ P2（Fleet Command Center 用） |
| `agents.delete` | 遠端刪除 agent | ⚠️ P3 |
| `node.list` | 列出連接的 nodes | ✅ P1（顯示 bot 連接了哪些 nodes） |
| `node.invoke` | 遠端觸發 node 命令 | ⚠️ P2（Fleet Command Center 用） |
| `node.rename` | 重命名 node | ⚠️ P3 |
| `wizard.*` | 互動式 onboarding wizard | ❌ 不需要 |
| `talk.mode` / `voicewake.*` | 語音模式 | ⚠️ P3（語音 bot 管理） |
| `update.run` | 就地 Gateway 更新 | ✅ P2（Fleet 批量更新所有 bot 的 Gateway！） |

**`update.run` 是 Fleet Command Center 的殺手功能：**
一鍵更新所有 bot 的 OpenClaw Gateway 版本。Canary 模式先更新一個，觀察健康分數，再推送其餘。

---

**12. 品牌色最終確認（第四次，交叉驗證完成）**

確認 CSS 中已正確實作所有品牌色：

核心三色（四次研究一致）：
- `#FAF9F6` → `oklch(0.979 0.007 90)` — 米白背景 ✅
- `#D4A373` → `oklch(0.758 0.095 68)` — 金棕主色 ✅
- `#2C2420` → `oklch(0.282 0.030 55)` — 深棕文字 ✅

新增確認：
- Chart palette（5 色）已在 index.css 中定義 ✅
- Channel 品牌色已加入 status-colors.ts ✅
- Alert severity 色已加入 status-colors.ts ✅
- Bot connection state 色已加入 status-colors.ts ✅

---

**13. 風險更新**

| 新風險 | 嚴重度 | 緩解 |
|--------|--------|------|
| React Query + WS 雙重更新造成 race condition | 🟡 中 | staleTime 防止 WS invalidation 後的重複 fetch |
| 前端 estimateCostUsd 精度不夠（model 判斷可能錯） | 🟡 中 | Phase 2 後端提供精確 model 資訊 |
| ConnectBotWizard 與 OnboardingWizard 狀態同步 | 🟡 中 | ConnectBotWizard 完全自包含，只透過 onComplete callback 通信 |
| BotStatusCard 在 50+ bot 時的渲染性能 | 🟡 中 | React.memo + virtualized grid（Phase 4 優化） |
| Sparkline 資料在 bot 剛連接時為空 | 🟢 低 | 元件處理 data.length < 2 → 不渲染 |

---

**14. 修訂的整體進度追蹤**

```
✅ Planning #1-4: 概念、API 研究、架構設計
✅ Planning #5: 品牌主題 CSS + DB aliases + 術語改名
✅ Planning #6: FleetGatewayClient + FleetMonitorService + API routes
✅ Planning #7: Mock Gateway + Health Score + AlertService + 時序策略 + Command Center
✅ Planning #8: Fleet API client + React hooks + BotStatusCard + FleetDashboard + ConnectBotWizard
⬜ Next: LiveEvent 橋接整合（handleLiveEvent 新增 fleet.* cases）
⬜ Next: OnboardingWizard 嵌入 ConnectBotWizard
⬜ Next: DB migration（fleet_snapshots + fleet_daily_summary）
⬜ Next: 第一次 end-to-end 測試（Mock Gateway → Fleet → Dashboard UI）
⬜ Next: Fleet Command Center UI 組件
```

---

**下一步 Planning #9（如果需要）：**
- LiveUpdatesProvider 整合 fleet.* 事件
- OnboardingWizard.tsx 嵌入 ConnectBotWizard（最小改動）
- Dashboard 頁面路由替換（原 Dashboard → FleetDashboard）
- DB migration 實作 + 整合 Drizzle ORM
- Playwright E2E 測試（Mock Gateway → Connect Bot → Dashboard 顯示）
- 趨勢圖組件（用 fleet_snapshots 資料）

### Planning #9 — 2026-03-19 11:15
**主題：最後一哩整合 + Bot Detail Fleet Tab + Sidebar 車隊脈搏 + Session Live Tail + Bot 分組標籤系統**

---

**🔧 iteration #9 → 「縫合」階段：把所有零件接上電源**

前 8 次 Planning 建造了完整的引擎（後端 services）和車身（前端 components），但**沒有人把鑰匙插進去**。FleetDashboard 存在但沒有路由指向它。LiveUpdatesProvider 不認識 fleet 事件。Sidebar 不知道車隊狀態。

本次 Planning 的核心任務：**Integration Orchestration — 把所有零件接上線路，讓車子動起來。**

---

**1. 路由接線圖（全新，之前 8 次完全沒處理 React Router 整合）**

**問題：** FleetDashboard、ConnectBotWizard 都建好了，但 App.tsx 的 `boardRoutes()` 沒有引用它們。使用者根本看不到。

**策略：漸進替換，不破壞原有路由**

```
Phase A（本次）: 新增 /fleet-monitor 路由，Sidebar 加入入口
  → 使用者可以從 Sidebar 進入 FleetDashboard
  → 原有 /dashboard 保持不變（不破壞）

Phase B（下次）: /dashboard 根據 fleet 狀態智慧切換
  → 如果車隊有已連接的 bot → 顯示 FleetDashboard
  → 如果沒有 → 顯示原版 Dashboard
  → 使用者不需要知道底層切換邏輯

Phase C（最終）: /dashboard 完全替換為 FleetDashboard
  → 原版 Dashboard 功能併入 FleetDashboard
```

**App.tsx 變更：**
```tsx
// 新增到 boardRoutes()
<Route path="fleet-monitor" element={<FleetDashboard />} />
<Route path="fleet-monitor/connect" element={<ConnectBotWizardPage />} />
<Route path="fleet-monitor/bot/:botId" element={<AgentDetail />} />  // 複用 AgentDetail + Fleet Tab
```

**Sidebar.tsx 變更：**
```tsx
// "Fleet" section 新增入口
<SidebarNavItem to="/fleet-monitor" label="Fleet Monitor" icon={Radio} badge={onlineBotCount} />
```

→ **這是最小可行整合。使用者今天就能從 Sidebar 進入 FleetDashboard。**

---

**2. Sidebar 車隊脈搏指示器（全新 UX 元素，之前只設計了 Dashboard 內的狀態）**

**洞察：** Dashboard 是你「打開看」的地方，但 Sidebar 是你「一直看到」的地方。

**Fleet Pulse — 永遠可見的車隊健康微指標：**
```
┌─ Sidebar ─────────────┐
│ 🔶 Pain Point Fleet   │
│ 🔍                    │
│                        │
│ ✏️ New Issue          │
│ 📊 Dashboard          │
│ 📥 Inbox           3  │
│                        │
│ ── Fleet ──            │
│ 📡 Fleet Monitor    4  │  ← badge = online bot count
│    🟢🟢🟢🟡          │  ← Fleet Pulse: 每個圓點 = 一個 bot
│ 🏢 Org                │
│ 💰 Costs              │
│ 📜 Activity           │
│ ⚙️ Settings           │
└────────────────────────┘
```

**Fleet Pulse 規格：**
- 每個 bot 一個小圓點（8x8px），顏色 = connection state
- 最多顯示 12 個圓點，超過顯示 `+N`
- 圓點有 pulse 動畫 = 正在重連
- 圓點排列：monitoring 排前面，error 排後面
- 滑鼠 hover 圓點 → tooltip 顯示 bot 名稱 + 狀態

**為什麼這很重要：**
管理者在做其他事情（看 Issues、看 Costs）時，**餘光就能看到車隊狀態**。
如果某個圓點從綠變紅 → 立刻知道有問題，不需要切換頁面。

→ **Sidebar 從「靜態導航選單」升級為「永遠在線的車隊監控器」。**

---

**3. LiveEvent 車隊事件橋接（Planning #8 設計了策略，本次寫實作程式碼）**

**Planning #8 定義了策略：** 在 `handleLiveEvent()` 中新增 `fleet.*` case。
**本次實作關鍵決定：**

```typescript
// LiveUpdatesProvider.tsx — handleLiveEvent() 新增
if (event.type.startsWith("fleet.")) {
  // 1. 無腦 invalidate fleet status（保證 Dashboard 即時更新）
  queryClient.invalidateQueries({ queryKey: queryKeys.fleet.status(expectedCompanyId) });

  // 2. 針對性 invalidate（減少不必要的重新拉取）
  const botId = readString(payload.botId);
  if (botId) {
    if (event.type === "fleet.bot.health") {
      queryClient.invalidateQueries({ queryKey: queryKeys.fleet.botHealth(botId) });
    }
    if (event.type === "fleet.cost.updated") {
      queryClient.invalidateQueries({ queryKey: queryKeys.fleet.botUsage(botId) });
    }
  }

  // 3. Alert 事件
  if (event.type === "fleet.alert.triggered") {
    queryClient.invalidateQueries({ queryKey: queryKeys.fleet.alerts(expectedCompanyId) });
    pushToast({ type: "warning", message: payload.message as string });
  }

  // 4. 連線變更 toast
  if (event.type === "fleet.bot.connected" || event.type === "fleet.bot.disconnected") {
    const emoji = readString(payload.botEmoji) ?? "🤖";
    const name = readString(payload.botName) ?? "Bot";
    const verb = event.type === "fleet.bot.connected" ? "connected" : "disconnected";
    pushToast({
      type: event.type === "fleet.bot.connected" ? "success" : "warning",
      message: `${emoji} ${name} ${verb}`,
    });
  }
  return;
}
```

**關鍵洞察：`fleet.status` 是 "catch-all" invalidation。** 即使我們漏了某個特定事件的處理，fleet status 的 10 秒 refetchInterval 也會兜底。這是 defense-in-depth 策略。

→ **完成了 Gateway WS → FleetGatewayClient → FleetEventBus → LiveEvent WS → React Query → UI 的完整管線。**

---

**4. Bot Detail Fleet Tab（全新組件，填補 Dashboard ↔ 個別 Bot 之間的資訊斷層）**

**問題：** FleetDashboard 顯示概覽，但使用者點進某個 bot 後看到的是 Paperclip 原版 AgentDetail，沒有 Fleet 特有資訊。

**解決方案：在 AgentDetail.tsx 新增 "Fleet" tab，顯示 Gateway 層的即時資料。**

```
AgentDetail Tabs:
  [Dashboard] [Configuration] [Runs] [Budget] [🆕 Fleet]
                                                    ↑
                                              Gateway 即時資料
```

**Fleet Tab 內容架構：**
```
┌─ Bot Fleet Status ────────────────────────────────────────┐
│                                                             │
│  ┌─ Connection ────────────┐  ┌─ Health Breakdown ────────┐│
│  │ State: 🟢 Monitoring    │  │ Overall: 92/100 (A)       ││
│  │ Gateway: 192.168.50.73  │  │ ████████████████████▒▒    ││
│  │ Protocol: v3            │  │                           ││
│  │ Uptime: 4d 12h 35m     │  │ 🔗 Connectivity:  98     ││
│  │ Last event: 3s ago     │  │ ⚡ Responsiveness: 85     ││
│  │ Device ID: fleet-mon-1 │  │ 💰 Efficiency:    90     ││
│  └─────────────────────────┘  │ 📡 Channels:      100    ││
│                                │ ⏰ Cron:          95     ││
│                                └───────────────────────────┘│
│                                                             │
│  ┌─ Channels ──────────────────────────────────────────────┐│
│  │ ● LINE        🟢 Connected   142 msgs/24h              ││
│  │ ● Telegram    🟢 Connected    38 msgs/24h              ││
│  │ ● Web         🟡 Idle          0 msgs/24h              ││
│  └──────────────────────────────────────────────────────────┘│
│                                                             │
│  ┌─ Active Sessions ──────────────────────────────────────┐ │
│  │ patrol-morning    12.4K tokens   Started 14:32          │ │
│  │ fleet-plan-v9     8.1K tokens    Started 14:45          │ │
│  │ code-review-42    3.2K tokens    Started 14:50          │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                             │
│  ┌─ Memory (MEMORY.md) ──────────────────────────────────┐ │
│  │ # Bot Memory                                           │ │
│  │ - Patrol schedule: 06:00, 12:00, 18:00                │ │
│  │ - Fleet members: 🦞🐿️🦚🐗                             │ │
│  │ - Last incident: 2026-03-18 LINE rate limit           │ │
│  │                                          [Refresh] 📋  │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                             │
│  ┌─ Cron Jobs ────────────────────────────────────────────┐ │
│  │ morning-report   0 6 * * *   ✅ Last: 06:00 (1.2s)    │ │
│  │ health-check     */15 * * *  ✅ Last: 14:45 (0.8s)    │ │
│  │ weekly-digest     0 9 * * 1  ✅ Last: Mon 09:00 (3.5s)│ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                             │
│  [Open in Control UI ↗]  [Disconnect Bot]                   │
└──────────────────────────────────────────────────────────────┘
```

**資料來源全部是 Fleet Monitor API（不需要新的後端）：**
- Connection info → `GET /api/fleet-monitor/status` (從 fleet status 中取)
- Health breakdown → `GET /api/fleet-monitor/bot/:botId/health`
- Channels → `GET /api/fleet-monitor/bot/:botId/channels`
- Sessions → `GET /api/fleet-monitor/bot/:botId/sessions`
- Memory → `GET /api/fleet-monitor/bot/:botId/files/MEMORY.md`
- Cron → `GET /api/fleet-monitor/bot/:botId/cron`

→ **不需要新的後端 API，只是前端組裝既有 endpoints。**

---

**5. Session Live Tail（全新功能類別，之前只有「session 列表」但沒有「看內容」）**

**洞察：** 管理者最常問的問題不是「bot 有幾個 session」，而是「bot 現在在跟誰說什麼」。

**Session Live Tail = 即時觀看 bot 的對話串流：**

```
┌─ Live Session: patrol-morning ───────────────────────────┐
│                                                            │
│  [User] 14:32                                             │
│  今天早上的巡邏報告呢？                                      │
│                                                            │
│  [Bot 🦞] 14:32                                           │
│  早安！正在生成今日巡邏報告...                                │
│  ████████████░ Generating...                              │
│                                                            │
│  [Bot 🦞] 14:33                                           │
│  📋 今日巡邏報告                                            │
│  - 所有系統正常運行                                          │
│  - LINE 通道: 142 訊息已處理                                 │
│  - 異常: 無                                                 │
│                                                            │
│  ┌──────────────────────────────────────────────────────┐ │
│  │ 💬 Send message to bot...                     [Send] │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                            │
│  ⏱ Live • Auto-scroll ON • 12.4K tokens used             │
└────────────────────────────────────────────────────────────┘
```

**技術實作：**
```typescript
// 1. 初始載入：chat.history RPC（透過 Fleet Monitor API）
const history = await fleetMonitorApi.botFile(botId, `sessions/${sessionKey}.jsonl`);

// 2. 即時更新：WebSocket chat 事件
// FleetGatewayClient 已經監聽 "chat" 事件
// → FleetEventBus → "fleet.bot.chat" → LiveEvent → UI

// 3. 發送訊息（Phase 3，需要 operator.write scope）
// POST /api/fleet-monitor/bot/:botId/chat { message, sessionKey }
// → FleetGatewayClient.rpc("chat.send", { ... })
```

**重要限制：**
- Phase A（本次）：只讀，只看歷史 + 即時新訊息
- Phase B（下次）：可發送訊息（需要 scope 升級到 operator.write）
- Phase C（最終）：可中止 agent turn（chat.abort）

→ **從「監控面板」升級為「指揮台」的關鍵一步。管理者不只看數字，還能看到 bot 的實際對話。**

---

**6. Bot 分組標籤系統（全新概念，之前所有 bot 都是平等的扁平列表）**

**問題：** 當車隊有 10+ bot 時，Dashboard 的 bot 網格變成一片混亂。使用者找不到「銷售組的 bot」或「客服組的 bot」。

**解決方案：Bot Tags — 輕量級分組機制**

```
Tag 例子：
  🏷️ Sales（銷售）    → 🦞 小龍蝦, 🐿️ 飛鼠
  🏷️ Support（客服）  → 🦚 孔雀
  🏷️ Cron（排程）     → 🐗 山豬
  🏷️ VIP             → 🦞 小龍蝦
```

**Dashboard 分組顯示：**
```
┌─ Sales (2 bots) ──────────────────────────┐
│  🦞 92/A 🟢  │  🐿️ 88/B 🟢              │
└───────────────────────────────────────────┘
┌─ Support (1 bot) ─────────────────────────┐
│  🦚 75/C 🟡                               │
└───────────────────────────────────────────┘
┌─ Cron (1 bot) ────────────────────────────┐
│  🐗 95/A 🟢                               │
└───────────────────────────────────────────┘
```

**存儲方式：** 不改 DB schema！利用 Paperclip 既有的 agent metadata：
```typescript
// agents 表已有 metadata JSON 欄位
// 在 metadata 中加入 tags 陣列
metadata: { tags: ["sales", "vip"], group: "Sales" }
```

**Filter Bar（Dashboard 頂部）：**
```
[All] [🏷️ Sales (2)] [🏷️ Support (1)] [🏷️ Cron (1)] | 🔍 Filter by name...
```

→ **零 DB migration，利用既有 metadata 欄位，卻讓 Dashboard 從「扁平列表」升級為「有組織的指揮中心」。**

---

**7. Gateway 版本矩陣（全新運維功能，之前完全沒考慮版本管理）**

**問題：** 車隊中不同 bot 可能跑不同版本的 OpenClaw Gateway。某些 API 只在新版本可用。

**Gateway 版本資訊來源：** `hello-ok` 回應中的 `server.version` 欄位。

**Fleet 版本矩陣 Widget：**
```
┌─ Gateway Versions ──────────────────────────┐
│                                               │
│  v2026.1.24-3  🟢🟢🟢 (3 bots — latest)    │
│  v2026.1.22-1  🟡      (1 bot — outdated)   │
│                                               │
│  ⚠️ 1 bot running outdated gateway            │
│  [Plan Fleet Update →]                        │
└───────────────────────────────────────────────┘
```

**結合 Fleet Command Center 的 `update.run` RPC：**
1. 版本矩陣顯示哪些 bot 需要更新
2. 一鍵觸發 Canary 更新（先 1 個 bot，觀察 health，再全部）
3. 更新完成後版本矩陣自動刷新

→ **從「我不知道哪個 bot 跑什麼版本」到「一目了然 + 一鍵更新」。這是 10+ bot 規模的必要功能。**

---

**8. Notification Center（全新，替代分散的 toast 通知）**

**問題：** Planning #7 設計了 AlertService + Dashboard Alert Panel，Planning #8 加了 toast 通知。但：
- Toast 3 秒就消失
- Dashboard Alert Panel 只在 FleetDashboard 頁面可見
- 使用者在看 Issues 頁面時完全看不到車隊告警

**解決方案：Notification Bell — 全域可見的通知中心**

```
Sidebar 頂部：
┌─────────────────────────┐
│ 🔶 Pain Point Fleet  🔔3│  ← 通知鈴鐺 + 未讀計數
│ 🔍                      │
└─────────────────────────┘

點擊 🔔 展開：
┌─ Notifications ──────────────────────────────┐
│  🔴 14:52 — 🐗 山豬 Health Score 28 (F)      │
│  🟡 14:45 — 🦚 孔雀 LINE channel disconnected│
│  🟢 14:30 — 🐿️ 飛鼠 connected to fleet       │
│  🟢 14:28 — System: Fleet Monitor started     │
│                                                │
│  [Mark all read]  [View all →]                 │
└────────────────────────────────────────────────┘
```

**實作方式：**
- 複用 `fleet.alert.triggered` 和 `fleet.bot.*` LiveEvents
- 前端用 React Context 存 notification 陣列
- 全域 NotificationBell 組件放在 Sidebar 頂部
- LocalStorage 持久化已讀狀態

→ **使用者在任何頁面都能看到車隊異常，不需要切換到 FleetDashboard。**

---

**9. 本次程式碼產出**

**Commit 11: Route Wiring + Sidebar Fleet Pulse**
```
修改：ui/src/App.tsx
  — import FleetDashboard, ConnectBotWizard
  — 新增 /fleet-monitor 路由
  — 新增 /fleet-monitor/connect 路由

修改：ui/src/components/Sidebar.tsx
  — import Radio icon
  — import useFleetStatus hook
  — 新增 Fleet Monitor nav item + online bot count badge
  — 新增 Fleet Pulse 圓點列（bot connection state dots）
```

**Commit 12: LiveEvent Fleet Bridge**
```
修改：ui/src/context/LiveUpdatesProvider.tsx
  — handleLiveEvent() 新增 fleet.* event handling
  — fleet.bot.health → invalidate fleet status + bot health
  — fleet.bot.connected/disconnected → invalidate + toast
  — fleet.alert.triggered → invalidate alerts + warning toast
  — fleet.cost.updated → invalidate bot usage
```

**Commit 13: BotDetailFleetTab**
```
新增：ui/src/components/fleet/BotDetailFleetTab.tsx
  — Gateway 連線資訊卡片（state, URL, protocol, uptime, device ID）
  — Health Breakdown 面板（5 維度分數 + 視覺化長條）
  — Channel 狀態列表（品牌色圓點 + 訊息計數）
  — Active Sessions 列表（session key + token 用量 + 開始時間）
  — Memory Viewer（MEMORY.md 內容 + refresh 按鈕）
  — Cron Jobs 列表（schedule + 上次執行結果）
  — Control UI 深連結 + Disconnect 按鈕
```

**Commit 14: Companies → Fleet 頁面整合 ConnectBotWizard**
```
修改：ui/src/pages/Companies.tsx
  — 新增 "Connect Bot" 按鈕（在 fleet 卡片中）
  — Dialog 嵌入 ConnectBotWizard
  — 連接成功後刷新 fleet status
```

---

**10. 與前幾次 Planning 的關鍵差異**

| 面向 | 之前的想法 | Planning #9 的改進 |
|------|----------|-------------------|
| 路由整合 | 完全沒處理 | 完整的 React Router 接線 + 漸進替換策略 |
| Sidebar | 靜態導航選單 | Fleet Pulse 永遠可見的車隊健康微指標 |
| LiveEvent | 設計了策略但沒實作 | 實作完整的 event → query invalidation → toast 管線 |
| Bot Detail | 只有概覽卡片 | 完整的 Fleet Tab（connection, health, channels, sessions, memory, cron）|
| Session 內容 | 只有 session 列表 | Session Live Tail（即時對話串流） |
| Bot 組織 | 扁平列表 | Tag 分組系統（零 DB migration） |
| Gateway 版本 | 完全沒考慮 | 版本矩陣 + 一鍵 Canary 更新 |
| 通知 | 只有 toast（3 秒消失） | Notification Bell 全域通知中心 |

---

**11. 風險更新**

| 新風險 | 嚴重度 | 緩解 |
|--------|--------|------|
| FleetDashboard 路由與原 Dashboard 衝突 | 🟡 中 | Phase A 用獨立路由 /fleet-monitor，不替換 /dashboard |
| Sidebar Fleet Pulse 在 10+ bot 時視覺擁擠 | 🟢 低 | 最多 12 圓點 + "+N" overflow |
| LiveEvent fleet.* 事件洪水沖垮 React Query | 🟡 中 | debounce invalidation + staleTime 防重複 fetch |
| BotDetailFleetTab 在 AgentDetail 中載入大量資料 | 🟡 中 | 懶載入：只在 Fleet tab 被選中時才 fetch |
| Session Live Tail 的 JSONL 檔案可能很大 | 🟡 中 | 只載入最近 100 條 + 虛擬滾動 |
| Bot Tag 存在 metadata 中，schema-less 容易出錯 | 🟢 低 | 前端驗證 + tag 名稱白名單 |

---

**12. 修訂的整體進度追蹤**

```
✅ Planning #1-4: 概念、API 研究、架構設計
✅ Planning #5: 品牌主題 CSS + DB aliases + 術語改名
✅ Planning #6: FleetGatewayClient + FleetMonitorService + API routes
✅ Planning #7: Mock Gateway + Health Score + AlertService + 時序策略 + Command Center
✅ Planning #8: Fleet API client + React hooks + BotStatusCard + FleetDashboard + ConnectBotWizard
✅ Planning #9: Route wiring + Sidebar Fleet Pulse + LiveEvent bridge + BotDetailFleetTab + Companies Connect
⬜ Next: Session Live Tail 前端組件
⬜ Next: Bot Tag 分組系統 + Filter Bar
⬜ Next: Gateway 版本矩陣 Widget
⬜ Next: Notification Center（全域通知鈴鐺）
⬜ Next: DB migration（fleet_snapshots + fleet_daily_summary）
⬜ Next: 趨勢圖組件（Sparkline 已有，需要 full-size chart）
⬜ Next: Playwright E2E 測試（Mock Gateway → Connect → Dashboard → Bot Detail）
⬜ Next: Fleet Command Center UI（batch operations）
```

---

**13. OpenClaw Gateway API 研究更新（第五次，補充確認）**

本次確認新增發現：
- `hello-ok` 回應包含 `server.version` 欄位 → 用於 Gateway 版本矩陣
- `chat.history` RPC 支援 `limit` 和 `before` 參數 → Session Live Tail 分頁載入
- `agent.identity` 回應包含 `description` 欄位 → Bot Detail 可顯示 bot 自我介紹
- `channels.status` 回應的 `messageCount24h` 欄位 → Channel 活動量指示器
- `config.get` 回應包含 `session.dmScope` → 了解 bot 的 session 路由策略

確認 44 個 RPC 方法和 8 個 event type 的完整清單與之前一致。

---

**14. 品牌色確認（第五次，無變更）**

品牌色系統已在 Planning #5 實作於 `ui/src/index.css`，Planning #8 擴展到 `ui/src/lib/status-colors.ts`。
本次無需額外色彩研究。所有色彩值穩定一致。

---

**下一步 Planning #10（如果需要）：**
- Session Live Tail 完整實作（前端組件 + 後端 API）
- Bot Tag 分組系統 + Dashboard Filter Bar
- Gateway 版本矩陣 Widget
- Notification Center + NotificationBell 組件
- DB migration 實作（fleet_snapshots + fleet_daily_summary）
- 第一次全流程 E2E 測試
