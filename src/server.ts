import { Pinecone } from '@pinecone-database/pinecone';
import {
	ChannelType,
	Client,
	Events,
	GatewayIntentBits,
	type Message,
	MessageFlags,
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

	let typing = true;
	const typingLoop = async () => {
		while (typing) {
			if ('sendTyping' in message.channel) {
				await message.channel.sendTyping();
				await new Promise((resolve) => setTimeout(resolve, 5000));
			}
		}
	};
	typingLoop();

	const reply = await respondToQuestion(message.content);
	await message.reply({
		content: reply,
		flags: MessageFlags.SuppressEmbeds,
	});
	typing = false;
});

client.login(config.DISCORD_TOKEN);

async function respondToQuestion(question: string) {
	const retrievedDocs = await queryPinecone(question);
	const context = retrievedDocs.map((match) => match.metadata?.text).join('\n');
	const urls = retrievedDocs
		.filter((doc) => !!doc.metadata?.url)
		.map((doc) => `-# - ${doc.metadata?.url}`)
		.join('\n');
	console.log(urls);
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
				content: `Based on the following information:\n\n${context}\n\nAnswer this query: ${question}`,
			},
		],
	});
	const answer = `${response.choices[0].message.content || ''}\n\nTo learn more, read:\n${urls}`;
	return answer;
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
	return queryResponse.matches;
}
