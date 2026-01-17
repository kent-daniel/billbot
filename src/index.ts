import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { appRouter, createCaller, type Env, type Context } from './router';
import { ConversationDO } from './durable-objects/conversation';
import { verifyDiscordRequest, sendDiscordMessage, formatErrorMessage } from './services/discord';
import { DiscordInteractionType, type DiscordMessage } from './types/discord';

export { ConversationDO };

async function handleDiscordWebhook(request: Request, env: Env): Promise<Response> {
  // SECURITY LAYER 1: Verify Discord signature
  const isValidSignature = await verifyDiscordRequest(request, env.DISCORD_PUBLIC_KEY);
  
  if (!isValidSignature) {
    console.error('Invalid Discord signature');
    return new Response('Invalid signature', { status: 401 });
  }

  // Parse the Discord payload
  const body = await request.json<any>();

  // Handle Discord PING (required for webhook verification)
  if (body.type === DiscordInteractionType.PING) {
    return new Response(JSON.stringify({ type: 1 }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Handle MESSAGE_CREATE events
  if (body.t === 'MESSAGE_CREATE') {
    const message = body.d as DiscordMessage;

    // Ignore bot messages
    if (message.author.bot) {
      return new Response('OK', { status: 200 });
    }

    // SECURITY LAYER 2: Check user whitelist
    const allowedUserIds = env.ALLOWED_USER_IDS.split(',').map(id => id.trim());
    if (!allowedUserIds.includes(message.author.id)) {
      console.log(`Unauthorized user attempted to use bot: ${message.author.id}`);
      return new Response('OK', { status: 200 }); // Silently ignore
    }

    // Process the message via tRPC
    try {
      const caller = createCaller({
        env,
        userId: message.author.id,
      });

      const result = await caller.chat.send({ message: message.content });

      // Send AI response back to Discord
      await sendDiscordMessage(message.channel_id, result.response, env.DISCORD_TOKEN);

      return new Response('OK', { status: 200 });
    } catch (error) {
      console.error('Error processing message:', error);

      // Send error message to Discord
      const errorMsg = formatErrorMessage(error);
      try {
        await sendDiscordMessage(message.channel_id, errorMsg, env.DISCORD_TOKEN);
      } catch (sendError) {
        console.error('Failed to send error message to Discord:', sendError);
      }

      return new Response('Error processed', { status: 200 });
    }
  }

  return new Response('Event not handled', { status: 200 });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Discord webhook endpoint
    if (url.pathname === '/' && request.method === 'POST') {
      return handleDiscordWebhook(request, env);
    }

    // Health check endpoint
    if (url.pathname === '/health') {
      return new Response('OK', { status: 200 });
    }

    return new Response('Not found', { status: 404 });
  },
};
