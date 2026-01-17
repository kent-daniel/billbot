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
  private messages: Message[] = [];
  private userId: string = '';
  private readonly MAX_MESSAGES = 50;

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    // Initialize from storage on first request
    if (this.messages.length === 0) {
      await this.loadFromStorage();
    }

    try {
      const payload = await request.json<DOAction>();

      switch (payload.action) {
        case 'add':
          return await this.addMessage(payload.role, payload.content, payload.userId);

        case 'getHistory':
          return this.getHistory();

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

  private async loadFromStorage(): Promise<void> {
    const stored = await this.state.storage.get<ConversationState>('conversation');
    if (stored) {
      this.messages = stored.messages;
      this.userId = stored.userId;
    }
  }

  private async saveToStorage(): Promise<void> {
    const state: ConversationState = {
      messages: this.messages,
      userId: this.userId,
      lastUpdated: Date.now(),
    };
    await this.state.storage.put('conversation', state);
  }

  private async addMessage(
    role: 'user' | 'assistant' | 'system',
    content: string,
    userId: string
  ): Promise<Response> {
    if (!this.userId) {
      this.userId = userId;
    }

    const message: Message = {
      role,
      content,
      timestamp: Date.now(),
    };

    this.messages.push(message);

    // Keep only last 50 messages
    if (this.messages.length > this.MAX_MESSAGES) {
      this.messages = this.messages.slice(-this.MAX_MESSAGES);
    }

    await this.saveToStorage();

    return new Response(JSON.stringify({ success: true, messageCount: this.messages.length }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  private getHistory(): Response {
    return new Response(JSON.stringify({ messages: this.messages }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  private async clearHistory(): Promise<Response> {
    this.messages = [];
    await this.saveToStorage();

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
