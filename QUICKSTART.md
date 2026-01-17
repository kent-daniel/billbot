# Quick Start Guide

## Your bot is ready! Here's what to do next:

### 1. Get your credentials ready

You'll need:
- Discord Bot Token (from Discord Developer Portal)
- Discord Public Key (from Discord Developer Portal)
- Discord Application ID (from Discord Developer Portal)
- Your Discord User ID (right-click your username in Discord)
- Vercel AI Gateway URL
- Vercel AI Gateway API Key

### 2. Set up for local development

```bash
# Copy the example env file
cp .env.example .dev.vars

# Edit .dev.vars and fill in your credentials
# Then run:
npm run dev
```

### 3. Deploy to production

```bash
# Set all your secrets in Cloudflare
wrangler secret put DISCORD_TOKEN
wrangler secret put DISCORD_PUBLIC_KEY
wrangler secret put DISCORD_APPLICATION_ID
wrangler secret put ALLOWED_USER_IDS
wrangler secret put VERCEL_AI_GATEWAY_URL
wrangler secret put VERCEL_AI_API_KEY

# Deploy!
npm run deploy
```

### 4. Configure Discord

1. Copy your Worker URL after deploying
2. Go to Discord Developer Portal > Your App > General Information
3. Set "Interactions Endpoint URL" to your Worker URL
4. Discord will verify with a PING request

### 5. Set up GitHub Actions (optional)

Add these secrets to your GitHub repository:
- CLOUDFLARE_API_TOKEN
- CLOUDFLARE_ACCOUNT_ID

Then every push to main will auto-deploy!

## Architecture Overview

```
Your Message → Discord → Cloudflare Worker
                            ↓ (verifies signature)
                            ↓ (checks user whitelist)
                        tRPC Router
                            ↓
                    Durable Object (memory)
                            ↓
                    Vercel AI Gateway
                            ↓
                    Response → Discord → You
```

## Security Features

✅ Discord Ed25519 signature verification (cryptographically secure)
✅ User ID whitelist (personal bot restriction)
✅ Even with public Worker URL, cannot be exploited

## What it does

- Stores last 50 messages per user in Durable Objects
- Sends conversation context to AI for coherent responses
- Type-safe API with tRPC (internal only)
- Sends errors back to Discord if something fails
- Auto-prunes old messages to stay within limits

## Commands to know

```bash
npm run dev          # Local development
npm run deploy       # Deploy to Cloudflare
npm run type-check   # Check for TypeScript errors
wrangler tail        # View live logs
```

## Need help?

Check README.md for full documentation and troubleshooting!
