import type { Message } from '../durable-objects/conversation';

export interface AIConfig {
  gatewayUrl: string;
  apiKey: string;
  model?: string;
}

export async function generateAIResponse(
  messages: Message[],
  config: AIConfig
): Promise<string> {
  const { gatewayUrl, apiKey, model = 'gpt-3.5-turbo' } = config;

  // Format messages for the AI model
  const formattedMessages = messages.map((msg) => ({
    role: msg.role,
    content: msg.content,
  }));

  // Add system message if not present
  if (!formattedMessages.some((msg) => msg.role === 'system')) {
    formattedMessages.unshift({
      role: 'system',
      content: 'You are a helpful AI assistant in a Discord chat.',
    });
  }

  try {
    // Use Vercel AI Gateway with standard OpenAI-compatible API
    const response = await fetch(gatewayUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model,
        messages: formattedMessages,
        max_tokens: 1000,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`AI API error: ${error}`);
    }

    const data = await response.json<{
      choices: Array<{
        message: {
          content: string;
        };
      }>;
    }>();

    return data.choices[0]?.message?.content || 'Sorry, I could not generate a response.';
  } catch (error) {
    console.error('AI generation error:', error);
    throw new Error('Failed to generate AI response');
  }
}
