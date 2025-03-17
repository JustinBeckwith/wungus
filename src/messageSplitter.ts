/**
 * Split a message into chunks of < 2000 characters. Try to not break code blocks.
 */
export function splitMessage(message: string): [string, string[]] {
	let openCodeBlock = false;
	let chunk = '';
	let pendingChunk = '';
	const remainder: string[] = [];
	const lines = message.split('\n');

	for (const line of lines) {
		// Count number of ``` occurrences in the line
		const codeBlockMarkers = (line.match(/```/g) || []).length;
		// Each odd occurrence toggles the state
		if (codeBlockMarkers % 2 === 1) {
			openCodeBlock = !openCodeBlock;
		}

		// Check if current chunk + line would exceed limit
		const potentialChunk = `${chunk}\n${line}`;

		if (potentialChunk.length > 2000) {
			// If we're in a code block or have pending markdown, add to pending
			if (openCodeBlock || isIncompleteMarkdown(chunk)) {
				pendingChunk += `\n${line}`;
			} else {
				// If we have pending content, add it first
				if (pendingChunk) {
					remainder.push(chunk + pendingChunk);
					pendingChunk = '';
				} else {
					remainder.push(chunk);
				}
				chunk = line;
			}
		} else {
			// If we have pending content, keep accumulating
			if (pendingChunk) {
				pendingChunk += `\n${line}`;
				// Check if pending content is now complete
				if (!isIncompleteMarkdown(pendingChunk) && !openCodeBlock) {
					chunk += pendingChunk;
					pendingChunk = '';
				}
			} else {
				chunk += `\n${line}`;
			}
		}
	}

	// Handle any remaining content
	if (pendingChunk) {
		chunk += pendingChunk;
	}
	if (chunk.length > 0) {
		remainder.push(chunk);
	}

	return [remainder.shift() || '', remainder];
}

function isIncompleteMarkdown(text: string): boolean {
	const openBrackets =
		(text.match(/\[/g) || []).length - (text.match(/\]/g) || []).length;
	const openParens =
		(text.match(/\(/g) || []).length - (text.match(/\)/g) || []).length;
	const openBackticks = (text.match(/`/g) || []).length % 2 === 1;

	return openBrackets > 0 || openParens > 0 || openBackticks;
}
