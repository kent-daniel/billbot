# 📋 ADR 001: /bill Command - Gmail Bill Tracking Integration

> **Architecture Decision Record** for BillBot Discord Integration

| Field | Value |
|-------|-------|
| 🏷️ **Status** | `🟡 Proposed` |
| 📅 **Date** | 2026-01-17 |
| 👤 **Author** | Development Team |
| 🎯 **Decision** | Implement manual `/bill` command for Origin Energy bill tracking |

---

## 📑 Table of Contents

| # | Section | Description |
|---|---------|-------------|
| 1 | [Context & Problem Statement](#-context--problem-statement) | What we're solving |
| 2 | [Decision Drivers](#-decision-drivers) | Key requirements |
| 3 | [Options Considered](#-options-considered) | Alternatives evaluated |
| 4 | [Decision Outcome](#-decision-outcome) | Final recommendation |
| 5 | [Technical Architecture](#-technical-architecture) | Stack & design |
| 6 | [Implementation Plan](#-implementation-plan) | Phase-by-phase guide |
| 7 | [File Structure](#-file-structure) | Project organization |
| 8 | [Configuration Requirements](#-configuration-requirements) | Environment setup |
| 9 | [Bill Identification Strategy](#-bill-identification-strategy) | Classification logic |
| 10 | [Response Format](#-response-format) | Discord output |
| 11 | [Risks & Mitigations](#-risks--mitigations) | Risk management |
| 12 | [Success Criteria](#-success-criteria) | Definition of done |
| 13 | [Cost Estimate](#-cost-estimate) | Budget breakdown |
| 14 | [Future Enhancements](#-future-enhancements) | Roadmap |

---
## 🎯 Context & Problem Statement

The Discord bot needs a new `/bill` command that:

| Requirement | Description |
|-------------|-------------|
| 📧 **Gmail Search** | Search inbox for bills from Origin Energy (`hello@origin.com.au`) |
| 🏷️ **Bill Types** | Identify 4 types: ⚡ Electricity, 🔥 Hot Water, 💧 Water, 🌐 Internet |
| 📄 **PDF Parsing** | Extract amount + issue date from attachments |
| 📊 **Summary** | Return bills from last 30 days |
| ⏱️ **Long-running** | Handle operations >30s (Cloudflare Workers limit) |
| 🔄 **Durability** | Automatic retries on failures |
| 🔐 **OAuth** | One-time setup, tokens auto-refresh |

### 🏗️ Current Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Current Stack                         │
├─────────────────────────────────────────────────────────┤
│  ☁️  Cloudflare Workers    │  Serverless edge runtime    │
│  💾  Durable Objects       │  SQLite conversation store  │
│  🤖  Gemini 2.0 Flash Lite │  AI integration             │
│  💬  Discord Interactions  │  Webhooks (no WebSocket)    │
│  📧  Email Infrastructure  │  ❌ None (to be added)      │
└─────────────────────────────────────────────────────────┘
```
---
## 🧭 Decision Drivers

| # | Driver | Rationale |
|---|--------|----------|
| 1️⃣ | **☁️ Stay within Cloudflare** | Minimize infrastructure complexity |
| 2️⃣ | **💰 Cost-effectiveness** | Personal project, optimize for free/low tiers |
| 3️⃣ | **🔄 Durability** | Handle failures gracefully with automatic retries |
| 4️⃣ | **👨‍💻 Developer experience** | TypeScript, minimal dependencies, simple maintenance |
| 5️⃣ | **⚡ Performance** | Low latency for Discord interactions |
| 6️⃣ | **🔐 Security** | OAuth 2.0 with secure token storage |
| 7️⃣ | **🛠️ Maintainability** | Single codebase, single deployment |
---

## 🔍 Options Considered

### Option 1: Cloudflare Workflows + Gmail API + Gemini AI 

> 🏆 **`RECOMMENDED`**
**Architecture:**

```
📱 Discord /bill command 
         ↓ 
    (immediate deferred response)
         ↓
☁️ Cloudflare Workflow (durable execution)
         ↓
    ┌────┴────┐
    │ STEPS   │
    ├─────────┤
    │ 1️⃣ OAuth token refresh (if needed)
    │ 2️⃣ Search Gmail for Origin bills
    │ 3️⃣ Filter by subject keywords
    │ 4️⃣ Download PDF attachments (parallel)
    │ 5️⃣ Parse with Gemini (classify + extract)
    │ 6️⃣ Store in BillsDO
    │ 7️⃣ Reply to Discord
    └─────────┘
```
**Components:**

<table>
<tr>
<th>Component</th>
<th>Details</th>
</tr>
<tr>
<td>

**1️⃣ Gmail Integration**

</td>
<td>

- **Library:** `arctic` v3.7+ (OAuth 2.0, Workers-compatible, 0 dependencies)
- **Token storage:** New Durable Object `OAuthTokensDO`
- **API:** Direct REST calls via fetch (no googleapis package)
- **Rate limits:** 1B quota units/day ✅

</td>
</tr>
<tr>
<td>

**2️⃣ Workflow Orchestration**

</td>
<td>

- Cloudflare Workflows (native TypeScript)
- Built-in state persistence and retry logic
- Each step automatically checkpointed
- No external infrastructure

</td>
</tr>
<tr>
<td>

**3️⃣ Bill Parsing**

</td>
<td>

- Gemini 2.0 Flash Lite (existing integration)
- Multimodal PDF input
- Structured output via `generateObject` (Zod schema)
- Cost: **<$0.01 per bill**

</td>
</tr>
<tr>
<td>

**4️⃣ Data Storage**

</td>
<td>

- `BillsDO`: Per-user bill history (max 50 bills, rolling window)
- Schema: `{ id, type, amount, issue_date, billing_period, gmail_id, timestamp }`

</td>
</tr>
</table>

| ✅ Pros | ⚠️ Cons |
|---------|----------|
| Native CF Workers integration | CF Workflows is new (launched 2024) - less mature |
| Automatic durability and retries | OAuth setup requires initial user authorization flow |
| Handles >30s operations | |
| Type-safe TypeScript workflows | |
| Leverages existing Gemini integration | |
| Minimal cost (~$0-5/month) | |
| Single codebase | |
---

### Option 2: Cloudflare Queues + Gmail API + Gemini AI 

> 🟡 **`FALLBACK`**

**Architecture:**

```
📱 Discord /bill command → 📨 Queue Message
                              ↓
            Queue Consumer Workers (chained):
            ┌─────────────────────────────────┐
            │ Worker 1: Search Gmail → Queue │
            │ Worker 2: Download PDFs → Queue│
            │ Worker 3: Parse w/ Gemini → Q  │
            │ Worker 4: Store + respond      │
            └─────────────────────────────────┘
```

| ✅ Pros | ⚠️ Cons |
|---------|----------|
| Production-ready (mature) | Manual retry logic required |
| Native CF integration | More code to orchestrate chain |
| Simple message passing model | No automatic state checkpointing |
| Very cheap ($0.40/1M messages) | Must implement own durability patterns |

> 💡 **Use if:** Workflows prove too immature or unstable
---

### Option 3: External Orchestrators (Prefect/Temporal)

> ❌ **`REJECTED`**

| ✅ Pros | ❌ Cons |
|---------|----------|
| Enterprise-grade durability | Requires separate infrastructure (VMs/containers) |
| Rich monitoring UI | Architectural complexity (bridging CF Workers ↔ external service) |
| | Cost: $100+/month |
| | Overkill for 7-step workflow |

> 👎 **Verdict:** Not suitable for personal project
---

### Option 4: Cron Triggers + Durable Objects

> ❌ **`REJECTED`**

| ✅ Pros | ⚠️ Cons |
|---------|----------|
| Simplest architecture | Must implement retry logic from scratch |
| Full control | No on-demand triggering (waits for cron) |
| | Reinventing workflow orchestration |

> 👎 **Verdict:** Not suitable for manual `/bill` command (better for scheduled notifications)
---

## ✅ Decision Outcome

### 🏆 RECOMMENDED: Option 1

> **Cloudflare Workflows + Gmail API + Gemini AI**

#### Rationale

| # | Reason | Details |
|---|--------|---------|  
| 1 | 🎯 **Best architectural fit** | Designed for long-running, durable operations |
| 2 | 🌟 **Minimal complexity** | Single codebase, TypeScript, no external services |
| 3 | 💰 **Cost-effective** | Free tier sufficient for personal use |
| 4 | 👨‍💻 **Developer experience** | Declarative workflows, type-safe |
| 5 | 🔄 **Leverages existing stack** | Gemini AI already integrated |

### 🟡 Fallback: Option 2 (Cloudflare Queues)

If Workflows prove immature:
- ✅ Queues are production-ready
- ✅ Still 100% CF ecosystem
- ✅ Slightly more code but proven pattern

---

## 🛠️ Technical Architecture

### 📚 Stack Overview

| Component | Technology | Purpose |
|:---------:|:----------:|:-------:|
| 🔐 OAuth | `arctic` v3.7+ | Gmail authorization (0 deps, 10KB) |
| 📧 Gmail API | REST via `fetch` | Search emails, download attachments |
| ⚙️ Workflow | Cloudflare Workflows | Durable orchestration (>30s support) |
| 🤖 Parsing | Gemini 2.0 Flash Lite | PDF classification + extraction |
| 💾 Storage | Durable Objects | OAuth tokens + bill history |
| 💬 Bot API | Discord REST API | Send messages (no WebSocket) |

### 📦 Dependencies to Add

```json
{
  "dependencies": {
    "arctic": "^3.7.0"
  }
}
```

### 🔄 Workflow Execution Flow

```typescript
// Pseudocode structure
export default {
  async execute(ctx: WorkflowContext, input: { userId: string }) {
    // Step 1: Auth
    const token = await ctx.step('refresh-token', async () => {
      const tokensStub = ctx.env.OAUTH_TOKENS.get(id);
      return await tokensStub.refreshIfNeeded();
    });
    
    // Step 2: Search Gmail
    const messages = await ctx.step('search-gmail', async () => {
      return await searchGmail(token, buildOriginQuery(30));
    });
    
    // Step 3: Filter by subject
    const filtered = await ctx.step('filter-subjects', async () => {
      return messages.filter(msg => hasRelevantSubject(msg));
    });
    
    // Step 4: Download PDFs (parallel)
    const pdfs = await ctx.step('download-pdfs', async () => {
      return await Promise.all(
        filtered.slice(0, 10).map(msg => downloadAttachments(msg, token))
      );
    });
    // Step 5: Parse with Gemini
    const bills = await ctx.step('parse-bills', async () => {
      return await Promise.all(
        pdfs.map(pdf => parseBillWithGemini(pdf))
      );
    });
    
    // Step 6: Store
    await ctx.step('store-bills', async () => {
      const billsStub = ctx.env.BILLS.get(id);
      await billsStub.storeBills(bills);
    });
    
    // Step 7: Respond to Discord
    await ctx.step('send-discord', async () => {
      await sendDiscordMessage(channelId, formatBillSummary(bills), token);
    });
  }
}
```

---

## 📅 Implementation Plan

### Phase 0️⃣: Google Cloud Prerequisites

> ⏱️ **Duration:** 15-20 min one-time setup
>
> 🎯 **Goal:** Set up Google Cloud project and OAuth credentials
Tasks:
1. Create Google Cloud Project
   - Navigate to https://console.cloud.google.com
   - Click "New Project"
   - Name: "BillBot Gmail Integration"
   - Note the Project ID
2. Enable Gmail API
   - Go to "APIs & Services" → "Library"
   - Search for "Gmail API"
   - Click "Enable"
3. Configure OAuth Consent Screen
   - Navigate to "APIs & Services" → "OAuth consent screen"
   - User Type: External (for personal use)
   - App name: "BillBot"
   - User support email: Your email
   - Developer contact: Your email
   - Scopes: Add https://www.googleapis.com/auth/gmail.readonly
   - Test users: Add your Gmail address
4. Create OAuth 2.0 Credentials
   - Go to "APIs & Services" → "Credentials"
   - Click "Create Credentials" → "OAuth client ID"
   - Application type: Web application
   - Name: "BillBot Discord Bot"
   - Authorized redirect URIs: https://billbot.YOUR-SUBDOMAIN.workers.dev/oauth/google/callback
   - Click "Create"
   - Copy Client ID and Client Secret
5. Store Credentials
   - Add to .env and .dev.vars:
          GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
     GOOGLE_CLIENT_SECRET=xxx
     GOOGLE_REDIRECT_URI=https://billbot.YOUR-SUBDOMAIN.workers.dev/oauth/google/callback
     
✅ **Deliverable:** OAuth credentials ready for integration

---

### Phase 1️⃣: OAuth Foundation

> ⏱️ **Duration:** 1-2 days
>
> 🎯 **Goal:** One-time Gmail authorization with automatic token refresh

<details>
<summary>📝 <b>Tasks</b> (click to expand)</summary>

#### 1️⃣ Install arctic dependency

```bash
npm install arctic@^3.7.0
```

#### 2️⃣ Create OAuthTokensDO Durable Object

**File:** `src/durable-objects/oauthTokens.ts`

**Schema (SQLite):**
```sql
CREATE TABLE tokens (
  user_id TEXT PRIMARY KEY,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at INTEGER NOT NULL
)
```

**Methods:**
- `store(accessToken, refreshToken, expiresIn)` - Store tokens
- `get()` - Retrieve current tokens  
- `refreshIfNeeded()` - Auto-refresh if expired (uses arctic)

#### 3️⃣ Create OAuth callback endpoint

**File:** `src/index.ts` (add new route)

**Route:** `/oauth/google/callback`

**Flow:**
1. Receive `code` parameter from Google
2. Exchange code for tokens using arctic
3. Store in `OAuthTokensDO`
4. Redirect to success page or return JSON

#### 4️⃣ Add /bill connect command

Register in `register-commands.js`:

```javascript
{
  name: 'bill',
  description: 'Manage bills',
  options: [
    {
      name: 'connect',
      description: 'Connect your Gmail account',
      type: 1 // SUB_COMMAND
    }
  ]
}
```

Handler in `src/index.ts`:
1. Generate OAuth URL using arctic
2. Send ephemeral message with link: "Click here to authorize Gmail access"
3. Include `user_id` in state parameter

#### 5️⃣ Update wrangler.toml

```toml
[[durable_objects.bindings]]
name = "OAUTH_TOKENS"
class_name = "OAuthTokensDO"
script_name = "billbot"

[[migrations]]
tag = "v2"
new_sqlite_classes = ["OAuthTokensDO"]
```

</details>

✅ **Deliverable:** User can run `/bill connect`, authorize once, tokens auto-refresh

**🧪 Testing:**
- Trigger `/bill connect` in Discord
- Complete OAuth flow in browser
- Verify tokens stored in DO (check Wrangler dashboard)
- Test token refresh logic after 1 hour

---

### Phase 2️⃣: Gmail Integration

> ⏱️ **Duration:** 1-2 days
>
> 🎯 **Goal:** Search and download Origin Energy bills from Gmail

<details>
<summary>📝 <b>Tasks</b> (click to expand)</summary>

#### 1️⃣ Create Gmail service

**File:** `src/services/gmail.ts`

```typescript
// Search emails with query
async function searchEmails(
  token: string,
  query: string
): Promise<GmailMessage[]>

// Get email details
async function getEmailDetails(
  token: string,
  messageId: string
): Promise<GmailMessageFull>

// Download attachment
async function downloadAttachment(
  token: string,
  messageId: string,
  attachmentId: string
): Promise<{ data: string; mimeType: string }>
```

All use direct fetch to Gmail REST API:

```typescript
const response = await fetch(
  `https://gmail.googleapis.com/gmail/v1/users/me/messages`,
  {
    headers: { Authorization: `Bearer ${token}` }
  }
);
```

#### 2️⃣ Create Origin Energy configuration

**File:** `src/config/billSenders.ts`

```typescript
export const ORIGIN_CONFIG = {
  sender: 'hello@origin.com.au',
  timezone: 'Australia/Melbourne',
  requirePDF: true,
  
  // Subject line keywords for pre-filtering
  subjectKeywords: {
    electricity: ['electricity', 'power', 'energy bill'],
    hot_water: ['hot water', 'gas', 'heating'],
    water: ['water bill', 'water usage'],
    internet: ['internet', 'broadband', 'nbn']
  }
};
```

#### 3️⃣ Build Gmail query constructor

**File:** `src/services/gmail.ts`

```typescript
function buildOriginBillQuery(daysBack: number = 30): string {
  const date = new Date();
  date.setDate(date.getDate() - daysBack);
  // Gmail date format: YYYY/MM/DD
  const dateStr = date.toISOString().split('T')[0].replace(/-/g, '/');
  
  return `from:${ORIGIN_CONFIG.sender} after:${dateStr} has:attachment filename:pdf`;
}
```

#### 4️⃣ Implement subject line filtering

```typescript
function categorizeBySubject(subject: string): BillType | null {
  const lower = subject.toLowerCase();
  for (const [type, keywords] of Object.entries(ORIGIN_CONFIG.subjectKeywords)) {
    if (keywords.some(kw => lower.includes(kw))) {
      return type as BillType;
    }
  }
  return null; // Will classify with Gemini
}
```

</details>

✅ **Deliverable:** Can search Gmail and download Origin Energy bill PDFs

**🧪 Testing:**
- Run search manually (via test endpoint)
- Verify correct emails returned
- Test PDF download
- Check subject filtering accuracy

---

### Phase 3️⃣: Cloudflare Workflow

> ⏱️ **Duration:** 2-3 days
>
> 🎯 **Goal:** Durable orchestration for long-running operations

<details>
<summary>📝 <b>Tasks</b> (click to expand)</summary>

#### 1️⃣ Update wrangler.toml

```toml
[[workflows]]
name = "scan-gmail-bills"
script = "src/workflows/scanGmailBills.ts"

[[workflows.bindings]]
type = "durable_object"
name = "OAUTH_TOKENS"
class_name = "OAuthTokensDO"

[[workflows.bindings]]
type = "durable_object"
name = "BILLS"
class_name = "BillsDO"
```

#### 2️⃣ Create main workflow

**File:** `src/workflows/scanGmailBills.ts`

- Implement 7-step workflow (see "Workflow Execution Flow" above)
- Add error handling for each step:

```typescript
try {
  const result = await ctx.step('step-name', async () => {
    // Step logic
  });
} catch (error) {
  console.error('Step failed:', error);
  // Workflow will auto-retry with exponential backoff
  throw error;
}
```

#### 3️⃣ Add workflow trigger to /bill command

**File:** `src/index.ts`

```typescript
case 'bill':
  // Send deferred response (type 5)
  await fetch(interactionResponseUrl, {
    method: 'POST',
    body: JSON.stringify({ type: 5 })
  });
  
  // Trigger workflow (non-blocking)
  const workflow = await env.WORKFLOWS.create('scan-gmail-bills', {
    userId: interaction.user.id,
    channelId: interaction.channel_id,
    interactionToken: interaction.token
  });
  
  return new Response('', { status: 200 });
```

#### 4️⃣ Implement retry logic

- Exponential backoff for Gmail API failures
- Max 3 retries per step
- Log failures for debugging

</details>

✅ **Deliverable:** Complete durable workflow that handles >30s operations

**🧪 Testing:**
- Trigger `/bill` command
- Monitor workflow execution (Wrangler dashboard)
- Test failure scenarios (invalid token, network errors)
- Verify retries work correctly

---

### Phase 4️⃣: Bill Parsing with Gemini

> ⏱️ **Duration:** 1-2 days
>
> 🎯 **Goal:** Extract bill type, amount, and issue date from PDFs

<details>
<summary>📝 <b>Tasks</b> (click to expand)</summary>

#### 1️⃣ Create bill parser service

**File:** `src/services/billParser.ts`

```typescript
async function parseBillWithGemini(
  pdf: { data: string; mimeType: string },
  subjectHint?: BillType
): Promise<ParsedBill>
```

#### 2️⃣ Define Zod schema

**File:** `src/types/bills.ts`

```typescript
import { z } from 'zod';

export const BillTypeSchema = z.enum([
  'electricity',
  'hot_water',
  'water',
  'internet'
]);

export const ParsedBillSchema = z.object({
  type: BillTypeSchema,
  amount: z.number().positive(),
  issue_date: z.string(), // ISO format YYYY-MM-DD
  confidence: z.number().min(0).max(1)
});

export type BillType = z.infer<typeof BillTypeSchema>;
export type ParsedBill = z.infer<typeof ParsedBillSchema>;
```

#### 3️⃣ Implement Gemini extraction

```typescript
import { generateObject } from 'ai';
import { google } from '@ai-sdk/google';

async function parseBillWithGemini(
  pdf: { data: string; mimeType: string },
  subjectHint?: BillType
): Promise<ParsedBill> {
  const result = await generateObject({
    model: google('gemini-2.0-flash-lite'),
    schema: ParsedBillSchema,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'text',
          text: `Analyze this Origin Energy bill PDF.
          
          Extract:
          1. Bill type: electricity | hot_water | water | internet
          2. Total amount due (numeric value only, no currency symbol)
          3. Issue date (the date the bill was generated, NOT due date)
          4. Confidence score (0-1) for classification
          
          ${subjectHint ? `Hint: Subject suggests this might be a ${subjectHint} bill.` : ''}
          
          Return as JSON matching the schema.`
        },
        {
          type: 'file',
          data: pdf.data, // base64
          mimeType: pdf.mimeType
        }
      ]
    }],
    temperature: 0.1 // Low temperature for accuracy
  });
  
  return result.object;
}
```

#### 4️⃣ Handle parsing failures

- If confidence < 0.7, log warning and skip bill
- If Gemini returns invalid JSON, retry once
- Track parsing errors in DO for debugging

</details>

✅ **Deliverable:** Accurate extraction of bill type, amount, and issue date

**🧪 Testing:**
- Test with real Origin Energy PDFs
- Verify all 4 bill types classified correctly
- Check amount extraction accuracy
- Validate date parsing (handle various formats)

---

### Phase 5️⃣: Storage & Discord Response

> ⏱️ **Duration:** 1 day
>
> 🎯 **Goal:** Store bills and format Discord reply

<details>
<summary>📝 <b>Tasks</b> (click to expand)</summary>

#### 1️⃣ Create BillsDO Durable Object

**File:** `src/durable-objects/bills.ts`

**Schema (SQLite):**

```sql
CREATE TABLE bills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  amount REAL NOT NULL,
  issue_date TEXT NOT NULL,
  gmail_message_id TEXT NOT NULL UNIQUE,
  timestamp INTEGER NOT NULL
);

CREATE INDEX idx_user_timestamp ON bills(user_id, timestamp DESC);
```

**Methods:**
- `storeBills(bills: ParsedBill[])` - Insert/update bills (upsert by gmail_id)
- `getRecent(daysBack: number = 30)` - Retrieve bills from last N days
- `prune()` - Keep max 50 bills per user (auto-cleanup)

#### 2️⃣ Implement Discord response formatter

**File:** `src/services/discord.ts` (add function)

```typescript
function formatBillSummary(bills: ParsedBill[]): string {
  if (bills.length === 0) {
    return '📊 No bills found in the last 30 days.';
  }
  
  // Group by type
  const grouped = {
    electricity: bills.filter(b => b.type === 'electricity')[0],
    hot_water: bills.filter(b => b.type === 'hot_water')[0],
    water: bills.filter(b => b.type === 'water')[0],
    internet: bills.filter(b => b.type === 'internet')[0]
  };
  
  const lines = [];
  lines.push('📊 **Bills for last 30 days:**\n');
  
  if (grouped.electricity) {
    const date = formatDate(grouped.electricity.issue_date);
    lines.push(`⚡ Electricity: $${grouped.electricity.amount.toFixed(2)} (${date})`);
  }
  if (grouped.hot_water) {
    const date = formatDate(grouped.hot_water.issue_date);
    lines.push(`🔥 Hot Water: $${grouped.hot_water.amount.toFixed(2)} (${date})`);
  }
  if (grouped.water) {
    const date = formatDate(grouped.water.issue_date);
    lines.push(`💧 Water: $${grouped.water.amount.toFixed(2)} (${date})`);
  }
  if (grouped.internet) {
    const date = formatDate(grouped.internet.issue_date);
    lines.push(`🌐 Internet: $${grouped.internet.amount.toFixed(2)} (${date})`);
  }
  
  const total = bills.reduce((sum, b) => sum + b.amount, 0);
  lines.push(`\n**Total:** $${total.toFixed(2)}`);
  
  return lines.join('\n');
}

function formatDate(isoDate: string): string {
  const date = new Date(isoDate);
  return date.toLocaleDateString('en-AU', { 
    month: 'short', 
    day: 'numeric' 
  });
}
```

#### 3️⃣ Implement error responses

```typescript
function formatErrorResponse(error: Error): string {
  if (error.message.includes('oauth')) {
    return '❌ Your Gmail connection expired. Please run `/bill connect` to re-authorize.';
  }
  if (error.message.includes('rate limit')) {
    return '⏳ Gmail API rate limit reached. Please try again in a few minutes.';
  }
  return `❌ An error occurred: ${error.message}\n\nPlease try again or contact support.`;
}
```

#### 4️⃣ Update workflow final step

- Send formatted message or error to Discord
- Use deferred response token from interaction

</details>

✅ **Deliverable:** Complete `/bill` command with formatted response

**🧪 Testing:**
- Run `/bill` end-to-end
- Verify bills stored in DO
- Check response formatting
- Test error scenarios (OAuth expired, no bills, parsing failures)

---

### Phase 6️⃣: Testing & Polish

> ⏱️ **Duration:** 1 day
>
> 🎯 **Goal:** Production-ready deployment

<details>
<summary>📝 <b>Tasks</b> (click to expand)</summary>

#### 1️⃣ End-to-end testing

- Test full flow with real Gmail account
- Verify all 4 bill types detected
- Check edge cases:
  - ❎ No bills in last 30 days
  - ❎ Only some bill types present
  - ❎ Multiple bills of same type
  - ❎ Emails without PDF attachments

#### 2️⃣ Error handling audit

- OAuth token expiration
- Gmail API failures
- Gemini API failures
- Network timeouts
- Invalid PDF formats

#### 3️⃣ Update command registration

**File:** `register-commands.js`

```javascript
{
  name: 'bill',
  description: 'Check recent bills from Origin Energy',
  options: [
    {
      name: 'connect',
      description: 'Connect your Gmail account (one-time setup)',
      type: 1
    }
  ]
}
```

Deploy commands: `node register-commands.js`

#### 4️⃣ Documentation updates

- Update `README.md` with `/bill` usage
- Add Google Cloud setup guide
- Document OAuth flow
- Add troubleshooting section

#### 5️⃣ Deploy to production

```bash
# Set secrets
wrangler secret put GOOGLE_CLIENT_ID
wrangler secret put GOOGLE_CLIENT_SECRET
wrangler secret put GOOGLE_REDIRECT_URI

# Deploy
npm run deploy
```

#### 6️⃣ Post-deployment verification

- Test `/bill connect` flow
- Test `/bill` command
- Monitor logs for errors
- Check Durable Object storage

</details>

✅ **Deliverable:** Production-ready `/bill` command

---

### Phase 7️⃣: Scheduled Notifications *(OPTIONAL)*

> 🔮 **Status:** TBD (not priority for initial implementation)
>
> 🎯 **Goal:** Automatic monthly bill summaries to Discord DMs
>
> 🛠️ **Approach:** Cloudflare Cron Triggers

<details>
<summary>📝 <b>Tasks (when ready)</b> (click to expand)</summary>

#### 1️⃣ Add cron trigger to wrangler.toml

```toml
[triggers]
crons = ["0 22 * * *"] # 9am AEDT = 10pm UTC previous day
```

#### 2️⃣ Implement scheduled handler

**File:** `src/index.ts`

```typescript
export default {
  async fetch(...) { /* existing */ },
  
  async scheduled(event: ScheduledEvent, env: Env) {
    // Get user's DM channel ID
    const dmChannelId = await getDMChannel(env.YOUR_USER_ID);
    
    // Trigger workflow
    const workflow = await env.WORKFLOWS.create('scan-gmail-bills', {
      userId: env.YOUR_USER_ID,
      channelId: dmChannelId,
      isScheduled: true
    });
  }
}
```

#### 3️⃣ Create DM channel helper

```typescript
async function getDMChannel(userId: string): Promise<string> {
  const response = await fetch(
    'https://discord.com/api/v10/users/@me/channels',
    {
      method: 'POST',
      headers: {
        'Authorization': `Bot ${env.DISCORD_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ recipient_id: userId })
    }
  );
  const channel = await response.json();
  return channel.id;
}
```

</details>

✅ **Deliverable:** Monthly automatic bill summaries to your DMs

---

## 📁 File Structure

### 🆕 New Files to Create

```
src/
├── index.ts                          # 🔄 UPDATE: +/bill command, +OAuth callback
├── config/
│   └── billSenders.ts               # 🆕 NEW: Origin Energy configuration
├── workflows/
│   └── scanGmailBills.ts            # 🆕 NEW: 7-step workflow
├── durable-objects/
│   ├── conversation.ts              # ✅ EXISTING
│   ├── oauthTokens.ts               # 🆕 NEW: OAuth storage + auto-refresh
│   └── bills.ts                     # 🆕 NEW: Bill history storage (max 50)
├── services/
│   ├── discord.ts                   # 🔄 UPDATE: +formatBillSummary()
│   ├── ai.ts                        # ✅ EXISTING
│   ├── gmail.ts                     # 🆕 NEW: Gmail API wrapper
│   └── billParser.ts                # 🆕 NEW: Gemini parsing logic
└── types/
    ├── discord.ts                   # ✅ EXISTING
    └── bills.ts                     # 🆕 NEW: Bill schemas (Zod)

register-commands.js                 # 🔄 UPDATE: Add /bill command
wrangler.toml                        # 🔄 UPDATE: +Workflows, +2 DOs, +env vars
package.json                         # 🔄 UPDATE: +arctic dependency
.env / .dev.vars                     # 🔄 UPDATE: +Google OAuth credentials
```

### 📄 Updated wrangler.toml

```toml
name = "billbot"
main = "src/index.ts"
compatibility_date = "2024-01-17"
node_compat = true

# Workflows
[[workflows]]
name = "scan-gmail-bills"
script = "src/workflows/scanGmailBills.ts"

# Durable Objects
[[durable_objects.bindings]]
name = "CONVERSATIONS"
class_name = "ConversationDO"
script_name = "billbot"

[[durable_objects.bindings]]
name = "OAUTH_TOKENS"
class_name = "OAuthTokensDO"
script_name = "billbot"

[[durable_objects.bindings]]
name = "BILLS"
class_name = "BillsDO"
script_name = "billbot"

# Migrations
[[migrations]]
tag = "v1"
new_sqlite_classes = ["ConversationDO"]

[[migrations]]
tag = "v2"
new_sqlite_classes = ["OAuthTokensDO", "BillsDO"]
```

---

## ⚙️ Configuration Requirements

### 🔐 Environment Variables

#### Local Development (`.dev.vars`)

```env
# Existing
DISCORD_TOKEN=your_bot_token
DISCORD_PUBLIC_KEY=your_public_key
DISCORD_APPLICATION_ID=your_app_id
ALLOWED_USER_IDS=your_user_id
VERCEL_AI_GATEWAY_URL=https://your-gateway.com
AI_GATEWAY_API_KEY=your_api_key

# New (Phase 0)
GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxx
GOOGLE_REDIRECT_URI=https://billbot.YOUR-SUBDOMAIN.workers.dev/oauth/google/callback
```

#### Production (Wrangler Secrets)

```bash
wrangler secret put GOOGLE_CLIENT_ID
wrangler secret put GOOGLE_CLIENT_SECRET
wrangler secret put GOOGLE_REDIRECT_URI
```

### 🔑 OAuth Scopes

Required Gmail API scope:
- `https://www.googleapis.com/auth/gmail.readonly`

> 💡 **Why read-only?** We only need to search and read emails, not send/delete.

---

## 🏷️ Bill Identification Strategy

### Two-Stage Classification

#### Stage 1️⃣: Subject Line Pre-filtering *(Fast)*

```typescript
const ORIGIN_SUBJECT_KEYWORDS = {
  electricity: ['electricity', 'power', 'energy bill'],
  hot_water: ['hot water', 'gas', 'heating'],
  water: ['water bill', 'water usage'],
  internet: ['internet', 'broadband', 'nbn']
};

function categorizeBySubject(subject: string): BillType | null {
  const lower = subject.toLowerCase();
  for (const [type, keywords] of Object.entries(ORIGIN_SUBJECT_KEYWORDS)) {
    if (keywords.some(kw => lower.includes(kw))) {
      return type as BillType;
    }
  }
  return null; // Pass to Gemini for classification
}
```

#### Stage 2️⃣: Gemini PDF Validation *(Accurate)*

```
// Gemini prompt:
Analyze this Origin Energy bill PDF.

Extract:
1. Bill type: electricity | hot_water | water | internet
2. Total amount due (numeric, no currency symbol)
3. Issue date (when bill was generated, NOT due date)
4. Confidence score (0-1)

${subjectHint ? `Hint: Subject suggests ${subjectHint}` : ''}

Return as JSON matching schema.
```

#### Confidence Handling

| Confidence | Action |
|:----------:|--------|
| `< 0.7` | ⚠️ Log warning, skip bill |
| `≥ 0.7` | ✅ Store bill |
| Gemini fails | 🔄 Retry once, then skip |

---

## 💬 Response Format

### ✅ Success Response

```
📊 Bills for last 30 days:

⚡ Electricity: $128.45 (Jan 15)
🔥 Hot Water: $32.50 (Jan 10)
💧 Water: $45.20 (Jan 8)
🌐 Internet: $79.99 (Jan 12)

**Total:** $286.14
```

### 📭 No Bills Found

```
📊 No bills found in the last 30 days.
```

### 🔐 OAuth Required

```
❌ Your Gmail connection expired.
Please run `/bill connect` to re-authorize.
```

### ❌ Error Response

```
❌ An error occurred while scanning bills.
Please try again or use `/bill connect` to refresh your Gmail connection.
```

---

## ⚠️ Risks & Mitigations

| Risk | Impact | Probability | Mitigation |
|:-----|:------:|:-----------:|:-----------|
| CF Workflows immature/buggy | 🔴 High | 🟡 Medium | Fallback to Queues (Option 2) |
| Gmail API rate limits hit | 🟡 Medium | 🟢 Low | Exponential backoff, cache results in DO |
| OAuth token refresh fails | 🟡 Medium | 🟢 Low | Alert user, graceful degradation, retry logic |
| Gemini parsing inaccurate | 🟡 Medium | 🟢 Low | Two-stage classification, confidence threshold |
| Origin changes email format | 🟢 Low | 🟡 Medium | Easy config update in `billSenders.ts` |
| Subject line keywords change | 🟢 Low | 🟡 Medium | Gemini fallback handles this |
| PDF format unreadable | 🟢 Low | 🟢 Low | Skip with warning, log for debugging |
| Attachment >10MB | 🟢 Low | 🟢 Low | Skip large files, log warning |
| User Gmail 2FA blocks API | 🔴 High | 🟢 Low | OAuth flow handles 2FA automatically |
| Timezone DST issues | 🟢 Low | 🔴 High | Use timezone library for AEDT/AEST handling |

---

## ✅ Success Criteria

| Criteria | Status |
|:---------|:------:|
| User can authorize Gmail once via `/bill connect` | ☐ |
| Tokens auto-refresh without user intervention | ☐ |
| `/bill` command responds within 30s (deferred pattern) | ☐ |
| Correctly identifies all 4 bill types from Origin Energy | ☐ |
| Parses amount and issue date accurately (>95% accuracy) | ☐ |
| Downloads and processes PDF attachments | ☐ |
| Returns formatted text response in Discord | ☐ |
| Handles failures gracefully (retries, error messages) | ☐ |
| Works within Cloudflare Workers limits | ☐ |
| Stores bills in Durable Object for history | ☐ |
| Total cost <$5/month | ☐ |
| No manual intervention after initial OAuth setup | ☐ |

---

## 💰 Cost Estimate

### Monthly Costs (Personal Use)

| Service | Usage | Cost |
|:--------|:------|:----:|
| ☁️ Cloudflare Workers | ~100 requests/month | **Free** |
| ⚙️ Cloudflare Workflows | ~30 workflow executions | **Free** |
| 💾 Durable Objects | 3 DO instances, minimal storage | ~$0.50 |
| 📧 Gmail API | ~30 searches + ~100 downloads | **Free** |
| 🤖 Gemini 2.0 Flash Lite | ~30 PDF parses/month | <$0.30 |
| 💬 Discord API | Unlimited | **Free** |
| ☁️ Google Cloud | OAuth only | **Free** |

### 💵 Total: `~$0.80 - $5/month`

> ✨ Well within Cloudflare free tier!

### 📊 Cost Breakdown

```
┌─────────────────────────────────────────────────────────┐
│                   Monthly Cost Breakdown                 │
├─────────────────────────────────────────────────────────┤
│  Cloudflare Workers    │  Free (far below 100k/day)     │
│  DO requests           │  ~$0.15/1M × ~1k = negligible  │
│  DO storage            │  $0.20/GB × ~1MB = negligible  │
│  Gemini API            │  $0.01/100 req = ~$0.30/month  │
│  All other APIs        │  Free                          │
├─────────────────────────────────────────────────────────┤
│  TOTAL                 │  < $1/month                    │
└─────────────────────────────────────────────────────────┘
```

> 📈 **Scalability:** Even with daily scans (365/year), costs remain <$10/month

---

## 🔮 Future Enhancements

### Phase 8️⃣: Advanced Features *(Out of Scope for MVP)*

<table>
<tr>
<th>Feature</th>
<th>Description</th>
</tr>
<tr>
<td>

**📅 Date Range Parameter**

</td>
<td>

- `/bill <month>` - e.g., `/bill august`
- Custom date ranges

</td>
</tr>
<tr>
<td>

**📋 Bill Management**

</td>
<td>

- `/bill pay <type>` - Mark bill as paid
- `/bill history` - View all bills
- `/bill stats` - Monthly trends

</td>
</tr>
<tr>
<td>

**🔔 Notifications**

</td>
<td>

- Scheduled monthly summaries (Phase 7)
- Due date reminders
- Budget alerts

</td>
</tr>
<tr>
<td>

**🏢 Multi-Provider Support**

</td>
<td>

- Support multiple utility providers
- Categorize by provider

</td>
</tr>
<tr>
<td>

**📊 Export & Analytics**

</td>
<td>

- Export to CSV/Excel
- Yearly summaries
- Cost trends visualization

</td>
</tr>
<tr>
<td>

**🧠 AI Enhancements**

</td>
<td>

- Anomaly detection (unusual bill amounts)
- Cost predictions
- Savings recommendations

</td>
</tr>
</table>

---

## 📝 Summary

### 🏆 Recommended Approach

> **Cloudflare Workflows + Gmail API + Gemini AI**

### ✨ Key Benefits

| Benefit | Description |
|:-------:|:------------|
| ☁️ | 100% Cloudflare ecosystem (no external services) |
| 🔐 | One-time OAuth setup (tokens auto-refresh) |
| 🔄 | Durable execution with automatic retries |
| 📝 | Type-safe TypeScript throughout |
| 🤖 | Leverages existing Gemini integration |
| 💰 | Cost: ~$0.80-5/month |
| ⏱️ | 7-11 days implementation time |

### 📅 Implementation Timeline

```
Phase 0️⃣  Google Cloud Setup      ▓░░░░░░░░░░░░░░░░░░░  15-20 min
Phase 1️⃣  OAuth Foundation        ▓▓▓▓▓▓░░░░░░░░░░░░░░  1-2 days
Phase 2️⃣  Gmail Integration       ▓▓▓▓▓▓░░░░░░░░░░░░░░  1-2 days
Phase 3️⃣  Workflow                ▓▓▓▓▓▓▓▓▓░░░░░░░░░░░  2-3 days
Phase 4️⃣  Parsing                 ▓▓▓▓▓▓░░░░░░░░░░░░░░  1-2 days
Phase 5️⃣  Storage & Response      ▓▓▓░░░░░░░░░░░░░░░░░  1 day
Phase 6️⃣  Testing                 ▓▓▓░░░░░░░░░░░░░░░░░  1 day
Phase 7️⃣  Scheduled (Optional)    ░░░░░░░░░░░░░░░░░░░░  TBD
```

### 🚀 Next Steps

1. ✅ Review and approve this ADR
2. ⬜ Complete Phase 0 (Google Cloud setup)
3. ⬜ Begin Phase 1 (OAuth implementation)
4. ⬜ Iterate through phases 2-6
5. ⬜ Deploy to production

---

<div align="center">

**📄 End of ADR 001**

*Last updated: 2026-01-17*

</div>
