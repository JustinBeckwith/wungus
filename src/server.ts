import { Pinecone } from '@pinecone-database/pinecone';
import {
	Client,
	Events,
	GatewayIntentBits,
	type Message,
	MessageFlags,
} from 'discord.js';
import fetch from 'node-fetch';
import { OpenAI } from 'openai';
import { config } from './config.js';
import { FixedQueue } from './fixedQueue.js';

const openai = new OpenAI({ apiKey: config.OPENAI_API_KEY });
const tools = [
	{
		type: 'function' as const,
		function: {
			name: 'get_api_status',
			description: 'Get the status of the Discord API.',
			parameters: {
				type: 'object',
				properties: {},
				required: [],
				additionalProperties: false,
			},
			strict: true,
		},
	},
];

interface DiscordStatusResponse {
	page: {
		id: string;
		name: string;
		url: string;
		time_zone: string;
		updated_at: string;
	};
	status: {
		indicator: string;
		description: string;
	};
}
async function getApiStatus(): Promise<DiscordStatusResponse | null> {
	try {
		const response = await fetch(
			'https://discordstatus.com/api/v2/status.json',
		);
		const data: DiscordStatusResponse = await response.json();
		return data;
	} catch (error) {
		console.error('Error fetching Discord API status:', error);
		return null;
	}
}

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

const messages = new Map<string, FixedQueue>();

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
	const messageList = messages.get(message.author.id) || new FixedQueue(5);
	messageList.push(message.content);
	messages.set(message.author.id, messageList);

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

	const reply = await respondToQuestion(message.content, messageList);
	await message.reply({
		content: reply,
		flags: MessageFlags.SuppressEmbeds,
	});
	typing = false;
});

client.login(config.DISCORD_TOKEN);

async function respondToQuestion(
	question: string,
	previousMessages: FixedQueue,
) {
	const retrievedDocs = await queryPinecone(question);
	const context = retrievedDocs.map((match) => match.metadata?.text).join('\n');
	const urls = retrievedDocs
		.filter((doc) => !!doc.metadata?.url)
		.map((doc) => `-# - ${doc.metadata?.url}`)
		.join('\n');
	const history = previousMessages.toArray().map((message) => {
		return {
			role: 'user',
			content: message,
		} as OpenAI.Chat.Completions.ChatCompletionMessageParam;
	});
	const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
		{
			role: 'system',
			content:
				"You are an assistant that answers questions specific to the Discord API. You should not answer questions about anything but Discord and it's associated API, tools, and libraries.",
		},
		{
			role: 'system',
			content: `Relevant information retrieved: ${context}`,
		},
		...history,
	];
	console.log(JSON.stringify(messages, null, 2));
	const response = await openai.chat.completions.create({
		model: 'gpt-4',
		messages,
		tools,
		tool_choice: 'auto',
	});
	let answer = response.choices[0].message.content || '';

	if (response.choices[0].message.tool_calls) {
		for (const toolCall of response.choices[0].message.tool_calls) {
			if (toolCall.function.name === 'get_api_status') {
				const status = await getApiStatus();
				if (status) {
					answer = `${answer} 
\n\nDiscord API Status:\n 
Status: ${status.status.description}\n 
Last Updated: ${status.page.updated_at};
						`;
				} else {
					answer = `${answer} \n\nUnable to fetch Discord API status at this time.`;
				}
			}
		}
	}

	answer += `\n\nTo learn more, read:\n${urls}`;
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
