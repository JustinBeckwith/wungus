import {
	type Channel,
	ChannelType,
	type Message,
	MessageFlags,
} from 'discord.js';
import { OpenAI } from 'openai';
import { config } from '../config.js';
import { FixedQueue } from '../fixedQueue.js';
import { splitMessage } from '../messageSplitter.js';
import { getApiStatus, toolsConfig } from '../tools/discordStatus.js';
import { getContext } from '../tools/rag.js';
const tools = [toolsConfig];

const openai = new OpenAI({ apiKey: config.OPENAI_API_KEY });

const userMessages = new Map<string, FixedQueue>();
const threadMessages = new Map<string, FixedQueue>();

// Right now this works by listening to every message, and only responding when
// @wungus is specifically mentioned.  In the future it could get smarter and
// directly engage in the conversation without being summoned.
export async function onMessageCreate(message: Message) {
	// don't respond to bots
	if (message.author.bot) return;

	let shouldRespond = false;
	let messageList: FixedQueue | undefined = undefined;
	if (message.channel.type === ChannelType.PublicThread) {
		if (config.FORUM_CHANNEL_ID === message.channel.parentId) {
			messageList = threadMessages.get(message.channelId) || new FixedQueue(5);
			messageList.push(message.content);
			threadMessages.set(message.channelId, messageList);
			shouldRespond = true;
		}
	} else if (message.channel.type === ChannelType.DM) {
		messageList = threadMessages.get(message.channelId) || new FixedQueue(5);
		messageList.push(message.content);
		threadMessages.set(message.channelId, messageList);
		shouldRespond = true;
	} else {
		// allow DMing with the bot, otherwise require it to be summoned
		messageList = userMessages.get(message.author.id) || new FixedQueue(5);
		let mentionsBot = false;
		for (const [userId] of message.mentions.users) {
			if (userId === message.client.user?.id) {
				messageList.push(message.content);
				userMessages.set(message.author.id, messageList);
				mentionsBot = true;
				break;
			}
		}
		shouldRespond = mentionsBot;
	}

	if (!shouldRespond) return;
	if (!messageList) return;

	// Not sure sure of this code, but it looks like `sendTyping` times out after a while,
	// and without a loop it would send once then timeout.
	let typing = true;
	const typingLoop = async () => {
		while (typing) {
			if ('sendTyping' in message.channel) {
				await message.channel.sendTyping();
				await new Promise((resolve) => setTimeout(resolve, 3000));
			}
		}
	};
	typingLoop();

	const { context, urls } = await getContext(message.content);
	const urlString = Array.from(urls)
		.slice(0, 5)
		.map((url) => `- -# ${url}`)
		.join('\n');

	let lastMessage = await message.reply({
		content: `👋 Hello there, this is wungus. I am a bot that can help you with your questions.  I'm working on a reply right now.  In the meantime, here are a few resources you can read!\n${urlString}`,
		flags: MessageFlags.SuppressEmbeds,
	});

	const history = messageList.toArray().map((message) => {
		return {
			role: 'user',
			content: message,
		} as OpenAI.Chat.Completions.ChatCompletionMessageParam;
	});

	const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
		{
			role: 'system',
			content: `You are an assistant that answers questions specific to the Discord API. 
	You should not answer questions about anything but Discord and it's 
	associated API, tools, and libraries. Use markdown for nicer formatting.
	Include many links to samples or resources.
	Return a verbose result with formatting and code samples.
	You should be friendly, and have a little whimsy.`,
		},
		{
			role: 'system',
			content: `Relevant information retrieved: ${context}`,
		},
		...history,
	];

	const response = await openai.chat.completions.create({
		model: 'gpt-4',
		messages,
		tools,
		tool_choice: 'auto',
		stream: true,
	});

	let chunkWindow: string[] = [];
	const fullMessage: string[] = [];

	for await (const chunk of response) {
		let answer = chunk.choices[0]?.delta?.content || '';

		// If the LLM calls a tool, handle it here.  Right now it's only the Discord API status.
		if (chunk.choices[0]?.delta?.tool_calls) {
			for (const toolCall of chunk.choices[0].delta.tool_calls) {
				if (toolCall.function?.name === 'get_api_status') {
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
		chunkWindow.push(answer);
		fullMessage.push(answer);

		if (chunkWindow.join('').length > 2000) {
			// Use incomplete flag to prevent closing code blocks in the last chunk (we're still streaming)
			const [content, remainder] = splitMessage(chunkWindow.join(''), {
				incomplete: true,
			});

			lastMessage = await lastMessage.reply({
				content,
				flags: MessageFlags.SuppressEmbeds,
			});

			// Send all but the last remainder chunk
			for (let i = 0; i < remainder.length - 1; i++) {
				lastMessage = await lastMessage.reply({
					content: remainder[i],
					flags: MessageFlags.SuppressEmbeds,
				});
			}

			// Keep the last remainder chunk in the window if it exists (it may be incomplete)
			if (remainder.length > 0) {
				chunkWindow = [remainder[remainder.length - 1]];
			} else {
				chunkWindow = [];
			}
		}
	}

	typing = false;

	// flush the last message
	if (chunkWindow.length > 0) {
		lastMessage = await lastMessage.reply({
			content: chunkWindow.join(''),
			flags: MessageFlags.SuppressEmbeds,
		});
	}

	// Add the assistant's answer to the history
	history.push({
		role: 'assistant',
		content: fullMessage.join(''),
	});
}
