import {
	Client,
	Events,
	GatewayIntentBits,
	type Message,
	MessageFlags,
} from 'discord.js';
import express from 'express';
import { OpenAI } from 'openai';
import { config } from './config.js';
import { FixedQueue } from './fixedQueue.js';
import { splitMessage } from './messageSplitter.js';
import { getApiStatus, toolsConfig } from './tools/discordStatus.js';
import { getContext } from './tools/rag.js';

const openai = new OpenAI({ apiKey: config.OPENAI_API_KEY });

const tools = [toolsConfig];

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

// Keep a queue of messages specific to each user.  this is used for context
// with the LLM.  We may want to use a thread level context instead of user
// level context in the future.
const messages = new Map<string, FixedQueue>();

// Right now this works by listening to every message, and only responding when
// @wungus is specifically mentioned.  In the future it could get smarter and
// directly engage in the conversation without being summoned.
client.on(Events.MessageCreate, async (message: Message) => {
	// Don't respond to our own messages
	if (message.author.id === client.user?.id) {
		return;
	}

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
	const messageList = messages.get(message.author.id) || new FixedQueue(5);
	messageList.push(message.content);
	messages.set(message.author.id, messageList);

	// Not sure sure of this code, but it looks like `sendTyping` times out after a while,
	// and without a loop it would send once then timeout.
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
	const chunkedReply = await splitMessage(reply);

	let lastMessage = message;
	for (const chunk of chunkedReply) {
		const replyMessage = await lastMessage.reply({
			content: chunk,
			flags: MessageFlags.SuppressEmbeds,
		});
		lastMessage = replyMessage;
	}
	typing = false;
});

/**
 * This is where the magic happens.  This will:
 * - Create embeddings for the question, and use that to query pinecone for similar results
 * - Include chunks from pinecone as context in the query
 * - Include history in the query
 * - Call the LLM with the above context
 */
async function respondToQuestion(
	question: string,
	previousMessages: FixedQueue,
) {
	// Pull context from pinecone (ragtime)
	const { context, urls } = await getContext(question);
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
				"You are an assistant that answers questions specific to the Discord API. You should not answer questions about anything but Discord and it's associated API, tools, and libraries. If someone says 'bot', assume they may also be talking about an 'app'.  Include urls where possible to resources.  Use markdown for nicer formatting.",
		},
		{
			role: 'system',
			content: `Relevant information retrieved: ${context}`,
		},
		...history,
	];
	if (config.WUNGUS_DEBUG) {
		console.log(JSON.stringify(messages, null, 2));
	}
	const response = await openai.chat.completions.create({
		model: 'gpt-4',
		messages,
		tools,
		tool_choice: 'auto',
	});
	let answer = response.choices[0].message.content || '';

	// If the LLM calls a tool, handle it here.  Right now it's only the Discord API status.
	if (response.choices[0].message.tool_calls) {
		for (const toolCall of response.choices[0].message.tool_calls) {
			if (toolCall.function.name === 'get_api_status') {
				const status = await getApiStatus();
				if (status) {
					answer = `${answer} 
Discord API Status: ${status.status.description}
Last Updated: ${status.page.updated_at}`;
				} else {
					answer = `${answer} \n\nUnable to fetch Discord API status at this time.`;
				}
			}
		}
	}

	// Add the assistant's answer to the history
	history.push({
		role: 'assistant',
		content: answer,
	});

	answer += `\n\nTo learn more, read:\n${urls}`;
	return answer;
}

client.login(config.DISCORD_TOKEN);

const app = express();
app.get('/', (_req, res) => {
	res.send('Hello World!');
});

const port = process.env.PORT || 8080;
app.listen(port, () => {
	console.log(`Server listening on port ${port}`);
});
