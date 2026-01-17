export interface DiscordMessage {
  id: string;
  channel_id: string;
  author: {
    id: string;
    username: string;
    discriminator: string;
    bot?: boolean;
  };
  content: string;
  timestamp: string;
}

export interface DiscordInteraction {
  type: number;
  data?: {
    name?: string;
    options?: any[];
  };
  guild_id?: string;
  channel_id?: string;
  member?: {
    user: {
      id: string;
      username: string;
    };
  };
  user?: {
    id: string;
    username: string;
  };
  token: string;
  message?: DiscordMessage;
}

export enum DiscordInteractionType {
  PING = 1,
  APPLICATION_COMMAND = 2,
  MESSAGE_COMPONENT = 3,
  APPLICATION_COMMAND_AUTOCOMPLETE = 4,
  MODAL_SUBMIT = 5,
}
