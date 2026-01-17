import { generateText } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import type { Message } from '../durable-objects/conversation';

export interface AIConfig {
  apiKey: string;
  model?: string;
}

export async function generateAIResponse(
  messages: Message[],
  config: AIConfig
): Promise<string> {
  const { apiKey, model = 'gemini-2.0-flash-exp' } = config;

  try {
    const google = createGoogleGenerativeAI({ apiKey });

    const result = await generateText({
      model: google(model),
      messages: messages.map((msg) => ({
        role: msg.role as 'user' | 'assistant' | 'system',
        content: msg.content,
      })),
      temperature: 0.7,
    });

    return result.text || 'Sorry, I could not generate a response.';
  } catch (error) {
    console.error('AI generation error:', error);
    throw new Error('Failed to generate AI response');
  }
}
