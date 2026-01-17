/**
 * Bill Types and Zod Schemas
 * Phase 2 - Gmail Agent Implementation
 */

import { z } from 'zod';

/**
 * Zod schema for bill types
 */
export const BillTypeSchema = z.enum(['electricity', 'hot_water', 'water', 'internet']);

/**
 * Zod schema for parsed bill data
 */
export const ParsedBillSchema = z.object({
  type: BillTypeSchema,
  amount: z.number().positive().describe('Bill amount in dollars'),
  issue_date: z.string().datetime().describe('ISO 8601 datetime string for bill issue date'),
  confidence: z.number().min(0).max(1).describe('Confidence score between 0 and 1'),
});

/**
 * TypeScript types derived from Zod schemas
 */
export type BillType = z.infer<typeof BillTypeSchema>;
export type ParsedBill = z.infer<typeof ParsedBillSchema>;
