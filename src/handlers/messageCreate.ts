// Keep a queue of messages specific to each user.  this is used for context
// with the LLM.  We may want to use a thread level context instead of user

import { ChannelType, type Message, MessageFlags } from 'discord.js';
import { OpenAI } from 'openai';
import { config } from '../config.js';
import { FixedQueue } from '../fixedQueue.js';
import { splitMessage } from '../messageSplitter.js';
import { getApiStatus, toolsConfig } from '../tools/discordStatus.js';
import { getContext } from '../tools/rag.js';
const tools = [toolsConfig];

const openai = new OpenAI({ apiKey: config.OPENAI_API_KEY });

// level context in the future.
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
}

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
			content: `You are an assistant that answers questions specific to the Discord API. 
	You should not answer questions about anything but Discord and it's 
	associated API, tools, and libraries. Use markdown for nicer formatting.
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
