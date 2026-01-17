import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  searchEmails,
  getEmailDetails,
  downloadAttachment,
  extractAttachments,
  getHeader,
  buildOriginBillQuery,
  GmailAPIError,
  type GmailMessageFull,
} from '../src/services/gmail';

describe('Gmail Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('buildOriginBillQuery', () => {
    it('should build correct query for last 30 days', () => {
      const query = buildOriginBillQuery(30);
      expect(query).toContain('from:hello@origin.com.au');
      expect(query).toContain('after:');
      expect(query).toContain('has:attachment');
      expect(query).toContain('filename:pdf');
    });

    it('should handle custom days back', () => {
      const query = buildOriginBillQuery(60);
      expect(query).toContain('from:hello@origin.com.au');
      const afterMatch = query.match(/after:(\d{4}\/\d{2}\/\d{2})/);
      expect(afterMatch).not.toBeNull();
    });
  });

  describe('searchEmails', () => {
    it('should successfully search emails', async () => {
      const mockResponse = {
        messages: [
          { id: 'msg1', threadId: 'thread1', snippet: 'test', internalDate: '1234567890' },
        ],
        resultSizeEstimate: 1,
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await searchEmails('fake-token', 'test query');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('msg1');
    });

    it('should handle empty results', async () => {
      const mockResponse = {
        resultSizeEstimate: 0,
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await searchEmails('fake-token', 'test query');
      expect(result).toHaveLength(0);
    });

    it('should throw GmailAPIError on API failure', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: async () => ({ error: 'Invalid token' }),
      });

      await expect(searchEmails('bad-token', 'test query')).rejects.toThrow(GmailAPIError);
    });
  });

  describe('getEmailDetails', () => {
    it('should fetch email details successfully', async () => {
      const mockMessage: GmailMessageFull = {
        id: 'msg1',
        threadId: 'thread1',
        snippet: 'test',
        payload: {
          mimeType: 'multipart/mixed',
          headers: [{ name: 'Subject', value: 'Test Bill' }],
        },
        sizeEstimate: 1000,
        historyId: 'hist1',
        internalDate: '1234567890',
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockMessage,
      });

      const result = await getEmailDetails('fake-token', 'msg1');
      expect(result.id).toBe('msg1');
      expect(result.payload).toBeDefined();
    });

    it('should throw error for invalid message ID', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: async () => ({ error: 'Message not found' }),
      });

      await expect(getEmailDetails('fake-token', 'invalid-id')).rejects.toThrow(GmailAPIError);
    });
  });

  describe('extractAttachments', () => {
    it('should extract PDF attachments from message', () => {
      const message: GmailMessageFull = {
        id: 'msg1',
        threadId: 'thread1',
        snippet: 'test',
        payload: {
          mimeType: 'multipart/mixed',
          parts: [
            {
              mimeType: 'text/plain',
              body: { size: 100 },
            },
            {
              partId: '1',
              mimeType: 'application/pdf',
              filename: 'bill.pdf',
              body: {
                attachmentId: 'attach1',
                size: 5000,
              },
            },
          ],
        },
        sizeEstimate: 6000,
        historyId: 'hist1',
        internalDate: '1234567890',
      };

      const attachments = extractAttachments(message);
      expect(attachments).toHaveLength(1);
      expect(attachments[0].filename).toBe('bill.pdf');
      expect(attachments[0].attachmentId).toBe('attach1');
      expect(attachments[0].mimeType).toBe('application/pdf');
    });

    it('should return empty array when no attachments', () => {
      const message: GmailMessageFull = {
        id: 'msg1',
        threadId: 'thread1',
        snippet: 'test',
        payload: {
          mimeType: 'text/plain',
          body: { size: 100 },
        },
        sizeEstimate: 100,
        historyId: 'hist1',
        internalDate: '1234567890',
      };

      const attachments = extractAttachments(message);
      expect(attachments).toHaveLength(0);
    });
  });

  describe('getHeader', () => {
    it('should extract header value', () => {
      const message: GmailMessageFull = {
        id: 'msg1',
        threadId: 'thread1',
        snippet: 'test',
        payload: {
          mimeType: 'text/plain',
          headers: [
            { name: 'Subject', value: 'Test Subject' },
            { name: 'From', value: 'test@example.com' },
          ],
        },
        sizeEstimate: 100,
        historyId: 'hist1',
        internalDate: '1234567890',
      };

      expect(getHeader(message, 'Subject')).toBe('Test Subject');
      expect(getHeader(message, 'From')).toBe('test@example.com');
      expect(getHeader(message, 'subject')).toBe('Test Subject'); // Case insensitive
    });

    it('should return undefined for missing header', () => {
      const message: GmailMessageFull = {
        id: 'msg1',
        threadId: 'thread1',
        snippet: 'test',
        payload: {
          mimeType: 'text/plain',
          headers: [],
        },
        sizeEstimate: 100,
        historyId: 'hist1',
        internalDate: '1234567890',
      };

      expect(getHeader(message, 'Subject')).toBeUndefined();
    });
  });

  describe('downloadAttachment', () => {
    it('should download and decode attachment', async () => {
      const mockResponse = {
        size: 1000,
        data: 'SGVsbG8gV29ybGQ', // base64url encoded "Hello World"
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await downloadAttachment('fake-token', 'msg1', 'attach1');
      expect(result.data).toBeDefined();
      expect(result.mimeType).toBe('application/pdf');
    });

    it('should handle base64url to base64 conversion', async () => {
      const mockResponse = {
        size: 1000,
        data: 'test-data_with_chars', // base64url with - and _
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await downloadAttachment('fake-token', 'msg1', 'attach1');
      // Should replace - with + and _ with /
      expect(result.data).toContain('+');
      expect(result.data).toContain('/');
      expect(result.data).not.toContain('-');
      expect(result.data).not.toContain('_');
    });

    it('should throw error on download failure', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: async () => ({ error: 'Attachment not found' }),
      });

      await expect(downloadAttachment('fake-token', 'msg1', 'invalid')).rejects.toThrow(
        GmailAPIError
      );
    });
  });
});
