import type { AnyThreadChannel } from 'discord.js';
import { config } from '../config.js';

export async function onThreadCreate(thread: AnyThreadChannel) {
	if (thread.parentId !== config.FORUM_CHANNEL_ID) {
		return;
	}

	const messages = await thread.messages.fetch({ limit: 1 });
	const message = messages.first();
	if (!message) {
		return;
	}
	thread.send({
		content:
			"👋 Hello there, this is wungus. I am a bot that can help you with your questions.  I'm working on a reply right now.",
	});

	console.log(`Thread created: ${thread.name}`);
}
