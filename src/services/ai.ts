import { generateText } from 'ai';
import { createGateway } from '@ai-sdk/gateway';
import type { Message } from '../durable-objects/conversation';

export interface AIConfig {
  apiKey: string;
  gatewayUrl: string;
  model?: string;
}

export async function generateAIResponse(
  messages: Message[],
  config: AIConfig
): Promise<string> {
  try {
    
    // Create the gateway provider with authentication
    // The SDK expects baseURL to point to /v1/ai by default
    const gateway = createGateway({
      apiKey: config.apiKey,
      // baseURL defaults to https://ai-gateway.vercel.sh/v1/ai
      // Only override if you need a different URL
    });

    const result = await generateText({
      model: gateway('google/gemini-2.0-flash-lite'),
      messages: messages.map((msg) => ({
        role: msg.role as 'user' | 'assistant' | 'system',
        content: msg.content,
      })),
      temperature: 0.7,
    });

    return result.text || 'Sorry, I could not generate a response.';
  } catch (error) {
    console.error('AI generation error:', error);
    if (error instanceof Error) {
      console.error('Error details:', error.message, error.stack);
    }
    throw error;
  }
}
