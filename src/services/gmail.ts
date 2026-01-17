// Gmail API Types
export interface GmailMessage {
  id: string;
  threadId: string;
  snippet: string;
  internalDate: string;
  labelIds?: string[];
}

export interface GmailMessagePart {
  partId?: string;
  mimeType: string;
  filename?: string;
  headers?: Array<{ name: string; value: string }>;
  body?: {
    attachmentId?: string;
    size: number;
    data?: string;
  };
  parts?: GmailMessagePart[];
}

export interface GmailMessageFull {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet: string;
  payload: GmailMessagePart;
  sizeEstimate: number;
  historyId: string;
  internalDate: string;
}

export interface GmailAttachment {
  data: string;
  mimeType: string;
}

export interface GmailSearchResponse {
  messages?: GmailMessage[];
  nextPageToken?: string;
  resultSizeEstimate: number;
}

export interface GmailAttachmentResponse {
  size: number;
  data: string;
}

// Error types
export class GmailAPIError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public details?: any
  ) {
    super(message);
    this.name = 'GmailAPIError';
  }
}

/**
 * Build a Gmail query to search for Origin Energy bills
 * @param daysBack Number of days to look back (default: 30)
 * @returns Gmail search query string
 */
export function buildOriginBillQuery(daysBack: number = 30): string {
  const date = new Date();
  date.setDate(date.getDate() - daysBack);
  
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const afterDate = `${year}/${month}/${day}`;
  
  return `from:hello@origin.com.au after:${afterDate} has:attachment filename:pdf`;
}

/**
 * Search for emails matching a query
 * @param token OAuth2 access token
 * @param query Gmail search query
 * @returns Array of matching Gmail messages
 */
export async function searchEmails(
  token: string,
  query: string
): Promise<GmailMessage[]> {
  try {
    const encodedQuery = encodeURIComponent(query);
    const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodedQuery}`;
    console.log('Making Gmail API request to:', url);
    
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    console.log('Gmail API response status:', response.status);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('Gmail API error:', response.status, errorData);
      throw new GmailAPIError(
        `Gmail API search failed: ${response.statusText}`,
        response.status,
        errorData
      );
    }

    const data: GmailSearchResponse = await response.json();
    console.log('Gmail API response:', JSON.stringify(data, null, 2));
    return data.messages || [];
  } catch (error) {
    if (error instanceof GmailAPIError) {
      throw error;
    }
    console.error('Error searching emails:', error);
    throw new GmailAPIError(
      `Failed to search emails: ${error instanceof Error ? error.message : 'Unknown error'}`,
      undefined,
      error
    );
  }
}

/**
 * Get full details of a specific email
 * @param token OAuth2 access token
 * @param messageId Gmail message ID
 * @returns Full Gmail message details
 */
export async function getEmailDetails(
  token: string,
  messageId: string
): Promise<GmailMessageFull> {
  try {
    const response = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new GmailAPIError(
        `Gmail API get message failed: ${response.statusText}`,
        response.status,
        errorData
      );
    }

    const data: GmailMessageFull = await response.json();
    return data;
  } catch (error) {
    if (error instanceof GmailAPIError) {
      throw error;
    }
    console.error('Error getting email details:', error);
    throw new GmailAPIError(
      `Failed to get email details: ${error instanceof Error ? error.message : 'Unknown error'}`,
      undefined,
      error
    );
  }
}

/**
 * Download an attachment from an email
 * @param token OAuth2 access token
 * @param messageId Gmail message ID
 * @param attachmentId Attachment ID
 * @returns Attachment data and MIME type
 */
export async function downloadAttachment(
  token: string,
  messageId: string,
  attachmentId: string
): Promise<GmailAttachment> {
  try {
    const response = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/attachments/${attachmentId}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new GmailAPIError(
        `Gmail API download attachment failed: ${response.statusText}`,
        response.status,
        errorData
      );
    }

    const data: GmailAttachmentResponse = await response.json();
    
    // The attachment data is base64url-encoded, we need to convert it to standard base64
    // Gmail uses base64url encoding which replaces + with - and / with _
    const base64Data = data.data.replace(/-/g, '+').replace(/_/g, '/');
    
    return {
      data: base64Data,
      mimeType: 'application/pdf', // Default to PDF for Origin bills
    };
  } catch (error) {
    if (error instanceof GmailAPIError) {
      throw error;
    }
    console.error('Error downloading attachment:', error);
    throw new GmailAPIError(
      `Failed to download attachment: ${error instanceof Error ? error.message : 'Unknown error'}`,
      undefined,
      error
    );
  }
}

/**
 * Helper function to extract attachment information from a message
 * @param message Full Gmail message
 * @returns Array of attachment information
 */
export function extractAttachments(message: GmailMessageFull): Array<{
  partId: string;
  filename: string;
  mimeType: string;
  size: number;
  attachmentId: string;
}> {
  const attachments: Array<{
    partId: string;
    filename: string;
    mimeType: string;
    size: number;
    attachmentId: string;
  }> = [];

  function traverseParts(parts: GmailMessagePart[] | undefined) {
    if (!parts) return;

    for (const part of parts) {
      if (part.filename && part.body?.attachmentId) {
        attachments.push({
          partId: part.partId || '',
          filename: part.filename,
          mimeType: part.mimeType,
          size: part.body.size,
          attachmentId: part.body.attachmentId,
        });
      }

      if (part.parts) {
        traverseParts(part.parts);
      }
    }
  }

  if (message.payload.parts) {
    traverseParts(message.payload.parts);
  }

  return attachments;
}

/**
 * Helper function to extract email headers
 * @param message Full Gmail message
 * @param headerName Header name to extract (e.g., 'From', 'Subject')
 * @returns Header value or undefined
 */
export function getHeader(
  message: GmailMessageFull,
  headerName: string
): string | undefined {
  const headers = message.payload.headers;
  if (!headers) return undefined;

  const header = headers.find(
    (h) => h.name.toLowerCase() === headerName.toLowerCase()
  );
  return header?.value;
}
