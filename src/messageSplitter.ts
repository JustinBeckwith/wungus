import { config } from './config.js';

/**
 * This is total AI slop.  Someone smarter than me should rewrite it.
 * A good test prompt is "how would I write a bot in javascript, use a lot of examples and be very verbose"
 * Interesting edge cases include:
 * - A code block longer than 2k characters
 * - A single chunk of text with no returns larger than 2k characters
 * - A single chunk of text with no spaces larger than 2k characters
 * @param message
 * @returns
 */
export async function splitMessage(message: string) {
	const chunkedReply: string[] = [];
	let remainingReply = message;
	const maxChunkSize = 2000;

	if (config.WUNGUS_DEBUG) {
		console.log(`Reply length: ${message.length}`);
	}

	if (message.length <= maxChunkSize) {
		return [message];
	}

	while (remainingReply.length > 0) {
		let chunk = remainingReply.slice(0, maxChunkSize);
		const lastSpaceIndex = chunk.lastIndexOf(' ');

		// Check for code block start and end
		const codeBlockStart = remainingReply.indexOf('```');
		const codeBlockEnd = remainingReply.indexOf('```', codeBlockStart + 3);

		if (codeBlockStart !== -1 && codeBlockStart < maxChunkSize) {
			// If a code block starts within the current chunk
			if (codeBlockEnd !== -1 && codeBlockEnd < maxChunkSize) {
				// If the code block also ends within the current chunk
				chunk = remainingReply.slice(0, codeBlockEnd + 3);
				// Attempt to add more text to the chunk after the code block
				const additionalText = remainingReply.slice(
					codeBlockEnd + 3,
					maxChunkSize,
				);
				const additionalSpaceIndex = additionalText.lastIndexOf(' ');
				if (additionalSpaceIndex !== -1) {
					chunk += additionalText.slice(0, additionalSpaceIndex + 1);
				} else {
					chunk += additionalText;
				}
			} else {
				// If the code block does not end within the current chunk
				chunk = remainingReply.slice(0, codeBlockStart);
			}
		} else if (
			remainingReply.length > maxChunkSize &&
			lastSpaceIndex > -1 &&
			lastSpaceIndex < maxChunkSize
		) {
			chunk = chunk.slice(0, lastSpaceIndex + 1);
		}

		chunkedReply.push(chunk);
		remainingReply = remainingReply.slice(chunk.length);
	}

	if (config.WUNGUS_DEBUG) {
		console.log(`Returning ${chunkedReply.length} chunks`);
	}

	return chunkedReply;
}
