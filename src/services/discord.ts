import { verifyKey } from 'discord-interactions';

export interface DiscordService {
  verifyRequest: (request: Request, publicKey: string) => Promise<boolean>;
  sendMessage: (channelId: string, content: string, token: string) => Promise<void>;
}

export async function verifyDiscordRequest(
  body: string,
  signature: string,
  timestamp: string,
  publicKey: string
): Promise<boolean> {
  try {
    return await verifyKey(body, signature, timestamp, publicKey);
  } catch (error) {
    console.error('Discord signature verification failed:', error);
    return false;
  }
}

export async function sendDiscordMessage(
  channelId: string,
  content: string,
  token: string
): Promise<void> {
  const url = `https://discord.com/api/v10/channels/${channelId}/messages`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bot ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ content }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to send Discord message: ${error}`);
  }
}

export function formatErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return `Error: ${error.message}`;
  }
  return 'An unexpected error occurred. Please try again.';
}
