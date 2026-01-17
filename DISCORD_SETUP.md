# Discord Bot Setup Guide

Complete guide to setting up your AI Discord bot with Cloudflare Workers, Durable Objects, and Gemini 2.0 Flash.

## Prerequisites

- Node.js 20+
- Cloudflare account (free tier works)
- Google account (for Gemini API key)
- Discord account

---

## Step 1: Create Discord Bot Application

1. Go to https://discord.com/developers/applications
2. Click **"New Application"**
3. Give it a name (e.g., "BillBot") and click **"Create"**

### Get Your Credentials

From the **General Information** page:
- Copy your **APPLICATION ID**
- Copy your **PUBLIC KEY**

From the **Bot** page:
- Click **"Add Bot"** (if not created yet)
- Click **"Reset Token"** and copy your **BOT TOKEN**
- ⚠️ **Save this token immediately** - you can only see it once!

### Add Bot to Your Server

1. Go to **OAuth2** → **URL Generator**
2. Select scopes:
   - ☑️ `bot`
3. Select bot permissions:
   - ☑️ `View Channels`
   - ☑️ `Send Messages`
4. Copy the generated URL and open it in your browser
5. Select your server and authorize

---

## Step 2: Get Your Discord User ID

1. Open Discord → **User Settings** → **Advanced**
2. Enable **Developer Mode**
3. Right-click your username anywhere and select **"Copy User ID"**

---

## Step 3: Get Gemini API Key

1. Go to https://aistudio.google.com/apikey
2. Sign in with your Google account
3. Click **"Create API Key"** or **"Get API Key"**
4. Copy the API key

---

## Step 4: Configure Environment Variables

Create a `.env` file in your project root:

```env
# Discord Bot Configuration
DISCORD_TOKEN=your_bot_token_here
DISCORD_PUBLIC_KEY=your_public_key_here
DISCORD_APPLICATION_ID=your_application_id_here

# Security - Comma-separated list of Discord user IDs allowed to use the bot
ALLOWED_USER_IDS=your_discord_user_id_here

# AI Configuration
GEMINI_API_KEY=your_gemini_api_key_here
```

For local development, also create `.dev.vars` with the same content.

---

## Step 5: Install Dependencies

```bash
npm install
```

---

## Step 6: Register Slash Commands

```bash
node register-commands.js
```

This registers two commands:
- `/chat` - Chat with the AI bot
- `/clear` - Clear your conversation history

---

## Step 7: Deploy to Cloudflare

### Set Secrets

```bash
echo "your_bot_token" | npx wrangler secret put DISCORD_TOKEN
echo "your_public_key" | npx wrangler secret put DISCORD_PUBLIC_KEY
echo "your_application_id" | npx wrangler secret put DISCORD_APPLICATION_ID
echo "your_user_id" | npx wrangler secret put ALLOWED_USER_IDS
echo "your_gemini_api_key" | npx wrangler secret put GEMINI_API_KEY
```

### Deploy

```bash
npm run deploy
```

After deployment, you'll get a URL like: `https://billbot.outwork.workers.dev`

---

## Step 8: Configure Discord Interactions Endpoint

1. Go to Discord Developer Portal → Your App → **General Information**
2. Scroll to **"Interactions Endpoint URL"**
3. Paste your Cloudflare Worker URL: `https://your-worker.workers.dev`
4. Click **"Save Changes"**
5. Discord will verify the endpoint (should succeed automatically)

---

## Step 9: Test Your Bot

Go to your Discord server and try:

```
/chat message: Hello!
```

The bot will:
1. Show "Bot is thinking..."
2. Respond with an AI-generated message from Gemini 2.0 Flash

---

## Available Commands

- **`/chat message:`** - Send a message to the AI bot. The bot remembers the last 50 messages for context.
- **`/clear`** - Clear your conversation history with the bot.

---

## Architecture

```
Discord User → Slash Command
     ↓
Discord API → Cloudflare Worker (validates signature)
     ↓
Durable Object (stores conversation history)
     ↓
Vercel AI SDK → Gemini 2.0 Flash
     ↓
Response → Discord User
```

### Key Features

- **Interactions-based**: Uses Discord Interactions (webhooks), not Gateway events
- **Stateless Worker**: Cloudflare Worker handles HTTP requests only
- **Stateful Storage**: Durable Objects store per-user conversation history
- **Secure**: Ed25519 signature verification + user whitelist
- **Fast**: Edge deployment with Cloudflare Workers
- **Free**: Gemini 2.0 Flash is free, Cloudflare free tier covers most personal use

---

## Important Notes

### Bot Won't Show as "Online"

This is **normal** for Interactions-based bots. The bot doesn't maintain a persistent connection to Discord. It only responds to slash commands.

### Only Whitelisted Users Can Use It

Only Discord user IDs in `ALLOWED_USER_IDS` can use the bot. Others will get an "unauthorized" message.

### Conversation Memory

The bot stores the last 50 messages per user in Durable Objects. This provides conversation context for better AI responses.

---

## Troubleshooting

### Bot doesn't respond

Check logs:
```bash
npx wrangler tail
```

### "The specified interactions endpoint URL could not be verified"

- Make sure your Worker is deployed
- Verify `DISCORD_PUBLIC_KEY` is set correctly
- Check that your Worker URL is correct

### AI generation errors

- Verify your Gemini API key is valid
- Check that `GEMINI_API_KEY` secret is set in Cloudflare
- View Worker logs for detailed error messages

---

## Cost

**Free tier covers most personal use:**
- Cloudflare Workers: 100k requests/day free
- Durable Objects: 1GB storage free
- Gemini 2.0 Flash: Free tier available
- Pay only if you exceed limits

---

## Updating the Bot

To deploy changes:

```bash
npm run deploy
```

To update slash commands:

```bash
node register-commands.js
npm run deploy
```

---

## Security Features

✅ **Discord Ed25519 signature verification** - Cryptographically secure  
✅ **User ID whitelist** - Only authorized users can interact  
✅ **No message content intent needed** - Uses Interactions, not Gateway  
✅ **Secure secrets** - Environment variables stored in Cloudflare

Even with a public Worker URL, unauthorized users cannot use your bot.

---

## Tech Stack

- **Cloudflare Workers** - Serverless edge compute
- **Durable Objects** - Persistent per-user conversation state
- **tRPC** - Type-safe API layer (internal)
- **Discord Interactions** - Webhook-based bot architecture
- **Vercel AI SDK** - AI provider abstraction
- **Gemini 2.0 Flash** - Fast, free AI model

---

## Support

For issues or questions:
- Check the logs: `npx wrangler tail`
- Review Discord bot setup in Developer Portal
- Verify all secrets are set correctly in Cloudflare

---

## License

MIT
