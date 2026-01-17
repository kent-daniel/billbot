import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { GmailAttachment } from '../src/services/gmail';
import type { ParsedBill } from '../src/types/bills';

// Mock the AI SDK at the module level
vi.mock('ai', () => ({
  generateObject: vi.fn(),
}));

vi.mock('@ai-sdk/google', () => ({
  google: vi.fn(() => 'mocked-model'),
}));

// Import after mocks are set up
import { parseBillWithGemini, BillParserError } from '../src/services/billParser';
import { generateObject } from 'ai';

const mockGenerateObject = generateObject as ReturnType<typeof vi.fn>;

describe('Bill Parser Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('parseBillWithGemini', () => {
    it('should parse electricity bill correctly', async () => {
      const mockPdf: GmailAttachment = {
        data: 'base64-encoded-pdf-data',
        mimeType: 'application/pdf',
      };

      mockGenerateObject.mockResolvedValueOnce({
        object: {
          type: 'electricity',
          amount: 128.45,
          issue_date: '2026-01-15T00:00:00.000Z',
          confidence: 0.95,
        },
      });

      const result = await parseBillWithGemini(mockPdf);

      expect(result.type).toBe('electricity');
      expect(result.amount).toBe(128.45);
      expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    });

    it('should handle subject hint for classification', async () => {
      const mockPdf: GmailAttachment = {
        data: 'base64-encoded-pdf-data',
        mimeType: 'application/pdf',
      };

      mockGenerateObject.mockResolvedValueOnce({
        object: {
          type: 'hot_water',
          amount: 32.5,
          issue_date: '2026-01-10T00:00:00.000Z',
          confidence: 0.92,
        },
      });

      const result = await parseBillWithGemini(mockPdf, 'hot_water');

      expect(result.type).toBe('hot_water');
      expect(result.amount).toBeGreaterThan(0);
    });

    it('should reject low confidence results', async () => {
      const mockPdf: GmailAttachment = {
        data: 'base64-encoded-pdf-data',
        mimeType: 'application/pdf',
      };

      // Mock always returns low confidence (even on retries)
      mockGenerateObject.mockResolvedValue({
        object: {
          type: 'water',
          amount: 45.2,
          issue_date: '2026-01-08T00:00:00.000Z',
          confidence: 0.5, // Below threshold
        },
      });

      // Should throw due to low confidence after retries
      try {
        await parseBillWithGemini(mockPdf);
        expect.fail('Should have thrown BillParserError');
      } catch (error) {
        expect(error).toBeInstanceOf(BillParserError);
        // The error message will be "Failed to parse bill after 2 attempts"
        // because it retries and fails both times with low confidence
        expect((error as Error).message).toContain('Failed to parse bill');
      }
    });

    it('should handle all bill types', async () => {
      const billTypes = ['electricity', 'hot_water', 'water', 'internet'] as const;

      for (const type of billTypes) {
        const mockPdf: GmailAttachment = {
          data: 'base64-encoded-pdf-data',
          mimeType: 'application/pdf',
        };

        mockGenerateObject.mockResolvedValueOnce({
          object: {
            type,
            amount: 100.0,
            issue_date: '2026-01-15T00:00:00.000Z',
            confidence: 0.9,
          },
        });

        const result = await parseBillWithGemini(mockPdf);
        expect(result.type).toBe(type);
      }
    });

    it('should extract accurate amounts', async () => {
      const testCases = [
        { amount: 128.45, expected: 128.45 },
        { amount: 32.5, expected: 32.5 },
        { amount: 45.2, expected: 45.2 },
        { amount: 79.99, expected: 79.99 },
      ];

      for (const testCase of testCases) {
        const mockPdf: GmailAttachment = {
          data: 'base64-encoded-pdf-data',
          mimeType: 'application/pdf',
        };

        mockGenerateObject.mockResolvedValueOnce({
          object: {
            type: 'electricity',
            amount: testCase.amount,
            issue_date: '2026-01-15T00:00:00.000Z',
            confidence: 0.95,
          },
        });

        const result = await parseBillWithGemini(mockPdf);
        expect(result.amount).toBe(testCase.expected);
      }
    });

    it('should validate ISO date format', async () => {
      const mockPdf: GmailAttachment = {
        data: 'base64-encoded-pdf-data',
        mimeType: 'application/pdf',
      };

      mockGenerateObject.mockResolvedValueOnce({
        object: {
          type: 'electricity',
          amount: 100.0,
          issue_date: '2026-01-15T00:00:00.000Z',
          confidence: 0.9,
        },
      });

      const result = await parseBillWithGemini(mockPdf);

      // Should be valid ISO 8601 datetime
      expect(result.issue_date).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it('should retry once on parsing failure', async () => {
      const mockPdf: GmailAttachment = {
        data: 'base64-encoded-pdf-data',
        mimeType: 'application/pdf',
      };

      // First call fails, second succeeds
      mockGenerateObject
        .mockRejectedValueOnce(new Error('Gemini API error'))
        .mockResolvedValueOnce({
          object: {
            type: 'electricity',
            amount: 100.0,
            issue_date: '2026-01-15T00:00:00.000Z',
            confidence: 0.9,
          },
        });

      const result = await parseBillWithGemini(mockPdf);
      expect(result).toBeDefined();
      expect(mockGenerateObject).toHaveBeenCalledTimes(2);
    });
  });
});
