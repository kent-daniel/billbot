import { initTRPC } from '@trpc/server';
import { z } from 'zod';
import type { Message } from './durable-objects/conversation';
import { generateAIResponse } from './services/ai';

export interface Context {
  env: Env;
  userId: string;
}

export interface Env {
  CONVERSATIONS: DurableObjectNamespace;
  DISCORD_TOKEN: string;
  DISCORD_PUBLIC_KEY: string;
  DISCORD_APPLICATION_ID: string;
  GEMINI_API_KEY: string;
  ALLOWED_USER_IDS: string;
}

const t = initTRPC.context<Context>().create();

const router = t.router;
const publicProcedure = t.procedure;

export const appRouter = router({
  chat: router({
    send: publicProcedure
      .input(
        z.object({
          message: z.string().min(1).max(2000),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { message } = input;
        const { env, userId } = ctx;

        // Get or create Durable Object for this user
        const id = env.CONVERSATIONS.idFromName(userId);
        const stub = env.CONVERSATIONS.get(id);

        // Add user message to history
        await stub.fetch('https://internal', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'add',
            role: 'user',
            content: message,
            userId,
          }),
        });

        // Get conversation history
        const historyResponse = await stub.fetch('https://internal', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'getHistory' }),
        });
        const { messages } = await historyResponse.json<{ messages: Message[] }>();

        // Generate AI response
        const aiResponse = await generateAIResponse(messages, {
          apiKey: env.GEMINI_API_KEY,
        });

        // Store AI response in history
        await stub.fetch('https://internal', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'add',
            role: 'assistant',
            content: aiResponse,
            userId,
          }),
        });

        return { response: aiResponse };
      }),

    getHistory: publicProcedure.query(async ({ ctx }) => {
      const { env, userId } = ctx;

      const id = env.CONVERSATIONS.idFromName(userId);
      const stub = env.CONVERSATIONS.get(id);

      const response = await stub.fetch('https://internal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'getHistory' }),
      });
      const { messages } = await response.json<{ messages: Message[] }>();

      return { messages };
    }),

    clearHistory: publicProcedure.mutation(async ({ ctx }) => {
      const { env, userId } = ctx;

      const id = env.CONVERSATIONS.idFromName(userId);
      const stub = env.CONVERSATIONS.get(id);

      await stub.fetch('https://internal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'clear' }),
      });

      return { success: true };
    }),
  }),
});

export type AppRouter = typeof appRouter;

export const createCaller = t.createCallerFactory(appRouter);
