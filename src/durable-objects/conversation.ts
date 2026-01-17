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
    // Simple messages table with only what we need
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        timestamp INTEGER NOT NULL
      )
    `);
  }

  private async addMessage(
    role: 'user' | 'assistant' | 'system',
    content: string,
    userId: string
  ): Promise<Response> {
    const timestamp = Date.now();
    
    // Insert the new message first
    this.sql.exec(
      `INSERT INTO messages (role, content, timestamp) VALUES (?, ?, ?)`,
      role,
      content,
      timestamp
    );

    // Then enforce rolling window by deleting old messages if we exceed MAX_MESSAGES
    const count = this.sql.exec(`SELECT COUNT(*) as count FROM messages`).one()?.count as number;
    if (count > this.MAX_MESSAGES) {
      const toDelete = count - this.MAX_MESSAGES;
      this.sql.exec(`
        DELETE FROM messages 
        WHERE id IN (
          SELECT id FROM messages 
          ORDER BY id ASC 
          LIMIT ?
        )
      `, toDelete);
    }

    console.log(`Added ${role} message. Total messages in history: ${count}`);

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  private async getHistory(): Promise<Response> {
    const cursor = this.sql.exec(`
      SELECT role, content, timestamp
      FROM messages
      ORDER BY id ASC
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
    this.sql.exec(`DELETE FROM messages`);

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
