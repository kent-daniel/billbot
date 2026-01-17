# AI Discord Bot Template

A production-ready template for building AI Discord bots with Cloudflare Workers and Durable Objects. Features per-user conversation memory, secure authentication, and edge deployment.

## Stack

- **Cloudflare Workers** - Serverless edge compute
- **Durable Objects** - Persistent per-user conversation state
- **tRPC** - Type-safe API layer
- **Discord Webhooks** - Real-time message handling
- **AI Provider** - Pluggable AI gateway (Vercel, OpenAI, etc.)

## Architecture

```
Discord Webhook → Cloudflare Worker → tRPC Router → Durable Object (State)
                                    ↓
                               AI Provider
```

## Quick Start

### Prerequisites
- Node.js 20+
- Cloudflare account (free tier works)
- Discord Bot Token
- AI provider API key

### 1. Clone and Install

```bash
git clone <your-repo>
cd billbot
npm install
```

### 2. Create Discord Bot

1. Go to https://discord.com/developers/applications
2. Create New Application
3. Bot tab → Create bot → Copy **Bot Token**
4. General Information → Copy **Public Key** and **Application ID**
5. OAuth2 → URL Generator → Select `bot` + `Send Messages` permission
6. Use generated URL to add bot to your server

### 3. Configure Environment

Create `.dev.vars` for local development:

```env
DISCORD_TOKEN=your_bot_token
DISCORD_PUBLIC_KEY=your_public_key
DISCORD_APPLICATION_ID=your_app_id
ALLOWED_USER_IDS=your_user_id  # Get via Discord Developer Mode
VERCEL_AI_GATEWAY_URL=https://your-gateway.com
VERCEL_AI_API_KEY=your_api_key
```

### 4. Develop Locally

```bash
npm run dev
```

Use ngrok to test Discord webhooks:
```bash
ngrok http 8787
```

### 5. Deploy to Production

Set secrets in Cloudflare:
```bash
wrangler secret put DISCORD_TOKEN
wrangler secret put DISCORD_PUBLIC_KEY
wrangler secret put DISCORD_APPLICATION_ID
wrangler secret put ALLOWED_USER_IDS
wrangler secret put VERCEL_AI_GATEWAY_URL
wrangler secret put VERCEL_AI_API_KEY
```

Deploy:
```bash
npm run deploy
```

Set your Worker URL as Discord's Interactions Endpoint URL in Developer Portal.

## Project Structure

```
src/
├── index.ts                    # Worker entry point & Discord webhook handler
├── router.ts                   # tRPC procedures (chat.send, getHistory, clear)
├── durable-objects/
│   └── conversation.ts         # Per-user conversation state (50 msg limit)
├── services/
│   ├── discord.ts              # Webhook verification & message helpers
│   └── ai.ts                   # AI provider integration
└── types/
    └── discord.ts              # Discord type definitions
```

## How It Works

### 1. Discord sends webhook → Worker
```typescript
// index.ts
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Verify Discord signature
    if (!await verifyDiscordRequest(request, env.DISCORD_PUBLIC_KEY)) {
      return new Response('Invalid signature', { status: 401 });
    }
    // Route to handler
  }
}
```

### 2. Worker → tRPC → Durable Object
```typescript
// router.ts
const caller = createCaller({ env, userId });
const result = await caller.chat.send({ message: 'Hello' });
```

### 3. Durable Object manages state
```typescript
// conversation.ts
export class ConversationDO {
  async fetch(request: Request) {
    const { action } = await request.json();
    switch (action) {
      case 'add': // Store message
      case 'getHistory': // Retrieve history
      case 'clear': // Clear history
    }
  }
}
```

### 4. Response → AI → Discord
```typescript
// Generate AI response with conversation history
const aiResponse = await generateAIResponse(messages, config);

// Send back to Discord
await sendDiscordMessage(channelId, aiResponse, token);
```

## Key Features

### Durable Objects for State
Each user gets their own Durable Object instance with persistent conversation history:
```typescript
const id = env.CONVERSATIONS.idFromName(userId);
const stub = env.CONVERSATIONS.get(id);
```

## Customization

### Change AI Provider

Edit `src/services/ai.ts`:
```typescript
export async function generateAIResponse(
  messages: Message[],
  config: { apiKey: string }
): Promise<string> {
  // Replace with your AI provider
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'gpt-4',
      messages
    })
  });
  // ...
}
```

### Adjust Message Limit

In `src/durable-objects/conversation.ts`:
```typescript
private readonly MAX_MESSAGES = 50; // Change this
```

### Add New Commands

In `src/router.ts`:
```typescript
export const appRouter = router({
  chat: router({
    send: publicProcedure.mutation(...),
    getHistory: publicProcedure.query(...),
    clearHistory: publicProcedure.mutation(...),
    
    // Add your own:
    summarize: publicProcedure.mutation(async ({ ctx }) => {
      // Your logic
    }),
  }),
});
```

## CI/CD (Optional)

Set GitHub secrets:
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

Auto-deploys on push to main via `.github/workflows/deploy.yml`.

## Troubleshooting

**Bot doesn't respond:**
```bash
wrangler tail  # Check logs
```

**Signature verification fails:**
- Verify `DISCORD_PUBLIC_KEY` is correct
- Check Discord webhook settings

**AI fails:**
- Check API key and endpoint
- View Worker logs for errors

## Cost

Free tier covers most personal use:
- Cloudflare Workers: 100k requests/day
- Durable Objects: 1GB storage
- Pay only if you exceed limits

## License

MIT
