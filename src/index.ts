import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { appRouter, createCaller, type Env, type Context } from './router';
import { ConversationDO } from './durable-objects/conversation';
import { OAuthTokensDO } from './durable-objects/oauthTokens';
import { verifyDiscordRequest, sendDiscordMessage, formatErrorMessage } from './services/discord';
import { DiscordInteractionType, type DiscordMessage } from './types/discord';
import { Google } from 'arctic';

export { ConversationDO, OAuthTokensDO };

async function handleDiscordWebhook(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  // SECURITY LAYER 1: Verify Discord signature
  const signature = request.headers.get('X-Signature-Ed25519');
  const timestamp = request.headers.get('X-Signature-Timestamp');
  const bodyText = await request.text();
  
  if (!signature || !timestamp) {
    console.error('Missing Discord signature headers');
    return new Response('Invalid signature', { status: 401 });
  }

  const isValidSignature = await verifyDiscordRequest(bodyText, signature, timestamp, env.DISCORD_PUBLIC_KEY);
  
  if (!isValidSignature) {
    console.error('Invalid Discord signature');
    return new Response('Invalid signature', { status: 401 });
  }

  // Parse the Discord payload
  const body = JSON.parse(bodyText);

  // Handle Discord PING (required for webhook verification)
  if (body.type === DiscordInteractionType.PING) {
    return new Response(JSON.stringify({ type: 1 }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Handle Application Commands (Slash Commands)
  if (body.type === DiscordInteractionType.APPLICATION_COMMAND) {
    const interaction = body;
    const userId = interaction.member?.user?.id || interaction.user?.id;
    const commandName = interaction.data?.name;

    if (!userId) {
      return new Response(JSON.stringify({
        type: 4,
        data: { content: 'Unable to identify user.', flags: 64 }
      }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // SECURITY LAYER 2: Check user whitelist
    const allowedUserIds = env.ALLOWED_USER_IDS.split(',').map(id => id.trim());
    if (!allowedUserIds.includes(userId)) {
      console.log(`Unauthorized user attempted to use bot: ${userId}`);
      return new Response(JSON.stringify({
        type: 4,
        data: { content: 'You are not authorized to use this bot.', flags: 64 }
      }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Handle /chat command
    if (commandName === 'chat') {
      const message = interaction.data?.options?.find((opt: any) => opt.name === 'message')?.value;

      if (!message) {
        return new Response(JSON.stringify({
          type: 4,
          data: { content: 'Please provide a message.', flags: 64 }
        }), {
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Send deferred response immediately (thinking...)
      const deferredResponse = new Response(JSON.stringify({
        type: 5, // DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE
      }), {
        headers: { 'Content-Type': 'application/json' },
      });

      // Process AI request in background (don't await)
      ctx.waitUntil((async () => {
        try {
          const caller = createCaller({
            env,
            userId,
          });

          const result = await caller.chat.send({ message: message as string });

          // Send follow-up message with AI response
          const followUpUrl = `https://discord.com/api/v10/webhooks/${env.DISCORD_APPLICATION_ID}/${interaction.token}`;
          await fetch(followUpUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: result.response }),
          });
        } catch (error) {
          console.error('Error processing command:', error);
          const errorMsg = formatErrorMessage(error);
          
          // Send error as follow-up
          const followUpUrl = `https://discord.com/api/v10/webhooks/${env.DISCORD_APPLICATION_ID}/${interaction.token}`;
          await fetch(followUpUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: errorMsg }),
          });
        }
      })());

      return deferredResponse;
    }

    // Handle /clear command
    if (commandName === 'clear') {
      try {
        const caller = createCaller({
          env,
          userId,
        });

        await caller.chat.clearHistory();

        return new Response(JSON.stringify({
          type: 4,
          data: { content: 'Conversation history cleared!', flags: 64 }
        }), {
          headers: { 'Content-Type': 'application/json' },
        });
      } catch (error) {
        console.error('Error clearing history:', error);
        const errorMsg = formatErrorMessage(error);
        
        return new Response(JSON.stringify({
          type: 4,
          data: { content: errorMsg, flags: 64 }
        }), {
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    // Handle /bill command
    if (commandName === 'bill') {
      const subcommand = interaction.data?.options?.[0]?.name;
      
      // Handle /bill connect subcommand
      if (subcommand === 'connect') {
        try {
          // Generate OAuth URL with PKCE
          const google = new Google(
            env.GOOGLE_CLIENT_ID,
            env.GOOGLE_CLIENT_SECRET,
            env.GOOGLE_REDIRECT_URI
          );
          
          // Use userId as state for verification
          const state = `${userId}:${Date.now()}`;
          
          // Generate code verifier for PKCE (simplified - in production, store this securely)
          const codeVerifier = crypto.randomUUID() + crypto.randomUUID();
          
          // For now, we'll pass the code verifier in state (not ideal, but works for PoC)
          // In production, store in a separate state DO
          const stateWithVerifier = btoa(JSON.stringify({ userId, timestamp: Date.now(), codeVerifier }));
          
          const scopes = ['https://www.googleapis.com/auth/gmail.readonly'];
          
          // Arctic requires state, codeVerifier, and scopes
          const authUrl = google.createAuthorizationURL(stateWithVerifier, codeVerifier, scopes);
          
          // Add access_type=offline and prompt=consent to force refresh token
          authUrl.searchParams.set('access_type', 'offline');
          authUrl.searchParams.set('prompt', 'consent');
          
          // Send ephemeral message with OAuth link
          return new Response(JSON.stringify({
            type: 4,
            data: { 
              content: `🔐 **Connect Your Gmail Account**\n\nClick the link below to authorize BillBot to read your Gmail for Origin Energy bills:\n\n[Authorize Gmail Access](${authUrl.toString()})\n\n*This is a one-time setup. Your tokens will be stored securely and auto-refresh.*`,
              flags: 64 // Ephemeral
            }
          }), {
            headers: { 'Content-Type': 'application/json' },
          });
        } catch (error) {
          console.error('Error generating OAuth URL:', error);
          const errorMsg = formatErrorMessage(error);
          
          return new Response(JSON.stringify({
            type: 4,
            data: { content: `❌ Failed to generate authorization link: ${errorMsg}`, flags: 64 }
          }), {
            headers: { 'Content-Type': 'application/json' },
          });
        }
      }
      
      // Handle /bill search subcommand
      if (subcommand === 'search') {
        return new Response(JSON.stringify({
          type: 4,
          data: { 
            content: '📊 **Bill Search - Coming Soon**\n\nBill search functionality will be implemented in Phase 3 (Cloudflare Workflows).\n\nFor now:\n1. Use `/bill connect` to authorize your Gmail account\n2. Phase 3 will add automatic bill scanning and parsing\n3. Phase 4 will add AI-powered bill classification',
            flags: 64
          }
        }), {
          headers: { 'Content-Type': 'application/json' },
        });
      }
      
      // Handle /bill (without subcommand - shouldn't happen with Discord's UI but handle it)
      if (!subcommand) {
        return new Response(JSON.stringify({
          type: 4,
          data: { 
            content: '📊 Please use a subcommand:\n• `/bill connect` - Connect Gmail account\n• `/bill search` - Search for bills (coming soon)',
            flags: 64
          }
        }), {
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    return new Response(JSON.stringify({
      type: 4,
      data: { content: 'Unknown command.', flags: 64 }
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response('Event not handled', { status: 200 });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // OAuth callback endpoint
    if (url.pathname === '/oauth/google/callback') {
      return handleOAuthCallback(request, env);
    }

    // Discord webhook endpoint
    if (url.pathname === '/' && request.method === 'POST') {
      return handleDiscordWebhook(request, env, ctx);
    }

    // Health check endpoint
    if (url.pathname === '/health') {
      return new Response('OK', { status: 200 });
    }

    return new Response('Not found', { status: 404 });
  },
};

/**
 * Handle OAuth callback from Google
 */
async function handleOAuthCallback(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const stateParam = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  // Check for OAuth errors
  if (error) {
    return new Response(
      `<!DOCTYPE html>
      <html>
      <head><title>Authorization Failed</title></head>
      <body>
        <h1>❌ Authorization Failed</h1>
        <p>Error: ${error}</p>
        <p>You can close this window.</p>
      </body>
      </html>`,
      { 
        status: 400,
        headers: { 'Content-Type': 'text/html' }
      }
    );
  }

  if (!code || !stateParam) {
    return new Response(
      `<!DOCTYPE html>
      <html>
      <head><title>Invalid Request</title></head>
      <body>
        <h1>❌ Invalid OAuth Callback</h1>
        <p>Missing required parameters (code or state).</p>
        <p>You can close this window.</p>
      </body>
      </html>`,
      { 
        status: 400,
        headers: { 'Content-Type': 'text/html' }
      }
    );
  }

  try {
    // Decode state to get userId and codeVerifier
    const state = JSON.parse(atob(stateParam));
    const { userId, codeVerifier } = state;

    if (!userId || !codeVerifier) {
      throw new Error('Invalid state parameter');
    }

    // Exchange code for tokens using Arctic
    const google = new Google(
      env.GOOGLE_CLIENT_ID,
      env.GOOGLE_CLIENT_SECRET,
      env.GOOGLE_REDIRECT_URI
    );

    const tokens = await google.validateAuthorizationCode(code, codeVerifier);

    // Check if refresh token exists
    if (!tokens.hasRefreshToken()) {
      console.error('No refresh token returned from Google');
      throw new Error('No refresh token received. This can happen if you previously authorized this app. Please revoke access at https://myaccount.google.com/permissions and try again.');
    }

    const accessToken = tokens.accessToken();
    const refreshToken = tokens.refreshToken();
    const expiresIn = tokens.accessTokenExpiresInSeconds() || 3600;

    console.log('OAuth tokens received:', {
      hasAccessToken: !!accessToken,
      hasRefreshToken: !!refreshToken,
      expiresIn,
      userId
    });

    // Store tokens in OAuthTokensDO
    const tokensDOId = env.OAUTH_TOKENS.idFromName(userId);
    const tokensStub = env.OAUTH_TOKENS.get(tokensDOId);

    await tokensStub.fetch('https://internal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'store',
        accessToken,
        refreshToken,
        expiresIn,
        userId,
      }),
    });

    // Return success page
    return new Response(
      `<!DOCTYPE html>
      <html>
      <head>
        <title>Authorization Successful</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          }
          .container {
            background: white;
            padding: 40px;
            border-radius: 10px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.2);
            text-align: center;
            max-width: 500px;
          }
          h1 { color: #4CAF50; margin-bottom: 20px; }
          p { color: #666; line-height: 1.6; }
          .success-icon { font-size: 60px; margin-bottom: 20px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="success-icon">✅</div>
          <h1>Authorization Successful!</h1>
          <p>Your Gmail account has been successfully connected to BillBot.</p>
          <p>You can now use the <code>/bill</code> command in Discord to search for Origin Energy bills.</p>
          <p><strong>You can close this window.</strong></p>
        </div>
      </body>
      </html>`,
      {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      }
    );
  } catch (error) {
    console.error('OAuth callback error:', error);
    
    return new Response(
      `<!DOCTYPE html>
      <html>
      <head><title>Authorization Error</title></head>
      <body>
        <h1>❌ Authorization Error</h1>
        <p>An error occurred while processing your authorization:</p>
        <p><code>${error instanceof Error ? error.message : String(error)}</code></p>
        <p>Please try again by running <code>/bill connect</code> in Discord.</p>
        <p>You can close this window.</p>
      </body>
      </html>`,
      {
        status: 500,
        headers: { 'Content-Type': 'text/html' },
      }
    );
  }
}
