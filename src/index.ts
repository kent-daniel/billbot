import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { appRouter, createCaller, type Env, type Context } from './router';
import { ConversationDO } from './durable-objects/conversation';
import { verifyDiscordRequest, sendDiscordMessage, formatErrorMessage } from './services/discord';
import { DiscordInteractionType, type DiscordMessage } from './types/discord';

export { ConversationDO };

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
