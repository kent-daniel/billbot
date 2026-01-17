// Script to register Discord slash commands
import 'dotenv/config';

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const DISCORD_APPLICATION_ID = process.env.DISCORD_APPLICATION_ID;

const commands = [
  {
    name: 'chat',
    description: 'Chat with the AI bot',
    options: [
      {
        name: 'message',
        description: 'Your message to the bot',
        type: 3, // STRING type
        required: true,
      },
    ],
  },
  {
    name: 'clear',
    description: 'Clear your conversation history',
  },
];

async function registerCommands() {
  const url = `https://discord.com/api/v10/applications/${DISCORD_APPLICATION_ID}/commands`;

  try {
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': `Bot ${DISCORD_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(commands),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to register commands: ${error}`);
    }

    const data = await response.json();
    console.log('✅ Successfully registered commands:');
    console.log(data);
  } catch (error) {
    console.error('❌ Error registering commands:', error);
    process.exit(1);
  }
}

registerCommands();
