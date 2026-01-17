/**
 * Bills Durable Object
 * Phase 5 - Storage Implementation
 * 
 * Stores bill history for users with:
 * - Max 50 bills per user (rolling window)
 * - Automatic pruning of old bills
 * - Upsert by gmail_message_id (prevent duplicates)
 */

import { DurableObject } from 'cloudflare:workers';
import type { ParsedBill } from '../types/bills';

export interface StoredBill extends ParsedBill {
  id: number;
  user_id: string;
  gmail_message_id: string;
  timestamp: number;
}

const MAX_BILLS_PER_USER = 50;

export class BillsDO extends DurableObject {
  private sql = this.ctx.storage.sql;

  constructor(ctx: DurableObjectState, env: any) {
    super(ctx, env);
    this.initializeDatabase();
  }

  /**
   * Initialize the database schema
   */
  private initializeDatabase() {
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS bills (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        type TEXT NOT NULL,
        amount REAL NOT NULL,
        issue_date TEXT NOT NULL,
        gmail_message_id TEXT NOT NULL UNIQUE,
        confidence REAL NOT NULL,
        timestamp INTEGER NOT NULL
      );
      
      CREATE INDEX IF NOT EXISTS idx_user_timestamp 
        ON bills(user_id, timestamp DESC);
        
      CREATE INDEX IF NOT EXISTS idx_gmail_message 
        ON bills(gmail_message_id);
    `);
  }

  /**
   * Store bills (upsert by gmail_message_id)
   * @param userId - User ID
   * @param bills - Array of parsed bills with gmail_message_id
   */
  async storeBills(
    userId: string,
    bills: Array<ParsedBill & { gmail_message_id: string }>
  ): Promise<void> {
    const timestamp = Date.now();

    for (const bill of bills) {
      // Upsert: replace if gmail_message_id exists, otherwise insert
      this.sql.exec(
        `
        INSERT INTO bills (
          user_id, 
          type, 
          amount, 
          issue_date, 
          gmail_message_id, 
          confidence, 
          timestamp
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(gmail_message_id) DO UPDATE SET
          type = excluded.type,
          amount = excluded.amount,
          issue_date = excluded.issue_date,
          confidence = excluded.confidence,
          timestamp = excluded.timestamp
        `,
        userId,
        bill.type,
        bill.amount,
        bill.issue_date,
        bill.gmail_message_id,
        bill.confidence,
        timestamp
      );
    }

    // Auto-prune old bills
    await this.prune(userId);

    console.log(`Stored ${bills.length} bills for user ${userId}`);
  }

  /**
   * Get recent bills for a user
   * @param userId - User ID
   * @param daysBack - Number of days to look back (default: 30)
   * @returns Array of recent bills
   */
  async getRecent(userId: string, daysBack: number = 30): Promise<StoredBill[]> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysBack);
    const cutoffTimestamp = cutoffDate.getTime();

    const cursor = this.sql.exec(
      `
      SELECT 
        id,
        user_id,
        type,
        amount,
        issue_date,
        gmail_message_id,
        confidence,
        timestamp
      FROM bills
      WHERE user_id = ? AND timestamp >= ?
      ORDER BY timestamp DESC
      `,
      userId,
      cutoffTimestamp
    );

    const bills: StoredBill[] = [];
    for (const row of cursor) {
      bills.push({
        id: row[0] as number,
        user_id: row[1] as string,
        type: row[2] as ParsedBill['type'],
        amount: row[3] as number,
        issue_date: row[4] as string,
        gmail_message_id: row[5] as string,
        confidence: row[6] as number,
        timestamp: row[7] as number,
      });
    }

    return bills;
  }

  /**
   * Get all bills for a user (for testing/debugging)
   */
  async getAllBills(userId: string): Promise<StoredBill[]> {
    const cursor = this.sql.exec(
      `
      SELECT 
        id,
        user_id,
        type,
        amount,
        issue_date,
        gmail_message_id,
        confidence,
        timestamp
      FROM bills
      WHERE user_id = ?
      ORDER BY timestamp DESC
      `,
      userId
    );

    const bills: StoredBill[] = [];
    for (const row of cursor) {
      bills.push({
        id: row[0] as number,
        user_id: row[1] as string,
        type: row[2] as ParsedBill['type'],
        amount: row[3] as number,
        issue_date: row[4] as string,
        gmail_message_id: row[5] as string,
        confidence: row[6] as number,
        timestamp: row[7] as number,
      });
    }

    return bills;
  }

  /**
   * Prune old bills to keep max 50 per user
   * @param userId - User ID
   */
  async prune(userId: string): Promise<void> {
    // Count bills for user
    const countCursor = this.sql.exec(
      `SELECT COUNT(*) FROM bills WHERE user_id = ?`,
      userId
    );

    const count = countCursor.toArray()[0][0] as number;

    if (count > MAX_BILLS_PER_USER) {
      const toDelete = count - MAX_BILLS_PER_USER;

      // Delete oldest bills
      this.sql.exec(
        `
        DELETE FROM bills
        WHERE id IN (
          SELECT id FROM bills
          WHERE user_id = ?
          ORDER BY timestamp ASC
          LIMIT ?
        )
        `,
        userId,
        toDelete
      );

      console.log(`Pruned ${toDelete} old bills for user ${userId}`);
    }
  }

  /**
   * Delete all bills for a user (for testing)
   */
  async deleteAllBills(userId: string): Promise<void> {
    this.sql.exec(`DELETE FROM bills WHERE user_id = ?`, userId);
    console.log(`Deleted all bills for user ${userId}`);
  }

  /**
   * Handle HTTP requests to this Durable Object
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      // POST /store - Store bills
      if (path === '/store' && request.method === 'POST') {
        const body = await request.json<{
          userId: string;
          bills: Array<ParsedBill & { gmail_message_id: string }>;
        }>();

        await this.storeBills(body.userId, body.bills);

        return new Response(JSON.stringify({ success: true }), {
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // GET /recent - Get recent bills
      if (path === '/recent' && request.method === 'GET') {
        const userId = url.searchParams.get('userId');
        const daysBack = parseInt(url.searchParams.get('daysBack') || '30');

        if (!userId) {
          return new Response('Missing userId', { status: 400 });
        }

        const bills = await this.getRecent(userId, daysBack);

        return new Response(JSON.stringify({ bills }), {
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // GET /all - Get all bills (for testing)
      if (path === '/all' && request.method === 'GET') {
        const userId = url.searchParams.get('userId');

        if (!userId) {
          return new Response('Missing userId', { status: 400 });
        }

        const bills = await this.getAllBills(userId);

        return new Response(JSON.stringify({ bills }), {
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // DELETE /all - Delete all bills (for testing)
      if (path === '/all' && request.method === 'DELETE') {
        const userId = url.searchParams.get('userId');

        if (!userId) {
          return new Response('Missing userId', { status: 400 });
        }

        await this.deleteAllBills(userId);

        return new Response(JSON.stringify({ success: true }), {
          headers: { 'Content-Type': 'application/json' },
        });
      }

      return new Response('Not Found', { status: 404 });
    } catch (error) {
      console.error('BillsDO error:', error);
      return new Response(
        JSON.stringify({
          error: error instanceof Error ? error.message : 'Unknown error',
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }
  }
}
