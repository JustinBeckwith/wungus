import { Pinecone } from '@pinecone-database/pinecone';
import {
	ChannelType,
	Client,
	Events,
	GatewayIntentBits,
	type Message,
} from 'discord.js';
import { OpenAI } from 'openai';
import { config } from './config.js';

const openai = new OpenAI({ apiKey: config.OPENAI_API_KEY });
const pinecone = new Pinecone({ apiKey: config.PINECONE_API_KEY });

const client = new Client({
	intents: [
		GatewayIntentBits.Guilds,
		GatewayIntentBits.GuildMessages,
		GatewayIntentBits.MessageContent,
		GatewayIntentBits.DirectMessages,
	],
});

client.once(Events.ClientReady, (readyClient) => {
	console.log(`Ready! Logged in as ${readyClient.user.tag}`);
});

client.on(Events.MessageCreate, async (message: Message) => {
	let mentionsBot = false;
	for (const [userId] of message.mentions.users) {
		if (userId === client.user?.id) {
			mentionsBot = true;
			break;
		}
	}
	if (!mentionsBot) {
		return;
	}
	console.log(`Received message: ${message.content}`);

	if (message.channel.type === ChannelType.GuildText) {
		await message.channel.sendTyping();
	}

	const reply = await respondToQuestion(message.content);
	await message.reply(reply);
});

// Log in to Discord with your client's token
client.login(config.DISCORD_TOKEN);

async function respondToQuestion(question: string) {
	const retrievedDocs = await queryPinecone(question);
	console.log(retrievedDocs);

	const response = await openai.chat.completions.create({
		model: 'gpt-4',
		messages: [
			{
				role: 'system',
				content:
					"You are an assistant that answers questions specific to the Discord API. You should not answer questions about anything but Discord and it's associated API, tools, and libraries.",
			},
			{
				role: 'user',
				content: `Based on the following information:\n\n${retrievedDocs}\n\nAnswer this query: ${question}`,
			},
		],
	});

	return response.choices[0].message.content || '';
}

async function getEmbedding(text: string) {
	console.log(`Creating embedding for: ${text}`);
	const response = await openai.embeddings.create({
		model: 'text-embedding-ada-002',
		input: text,
	});
	return response.data[0].embedding;
}

async function queryPinecone(userQuery: string) {
	const index = pinecone.Index(config.PINECONE_INDEX_NAME);
	const queryEmbedding = await getEmbedding(userQuery);
	const queryResponse = await index.query({
		vector: queryEmbedding,
		topK: 5,
		includeMetadata: true,
	});
	console.log(queryResponse);
	return queryResponse.matches.map((match) => match.metadata?.text).join('\n');
}
