import { Client, Events, GatewayIntentBits, Partials } from 'discord.js';
import express from 'express';
import { config } from './config.js';
import { onMessageCreate } from './handlers/messageCreate.js';

const client = new Client({
	intents: [
		GatewayIntentBits.Guilds,
		GatewayIntentBits.GuildMessages,
		GatewayIntentBits.MessageContent,
		GatewayIntentBits.DirectMessages,
	],
	partials: [Partials.Channel],
});

client.once(Events.ClientReady, (readyClient) => {
	console.log(`Ready! Logged in as ${readyClient.user.tag}`);
});

client.on(Events.MessageCreate, onMessageCreate);

client.login(config.DISCORD_TOKEN);

const app = express();
app.get('/', (_req, res) => {
	res.send('Hello World!');
});

const port = process.env.PORT || 8080;
app.listen(port, () => {
	console.log(`Server listening on port ${port}`);
});
