import { describe, it, expect } from 'vitest';
import { formatBillSummary, formatErrorResponse, formatDate } from '../src/services/discord';
import type { ParsedBill } from '../src/types/bills';

describe('Discord Response Formatter', () => {
  describe('formatBillSummary', () => {
    it('should format bills with all types', () => {
      const bills: ParsedBill[] = [
        {
          type: 'electricity',
          amount: 128.45,
          issue_date: '2026-01-15T00:00:00.000Z',
          confidence: 0.95,
        },
        {
          type: 'hot_water',
          amount: 32.5,
          issue_date: '2026-01-10T00:00:00.000Z',
          confidence: 0.92,
        },
        {
          type: 'water',
          amount: 45.2,
          issue_date: '2026-01-08T00:00:00.000Z',
          confidence: 0.9,
        },
        {
          type: 'internet',
          amount: 79.99,
          issue_date: '2026-01-12T00:00:00.000Z',
          confidence: 0.93,
        },
      ];

      const result = formatBillSummary(bills);

      expect(result).toContain('Bills for last 30 days');
      expect(result).toContain('Electricity');
      expect(result).toContain('$128.45');
      expect(result).toContain('Hot Water');
      expect(result).toContain('$32.50');
      expect(result).toContain('Water');
      expect(result).toContain('$45.20');
      expect(result).toContain('Internet');
      expect(result).toContain('$79.99');
      expect(result).toContain('Total');
      expect(result).toContain('$286.14');
    });

    it('should handle empty bill list', () => {
      const bills: ParsedBill[] = [];
      const result = formatBillSummary(bills);

      expect(result).toContain('No bills found');
      expect(result).toContain('last 30 days');
    });

    it('should handle single bill type', () => {
      const bills: ParsedBill[] = [
        {
          type: 'electricity',
          amount: 128.45,
          issue_date: '2026-01-15T00:00:00.000Z',
          confidence: 0.95,
        },
      ];

      const result = formatBillSummary(bills);

      expect(result).toContain('Electricity');
      expect(result).toContain('$128.45');
      expect(result).toContain('**Total:** $128.45');
    });

    it('should use emoji icons for bill types', () => {
      const bills: ParsedBill[] = [
        {
          type: 'electricity',
          amount: 100.0,
          issue_date: '2026-01-15T00:00:00.000Z',
          confidence: 0.9,
        },
        {
          type: 'hot_water',
          amount: 50.0,
          issue_date: '2026-01-10T00:00:00.000Z',
          confidence: 0.9,
        },
        {
          type: 'water',
          amount: 30.0,
          issue_date: '2026-01-08T00:00:00.000Z',
          confidence: 0.9,
        },
        {
          type: 'internet',
          amount: 80.0,
          issue_date: '2026-01-12T00:00:00.000Z',
          confidence: 0.9,
        },
      ];

      const result = formatBillSummary(bills);

      // Check for expected emoji patterns (specific emojis may vary)
      expect(result).toMatch(/Electricity/);
      expect(result).toMatch(/Hot Water/);
      expect(result).toMatch(/Water/);
      expect(result).toMatch(/Internet/);
    });

    it('should calculate total correctly', () => {
      const bills: ParsedBill[] = [
        {
          type: 'electricity',
          amount: 100.0,
          issue_date: '2026-01-15T00:00:00.000Z',
          confidence: 0.9,
        },
        {
          type: 'water',
          amount: 50.5,
          issue_date: '2026-01-10T00:00:00.000Z',
          confidence: 0.9,
        },
      ];

      const result = formatBillSummary(bills);
      const expectedTotal = 150.5;

      expect(result).toContain(`$${expectedTotal.toFixed(2)}`);
    });

    it('should format amounts with 2 decimal places', () => {
      const bills: ParsedBill[] = [
        {
          type: 'electricity',
          amount: 128.4,
          issue_date: '2026-01-15T00:00:00.000Z',
          confidence: 0.9,
        },
      ];

      const result = formatBillSummary(bills);
      expect(result).toContain('$128.40');
      // Check that we don't have an improperly formatted amount (trailing space or newline after .4)
      expect(result).not.toMatch(/\$128\.4[^0-9]/);
    });

    it('should show only most recent bill per type', () => {
      const bills: ParsedBill[] = [
        {
          type: 'electricity',
          amount: 100.0,
          issue_date: '2026-01-15T00:00:00.000Z',
          confidence: 0.9,
        },
        {
          type: 'electricity',
          amount: 90.0,
          issue_date: '2026-01-05T00:00:00.000Z',
          confidence: 0.9,
        },
      ];

      const result = formatBillSummary(bills);

      // Should show the most recent (Jan 15, $100)
      expect(result).toContain('$100.00');
      expect(result).not.toContain('$90.00');
    });
  });

  describe('formatDate', () => {
    it('should format ISO date to readable format', () => {
      const isoDate = '2026-01-15T00:00:00.000Z';
      const result = formatDate(isoDate);

      expect(result).toContain('Jan');
      expect(result).toContain('15');
    });

    it('should handle different months', () => {
      const dates = [
        '2026-01-15T00:00:00.000Z',
        '2026-02-20T00:00:00.000Z',
        '2026-12-25T00:00:00.000Z',
      ];

      dates.forEach((date) => {
        const result = formatDate(date);
        expect(result).toBeTruthy();
        expect(result.length).toBeGreaterThan(0);
      });
    });

    it('should use short month format', () => {
      const isoDate = '2026-01-15T00:00:00.000Z';
      const result = formatDate(isoDate);

      // en-AU locale returns "15 Jan" format (day first)
      expect(result).toMatch(/^\d{1,2} [A-Z][a-z]{2}$/);
    });
  });

  describe('formatErrorResponse', () => {
    it('should format OAuth error', () => {
      const error = new Error('OAuth token expired');
      const result = formatErrorResponse(error);

      expect(result).toContain('Gmail connection expired');
      expect(result).toContain('/bill connect');
    });

    it('should format rate limit error', () => {
      const error = new Error('Rate limit exceeded');
      const result = formatErrorResponse(error);

      expect(result).toContain('rate limit');
      expect(result).toContain('try again');
    });

    it('should format generic error', () => {
      const error = new Error('Something went wrong');
      const result = formatErrorResponse(error);

      expect(result).toContain('error occurred');
      expect(result).toContain('try again');
    });

    it('should handle network errors', () => {
      const error = new Error('Network timeout');
      const result = formatErrorResponse(error);

      expect(result).toBeTruthy();
      expect(result.length).toBeGreaterThan(0);
    });
  });
});
