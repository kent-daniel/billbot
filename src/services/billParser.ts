/**
 * Bill Parser Service with Gemini AI
 * Phase 4 - Bill Parsing Implementation
 */

import { generateObject } from 'ai';
import { createGateway } from '@ai-sdk/gateway';
import { ParsedBillSchema, type BillType, type ParsedBill } from '../types/bills';
import type { GmailAttachment } from './gmail';

export class BillParserError extends Error {
  constructor(
    message: string,
    public cause?: unknown
  ) {
    super(message);
    this.name = 'BillParserError';
  }
}

const CONFIDENCE_THRESHOLD = 0.7;
const MAX_RETRIES = 1;

export interface BillParserConfig {
  apiKey: string;
  gatewayUrl?: string;
}

/**
 * Parse a bill PDF using Gemini AI
 * @param pdf - PDF attachment data
 * @param subjectHint - Optional bill type hint from subject line
 * @param config - AI gateway configuration
 * @returns Parsed bill information
 * @throws BillParserError if parsing fails or confidence is too low
 */
export async function parseBillWithGemini(
  pdf: GmailAttachment,
  subjectHint: BillType | undefined,
  config: BillParserConfig
): Promise<ParsedBill> {
  let lastError: Error | undefined;

  // Create the gateway provider with authentication
  const gateway = createGateway({
    apiKey: config.apiKey,
  });

  // Retry once on failure
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await generateObject({
        model: gateway('google/gemini-2.0-flash'),
        schema: ParsedBillSchema,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: buildPrompt(subjectHint),
              },
              {
                type: 'file' as const,
                data: `data:${pdf.mimeType};base64,${pdf.data}`,
                mediaType: pdf.mimeType,
              },
            ],
          },
        ],
        temperature: 0.1, // Low temperature for accuracy
      });

      const parsedBill = result.object;

      // Validate confidence threshold
      if (parsedBill.confidence < CONFIDENCE_THRESHOLD) {
        throw new BillParserError(
          `Low confidence score: ${parsedBill.confidence} (threshold: ${CONFIDENCE_THRESHOLD})`
        );
      }

      console.log(
        `Successfully parsed ${parsedBill.type} bill: $${parsedBill.amount} (confidence: ${parsedBill.confidence})`
      );

      return parsedBill;
    } catch (error) {
      lastError =
        error instanceof Error ? error : new Error('Unknown parsing error');
      console.error(`Parsing attempt ${attempt + 1} failed:`, error);

      if (attempt < MAX_RETRIES) {
        // Wait before retry
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  }

  throw new BillParserError(
    `Failed to parse bill after ${MAX_RETRIES + 1} attempts`,
    lastError
  );
}

/**
 * Build the prompt for Gemini
 */
function buildPrompt(subjectHint?: BillType): string {
  let prompt = `Analyze this Origin Energy bill PDF and extract the following information:

1. **Bill Type**: Identify whether this is an:
   - electricity bill
   - hot_water (gas/heating) bill
   - water bill
   - internet (broadband/NBN) bill

2. **Amount**: Extract the total amount due (numeric value only, no currency symbol)

3. **Issue Date**: Extract the date the bill was issued (NOT the due date)
   - Return as ISO 8601 datetime string (YYYY-MM-DDTHH:mm:ss.sssZ)
   - If only a date is available, use midnight UTC (00:00:00.000Z)

4. **Confidence**: Provide a confidence score between 0 and 1 for your classification`;

  if (subjectHint) {
    prompt += `\n\n**Hint**: The email subject suggests this might be a ${subjectHint} bill, but verify this against the PDF content.`;
  }

  prompt += `\n\nImportant:
- Look for keywords like "Electricity", "Gas", "Water", "Internet", "Broadband", "NBN"
- Find the total amount due or total charges
- The issue date is usually at the top of the bill (e.g., "Bill Date", "Invoice Date", "Issued")
- Be accurate with the amount - include cents
- Only return data that matches the schema exactly`;

  return prompt;
}

/**
 * Parse multiple bills in parallel
 * @param attachments - Array of PDF attachments
 * @param subjectHints - Optional array of subject hints (same length as attachments)
 * @param config - AI gateway configuration
 * @returns Array of successfully parsed bills
 */
export async function parseBillsInParallel(
  attachments: Array<{ pdf: GmailAttachment; messageId: string }>,
  subjectHints: BillType[] | undefined,
  config: BillParserConfig
): Promise<Array<{ bill: ParsedBill; messageId: string }>> {
  const results = await Promise.allSettled(
    attachments.map(async ({ pdf, messageId }, index) => {
      const hint = subjectHints?.[index];
      const bill = await parseBillWithGemini(pdf, hint, config);
      return { bill, messageId };
    })
  );

  // Filter successful results
  const successfulBills = results
    .filter(
      (result): result is PromiseFulfilledResult<{ bill: ParsedBill; messageId: string }> =>
        result.status === 'fulfilled'
    )
    .map((result) => result.value);

  // Log failures
  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      console.error(
        `Failed to parse bill ${attachments[index].messageId}:`,
        result.reason
      );
    }
  });

  return successfulBills;
}
