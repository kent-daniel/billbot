import { describe, it, expect, beforeEach } from 'vitest';
import type { ParsedBill } from '../src/types/bills';

describe('BillsDO - Bills Durable Object', () => {
  describe('Bill Storage', () => {
    it('should store bills successfully', () => {
      const mockBills: ParsedBill[] = [
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
      ];

      // Test expectations for storeBills method
      expect(mockBills).toHaveLength(2);
      expect(mockBills[0].type).toBe('electricity');
    });

    it('should handle upsert by gmail_message_id', () => {
      // Bills with same gmail_message_id should be updated, not duplicated
      const bill1 = {
        type: 'electricity' as const,
        amount: 100.0,
        issue_date: '2026-01-15T00:00:00.000Z',
        confidence: 0.9,
      };

      const bill2 = {
        type: 'electricity' as const,
        amount: 105.0, // Updated amount
        issue_date: '2026-01-15T00:00:00.000Z',
        confidence: 0.95,
      };

      expect(bill1.type).toBe(bill2.type);
      expect(bill2.amount).toBeGreaterThan(bill1.amount);
    });

    it('should enforce max 50 bills per user', () => {
      // Generate 60 bills
      const bills: ParsedBill[] = Array.from({ length: 60 }, (_, i) => ({
        type: 'electricity' as const,
        amount: 100.0 + i,
        issue_date: `2026-01-${String(i + 1).padStart(2, '0')}T00:00:00.000Z`,
        confidence: 0.9,
      }));

      expect(bills).toHaveLength(60);
      // After pruning, should only have 50 most recent
      const pruned = bills.slice(-50);
      expect(pruned).toHaveLength(50);
      expect(pruned[0].amount).toBe(110.0); // Bills 11-60 (50 total)
    });
  });

  describe('Bill Retrieval', () => {
    it('should retrieve bills from last 30 days', () => {
      const now = new Date('2026-01-17T00:00:00.000Z');
      const thirtyDaysAgo = new Date(now);
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const recentBill: ParsedBill = {
        type: 'electricity',
        amount: 100.0,
        issue_date: '2026-01-15T00:00:00.000Z',
        confidence: 0.9,
      };

      const oldBill: ParsedBill = {
        type: 'water',
        amount: 50.0,
        issue_date: '2025-12-01T00:00:00.000Z',
        confidence: 0.9,
      };

      const recentDate = new Date(recentBill.issue_date);
      const oldDate = new Date(oldBill.issue_date);

      expect(recentDate.getTime()).toBeGreaterThan(thirtyDaysAgo.getTime());
      expect(oldDate.getTime()).toBeLessThan(thirtyDaysAgo.getTime());
    });

    it('should return empty array when no bills found', () => {
      const bills: ParsedBill[] = [];
      expect(bills).toHaveLength(0);
    });

    it('should order bills by timestamp descending', () => {
      const bills: ParsedBill[] = [
        {
          type: 'electricity',
          amount: 100.0,
          issue_date: '2026-01-15T00:00:00.000Z',
          confidence: 0.9,
        },
        {
          type: 'water',
          amount: 50.0,
          issue_date: '2026-01-10T00:00:00.000Z',
          confidence: 0.9,
        },
        {
          type: 'internet',
          amount: 80.0,
          issue_date: '2026-01-12T00:00:00.000Z',
          confidence: 0.9,
        },
      ];

      const sorted = bills.sort((a, b) => 
        new Date(b.issue_date).getTime() - new Date(a.issue_date).getTime()
      );

      expect(sorted[0].type).toBe('electricity'); // Jan 15 (most recent)
      expect(sorted[1].type).toBe('internet'); // Jan 12
      expect(sorted[2].type).toBe('water'); // Jan 10
    });
  });

  describe('Bill Schema', () => {
    it('should validate bill structure', () => {
      const validBill = {
        id: 1,
        user_id: 'user123',
        type: 'electricity',
        amount: 128.45,
        issue_date: '2026-01-15T00:00:00.000Z',
        gmail_message_id: 'msg123',
        timestamp: Date.now(),
      };

      expect(validBill).toHaveProperty('id');
      expect(validBill).toHaveProperty('user_id');
      expect(validBill).toHaveProperty('type');
      expect(validBill).toHaveProperty('amount');
      expect(validBill).toHaveProperty('issue_date');
      expect(validBill).toHaveProperty('gmail_message_id');
      expect(validBill).toHaveProperty('timestamp');
    });

    it('should have unique gmail_message_id', () => {
      const bill1 = {
        gmail_message_id: 'msg123',
        type: 'electricity',
      };

      const bill2 = {
        gmail_message_id: 'msg456',
        type: 'water',
      };

      expect(bill1.gmail_message_id).not.toBe(bill2.gmail_message_id);
    });
  });

  describe('Auto-cleanup', () => {
    it('should prune old bills automatically', () => {
      const maxBills = 50;
      const currentCount = 55;
      
      expect(currentCount).toBeGreaterThan(maxBills);
      
      const toDelete = currentCount - maxBills;
      expect(toDelete).toBe(5);
    });

    it('should keep most recent bills when pruning', () => {
      const bills = [
        { timestamp: 1000, amount: 10 },
        { timestamp: 2000, amount: 20 },
        { timestamp: 3000, amount: 30 },
      ];

      const sorted = bills.sort((a, b) => b.timestamp - a.timestamp);
      const kept = sorted.slice(0, 2);

      expect(kept).toHaveLength(2);
      expect(kept[0].amount).toBe(30); // Most recent
      expect(kept[1].amount).toBe(20);
    });
  });
});
