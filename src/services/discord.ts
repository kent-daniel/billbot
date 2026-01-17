import { verifyKey } from 'discord-interactions';
import type { BillWithMessageId } from '../types/bills';

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

/**
 * Format bill summary for Discord response
 * Phase 5 - Discord Response Formatter
 */
export function formatBillSummary(bills: BillWithMessageId[]): string {
  if (bills.length === 0) {
    return '📊 No bills found in the last 30 days.';
  }

  // Group bills by type and get the most recent of each type
  const billsByType: Record<string, BillWithMessageId> = {};
  
  bills.forEach((bill) => {
    const existing = billsByType[bill.type];
    if (!existing || new Date(bill.issue_date) > new Date(existing.issue_date)) {
      billsByType[bill.type] = bill;
    }
  });

  const lines: string[] = [];
  lines.push('📊 **Bills for last 30 days:**\n');

  // Add each bill type with emoji
  const emojiMap = {
    electricity: '⚡',
    hot_water: '🔥',
    water: '💧',
    internet: '🌐',
  };

  const typeLabels = {
    electricity: 'Electricity',
    hot_water: 'Hot Water',
    water: 'Water',
    internet: 'Internet',
  };

  // Order: electricity, hot_water, water, internet
  const orderedTypes = ['electricity', 'hot_water', 'water', 'internet'] as const;

  orderedTypes.forEach((type) => {
    const bill = billsByType[type];
    if (bill) {
      const emoji = emojiMap[type];
      const label = typeLabels[type];
      const amount = bill.amount.toFixed(2);
      const date = formatDate(bill.issue_date);
      const gmailLink = `https://mail.google.com/mail/u/0/#inbox/${bill.gmail_message_id}`;
      lines.push(`${emoji} ${label}: $${amount} (${date}) • [View Email](${gmailLink})`);
    }
  });

  // Calculate total
  const total = Object.values(billsByType).reduce((sum, bill) => sum + bill.amount, 0);
  lines.push(`\n**Total:** $${total.toFixed(2)}`);

  return lines.join('\n');
}

/**
 * Format date to readable format (e.g., "Jan 15")
 */
export function formatDate(isoDate: string): string {
  const date = new Date(isoDate);
  return date.toLocaleDateString('en-AU', {
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Format error response for Discord
 */
export function formatErrorResponse(error: Error): string {
  const message = error.message.toLowerCase();

  if (message.includes('oauth') || message.includes('token') || message.includes('unauthorized')) {
    return '❌ Your Gmail connection expired. Please run `/bill connect` to re-authorize.';
  }

  if (message.includes('rate limit')) {
    return '⏳ Gmail API rate limit reached. Please try again in a few minutes.';
  }

  return `❌ An error occurred: ${error.message}\n\nPlease try again or contact support.`;
}
