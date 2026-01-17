import { Google } from 'arctic';

export interface TokenData {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

// Durable Object RPC Actions
type DOAction =
  | { action: 'store'; accessToken: string; refreshToken: string; expiresIn: number; userId: string }
  | { action: 'get' }
  | { action: 'refreshIfNeeded' };

export interface OAuthEnv {
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  GOOGLE_REDIRECT_URI: string;
}

export class OAuthTokensDO implements DurableObject {
  private state: DurableObjectState;
  private sql: SqlStorage;
  private env: OAuthEnv;
  private initialized: boolean = false;

  constructor(state: DurableObjectState, env: OAuthEnv) {
    this.state = state;
    this.sql = state.storage.sql;
    this.env = env;
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
        case 'store':
          return await this.storeTokens(
            payload.accessToken,
            payload.refreshToken,
            payload.expiresIn,
            payload.userId
          );

        case 'get':
          return await this.getTokens();

        case 'refreshIfNeeded':
          return await this.refreshIfNeeded();

        default:
          return new Response(JSON.stringify({ error: 'Unknown action' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          });
      }
    } catch (error) {
      return new Response(
        JSON.stringify({ 
          error: 'Invalid request',
          details: error instanceof Error ? error.message : String(error)
        }), 
        { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
  }

  private async initializeTables(): Promise<void> {
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS tokens (
        user_id TEXT PRIMARY KEY,
        access_token TEXT NOT NULL,
        refresh_token TEXT NOT NULL,
        expires_at INTEGER NOT NULL
      )
    `);
  }

  private async storeTokens(
    accessToken: string,
    refreshToken: string,
    expiresIn: number,
    userId: string
  ): Promise<Response> {
    try {
      // Calculate expiration timestamp (expiresIn is in seconds)
      const expiresAt = Date.now() + (expiresIn * 1000);

      // Use INSERT OR REPLACE to handle both new and existing tokens
      this.sql.exec(
        `INSERT OR REPLACE INTO tokens (user_id, access_token, refresh_token, expires_at)
         VALUES (?, ?, ?, ?)`,
        userId,
        accessToken,
        refreshToken,
        expiresAt
      );

      return new Response(
        JSON.stringify({ 
          success: true,
          expiresAt
        }), 
        {
          headers: { 'Content-Type': 'application/json' },
        }
      );
    } catch (error) {
      return new Response(
        JSON.stringify({ 
          error: 'Failed to store tokens',
          details: error instanceof Error ? error.message : String(error)
        }), 
        { 
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
  }

  private async getTokens(): Promise<Response> {
    try {
      const cursor = this.sql.exec(`
        SELECT access_token, refresh_token, expires_at
        FROM tokens
        LIMIT 1
      `);

      const row = cursor.one();

      if (!row) {
        return new Response(
          JSON.stringify({ 
            error: 'No tokens found' 
          }), 
          { 
            status: 404,
            headers: { 'Content-Type': 'application/json' }
          }
        );
      }

      const tokenData: TokenData = {
        accessToken: row.access_token as string,
        refreshToken: row.refresh_token as string,
        expiresAt: row.expires_at as number,
      };

      return new Response(JSON.stringify(tokenData), {
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (error) {
      return new Response(
        JSON.stringify({ 
          error: 'Failed to retrieve tokens',
          details: error instanceof Error ? error.message : String(error)
        }), 
        { 
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
  }

  private async refreshIfNeeded(): Promise<Response> {
    try {
      // Get current tokens
      const cursor = this.sql.exec(`
        SELECT access_token, refresh_token, expires_at
        FROM tokens
        LIMIT 1
      `);

      const row = cursor.one();

      if (!row) {
        return new Response(
          JSON.stringify({ 
            error: 'No tokens found to refresh' 
          }), 
          { 
            status: 404,
            headers: { 'Content-Type': 'application/json' }
          }
        );
      }

      const expiresAt = row.expires_at as number;
      const now = Date.now();
      
      // Add 5 minute buffer - refresh if token expires within 5 minutes
      const bufferMs = 5 * 60 * 1000;
      const needsRefresh = expiresAt - now < bufferMs;

      if (!needsRefresh) {
        // Token is still valid, return existing tokens
        const tokenData: TokenData = {
          accessToken: row.access_token as string,
          refreshToken: row.refresh_token as string,
          expiresAt: expiresAt,
        };

        return new Response(
          JSON.stringify({ 
            ...tokenData,
            refreshed: false 
          }), 
          {
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }

      // Token needs refresh - use Arctic to refresh
      const google = new Google(
        this.env.GOOGLE_CLIENT_ID,
        this.env.GOOGLE_CLIENT_SECRET,
        this.env.GOOGLE_REDIRECT_URI
      );

      const refreshToken = row.refresh_token as string;
      
      // Arctic's validateAuthorizationCode returns tokens object
      // For refresh, we need to use the refresh token directly with Google's API
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: this.env.GOOGLE_CLIENT_ID,
          client_secret: this.env.GOOGLE_CLIENT_SECRET,
          refresh_token: refreshToken,
          grant_type: 'refresh_token',
        }),
      });

      if (!tokenResponse.ok) {
        const errorData = await tokenResponse.json();
        return new Response(
          JSON.stringify({ 
            error: 'Token refresh failed',
            details: errorData
          }), 
          { 
            status: tokenResponse.status,
            headers: { 'Content-Type': 'application/json' }
          }
        );
      }

      const tokens = await tokenResponse.json() as {
        access_token: string;
        expires_in: number;
        refresh_token?: string;
      };

      // Update tokens in database
      // Note: Google may or may not return a new refresh token
      const newRefreshToken = tokens.refresh_token || refreshToken;
      const newExpiresAt = Date.now() + (tokens.expires_in * 1000);

      this.sql.exec(
        `UPDATE tokens 
         SET access_token = ?, refresh_token = ?, expires_at = ?
         WHERE user_id = (SELECT user_id FROM tokens LIMIT 1)`,
        tokens.access_token,
        newRefreshToken,
        newExpiresAt
      );

      const tokenData: TokenData = {
        accessToken: tokens.access_token,
        refreshToken: newRefreshToken,
        expiresAt: newExpiresAt,
      };

      return new Response(
        JSON.stringify({ 
          ...tokenData,
          refreshed: true 
        }), 
        {
          headers: { 'Content-Type': 'application/json' },
        }
      );
    } catch (error) {
      return new Response(
        JSON.stringify({ 
          error: 'Token refresh failed',
          details: error instanceof Error ? error.message : String(error)
        }), 
        { 
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
  }
}
