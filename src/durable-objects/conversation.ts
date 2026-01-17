export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

export interface ConversationState {
  messages: Message[];
  userId: string;
  lastUpdated: number;
}

// Durable Object RPC Actions
type DOAction =
  | { action: 'add'; role: 'user' | 'assistant' | 'system'; content: string; userId: string }
  | { action: 'getHistory' }
  | { action: 'clear' };

export class ConversationDO implements DurableObject {
  private state: DurableObjectState;
  private sql: SqlStorage;
  private userId: string = '';
  private readonly MAX_MESSAGES = 50;
  private initialized: boolean = false;

  constructor(state: DurableObjectState) {
    this.state = state;
    this.sql = state.storage.sql;
  }

  async fetch(request: Request): Promise<Response> {
    // Initialize SQL tables on first request
    if (!this.initialized) {
      await this.initializeTables();
      this.initialized = true;
    }

    try {
      const payload = await request.json<DOAction>();

      switch (payload.action) {
        case 'add':
          return await this.addMessage(payload.role, payload.content, payload.userId);

        case 'getHistory':
          return await this.getHistory();

        case 'clear':
          return await this.clearHistory();

        default:
          return new Response(JSON.stringify({ error: 'Unknown action' }), { 
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          });
      }
    } catch (error) {
      return new Response(JSON.stringify({ error: 'Invalid request' }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  private async initializeTables(): Promise<void> {
    // Create messages table
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS conversation_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
        content TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create metadata table to store user info and other conversation metadata
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS conversation_metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create index for faster queries by timestamp
    this.sql.exec(`
      CREATE INDEX IF NOT EXISTS idx_messages_timestamp 
      ON conversation_messages(timestamp DESC)
    `);

    // Load userId from metadata if exists
    const cursor = this.sql.exec(`
      SELECT value FROM conversation_metadata WHERE key = 'userId'
    `);
    const results = [...cursor];
    if (results.length > 0) {
      this.userId = results[0].value as string;
    }
  }

  private async addMessage(
    role: 'user' | 'assistant' | 'system',
    content: string,
    userId: string
  ): Promise<Response> {
    // Set userId if not already set
    if (!this.userId) {
      this.userId = userId;
      this.sql.exec(`
        INSERT OR REPLACE INTO conversation_metadata (key, value, updated_at)
        VALUES ('userId', ?, CURRENT_TIMESTAMP)
      `, userId);
    }

    // Insert new message
    const timestamp = Date.now();
    this.sql.exec(`
      INSERT INTO conversation_messages (role, content, timestamp)
      VALUES (?, ?, ?)
    `, role, content, timestamp);

    // Enforce MAX_MESSAGES limit by deleting oldest messages
    this.sql.exec(`
      DELETE FROM conversation_messages
      WHERE id IN (
        SELECT id FROM conversation_messages
        ORDER BY timestamp DESC
        LIMIT -1 OFFSET ?
      )
    `, this.MAX_MESSAGES);

    // Get current message count
    const countCursor = this.sql.exec(`
      SELECT COUNT(*) as count FROM conversation_messages
    `);
    const countResults = [...countCursor];
    const messageCount = countResults.length > 0 ? (countResults[0].count as number) : 0;

    return new Response(JSON.stringify({ success: true, messageCount }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  private async getHistory(): Promise<Response> {
    const cursor = this.sql.exec(`
      SELECT role, content, timestamp
      FROM conversation_messages
      ORDER BY timestamp ASC
    `);

    const messages: Message[] = [...cursor].map((row) => ({
      role: row.role as 'user' | 'assistant' | 'system',
      content: row.content as string,
      timestamp: row.timestamp as number,
    }));

    return new Response(JSON.stringify({ messages }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  private async clearHistory(): Promise<Response> {
    this.sql.exec(`DELETE FROM conversation_messages`);

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
