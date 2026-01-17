/**
 * Bill Scanning Workflow Service
 * Phase 3 - Workflow Implementation
 * 
 * This is a simplified workflow implementation that doesn't use CF Workflows yet.
 * It orchestrates the bill scanning process in a durable, step-by-step manner.
 */

import type { ParsedBill, BillType } from '../types/bills';
import type { GmailAttachment, GmailMessageFull } from '../services/gmail';
import {
  searchEmails,
  getEmailDetails,
  downloadAttachment,
  extractAttachments,
  getHeader,
  buildOriginBillQuery,
} from '../services/gmail';
import { categorizeBySubject } from '../config/billSenders';
import { parseBillsInParallel } from '../services/billParser';
import { formatBillSummary, formatErrorResponse } from '../services/discord';

export interface WorkflowInput {
  userId: string;
  channelId: string;
  interactionToken: string;
  daysBack?: number;
}

export interface WorkflowResult {
  success: boolean;
  bills: ParsedBill[];
  error?: string;
}

/**
 * Main workflow orchestrator
 * Executes all steps in sequence with error handling
 */
export async function executeBillScanWorkflow(
  input: WorkflowInput,
  env: any
): Promise<WorkflowResult> {
  const { userId, channelId, interactionToken, daysBack = 30 } = input;

  try {
    console.log(`Starting bill scan workflow for user ${userId}`);

    // Step 1: Refresh OAuth token if needed
    console.log('Step 1: Refreshing OAuth token...');
    const token = await refreshTokenIfNeeded(userId, env);

    // Step 2: Search Gmail for Origin bills
    console.log('Step 2: Searching Gmail for bills...');
    const messages = await searchGmailForBills(token, daysBack);

    if (messages.length === 0) {
      console.log('No bills found in Gmail');
      return {
        success: true,
        bills: [],
      };
    }

    console.log(`Found ${messages.length} potential bill emails`);

    // Step 3: Get email details and filter by subject
    console.log('Step 3: Filtering emails by subject...');
    const filteredMessages = await filterMessagesBySubject(token, messages);

    console.log(`${filteredMessages.length} bills passed subject filter`);

    if (filteredMessages.length === 0) {
      return {
        success: true,
        bills: [],
      };
    }

    // Step 4: Download PDF attachments (parallel, limited to 10)
    console.log('Step 4: Downloading PDF attachments...');
    const pdfs = await downloadPDFAttachments(
      token,
      filteredMessages.slice(0, 10)
    );

    console.log(`Downloaded ${pdfs.length} PDFs`);

    if (pdfs.length === 0) {
      return {
        success: true,
        bills: [],
      };
    }

    // Step 5: Parse bills with Gemini (parallel)
    console.log('Step 5: Parsing bills with Gemini...');
    const subjectHints = pdfs
      .map((pdf) => pdf.subjectHint)
      .filter((hint): hint is BillType => hint !== null);
    const parsedBills = await parseBillsInParallel(
      pdfs.map((pdf) => ({ pdf: pdf.attachment, messageId: pdf.messageId })),
      subjectHints.length > 0 ? subjectHints : undefined
    );

    console.log(`Successfully parsed ${parsedBills.length} bills`);

    // Step 6: Store bills in BillsDO
    console.log('Step 6: Storing bills...');
    await storeBills(userId, parsedBills, env);

    // Extract just the bill data (without messageId wrapper)
    const bills = parsedBills.map((pb) => pb.bill);

    return {
      success: true,
      bills,
    };
  } catch (error) {
    console.error('Workflow error:', error);
    return {
      success: false,
      bills: [],
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Step 1: Refresh OAuth token if needed
 */
async function refreshTokenIfNeeded(userId: string, env: any): Promise<string> {
  const tokensDOId = env.OAUTH_TOKENS.idFromName(userId);
  const tokensStub = env.OAUTH_TOKENS.get(tokensDOId);

  const response = await tokensStub.fetch('https://internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'getAccessToken', userId }),
  });

  if (!response.ok) {
    throw new Error('Failed to get access token');
  }

  const data = await response.json();
  return (data as { accessToken: string }).accessToken;
}

/**
 * Step 2: Search Gmail for Origin bills
 */
async function searchGmailForBills(
  token: string,
  daysBack: number
): Promise<Array<{ id: string; threadId: string }>> {
  const query = buildOriginBillQuery(daysBack);
  const messages = await searchEmails(token, query);

  return messages.map((msg) => ({
    id: msg.id,
    threadId: msg.threadId,
  }));
}

/**
 * Step 3: Filter messages by subject keywords
 */
async function filterMessagesBySubject(
  token: string,
  messages: Array<{ id: string; threadId: string }>
): Promise<
  Array<{
    messageId: string;
    subject: string;
    subjectHint: string | null;
  }>
> {
  const filtered: Array<{
    messageId: string;
    subject: string;
    subjectHint: string | null;
  }> = [];

  for (const msg of messages) {
    try {
      const details = await getEmailDetails(token, msg.id);
      const subject = getHeader(details, 'Subject') || '';

      // Categorize by subject
      const billType = categorizeBySubject(subject);

      // Include all messages (even without subject hint, Gemini will classify)
      filtered.push({
        messageId: msg.id,
        subject,
        subjectHint: billType,
      });
    } catch (error) {
      console.error(`Failed to get details for message ${msg.id}:`, error);
    }
  }

  return filtered;
}

/**
 * Step 4: Download PDF attachments from messages
 */
async function downloadPDFAttachments(
  token: string,
  messages: Array<{
    messageId: string;
    subject: string;
    subjectHint: string | null;
  }>
): Promise<
  Array<{
    messageId: string;
    attachment: GmailAttachment;
    subjectHint: string | null;
  }>
> {
  const pdfs: Array<{
    messageId: string;
    attachment: GmailAttachment;
    subjectHint: string | null;
  }> = [];

  await Promise.allSettled(
    messages.map(async (msg) => {
      try {
        const details = await getEmailDetails(token, msg.messageId);
        const attachments = extractAttachments(details);

        // Get first PDF attachment
        const pdfAttachment = attachments.find((att) =>
          att.mimeType.includes('pdf')
        );

        if (pdfAttachment) {
          const attachment = await downloadAttachment(
            token,
            msg.messageId,
            pdfAttachment.attachmentId
          );

          pdfs.push({
            messageId: msg.messageId,
            attachment,
            subjectHint: msg.subjectHint,
          });
        }
      } catch (error) {
        console.error(
          `Failed to download attachment for ${msg.messageId}:`,
          error
        );
      }
    })
  );

  return pdfs;
}

/**
 * Step 6: Store bills in BillsDO
 */
async function storeBills(
  userId: string,
  parsedBills: Array<{ bill: ParsedBill; messageId: string }>,
  env: any
): Promise<void> {
  const billsDOId = env.BILLS.idFromName(userId);
  const billsStub = env.BILLS.get(billsDOId);

  const billsToStore = parsedBills.map((pb) => ({
    ...pb.bill,
    gmail_message_id: pb.messageId,
  }));

  await billsStub.fetch('https://internal/store', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId,
      bills: billsToStore,
    }),
  });
}

/**
 * Send Discord follow-up message with workflow result
 */
export async function sendWorkflowResult(
  result: WorkflowResult,
  interactionToken: string,
  applicationId: string
): Promise<void> {
  const followUpUrl = `https://discord.com/api/v10/webhooks/${applicationId}/${interactionToken}`;

  let content: string;

  if (!result.success) {
    const error = new Error(result.error || 'Unknown error');
    content = formatErrorResponse(error);
  } else {
    content = formatBillSummary(result.bills);
  }

  await fetch(followUpUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
}
