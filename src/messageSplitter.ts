/**
 * Split a message into chunks of < 2000 characters. Try to not break code blocks.
 * @param message The message to split
 * @param options Optional configuration
 * @param options.incomplete If true, don't close code blocks at the end (for streaming)
 * @returns A tuple of [firstChunk, remainingChunks[]]
 */
export function splitMessage(
	message: string,
	options?: { incomplete?: boolean },
): [string, string[]] {
	const incomplete = options?.incomplete ?? false;
	const MAX_LENGTH = 2000;
	const chunks: string[] = [];
	let currentChunk = '';
	let inCodeBlock = false;
	const lines = message.split('\n');

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];

		// Track code block state - check for ``` at the start of a line (with optional language)
		if (line.trimStart().startsWith('```')) {
			inCodeBlock = !inCodeBlock;
		}

		// Determine the separator (no leading newline for first line of chunk)
		const separator = currentChunk === '' ? '' : '\n';
		const potentialChunk = currentChunk + separator + line;

		// If adding this line would exceed the limit
		if (potentialChunk.length > MAX_LENGTH) {
			// Special case: if current chunk is empty and this single line is too long
			if (currentChunk === '') {
				// Force split the long line at word boundaries
				const splitLines = splitLongLine(line, MAX_LENGTH);
				// Push all but the last segment as complete chunks
				for (let j = 0; j < splitLines.length - 1; j++) {
					chunks.push(splitLines[j]);
				}
				// Keep the last segment as current chunk
				currentChunk = splitLines[splitLines.length - 1];
			}
			// Special case: if the current line itself is too long, need to flush current and split this line
			else if (line.length > MAX_LENGTH) {
				// Push current chunk first
				chunks.push(currentChunk);
				// Then split this long line
				const splitLines = splitLongLine(line, MAX_LENGTH);
				for (let j = 0; j < splitLines.length - 1; j++) {
					chunks.push(splitLines[j]);
				}
				currentChunk = splitLines[splitLines.length - 1];
			}
			// If we're in a code block, we need to close it before splitting
			else if (inCodeBlock) {
				// Close the code block in current chunk
				currentChunk += '\n```';
				chunks.push(currentChunk);
				// Start new chunk with code block opening
				// Try to infer the language from the opening marker
				const codeBlockStart = findCodeBlockStart(lines, i);
				currentChunk = `${codeBlockStart}\n${line}`;
			}
			// Normal case: current chunk is complete, start a new one
			else {
				chunks.push(currentChunk);
				currentChunk = line;
			}
		} else {
			// Line fits in current chunk
			currentChunk = potentialChunk;
		}
	}

	// Add any remaining content
	if (currentChunk.length > 0) {
		// If we ended in an open code block, close it (unless incomplete flag is set)
		if (inCodeBlock && !incomplete) {
			currentChunk += '\n```';
		}
		chunks.push(currentChunk);
	}

	// Return first chunk and remaining chunks
	return [chunks.shift() || '', chunks];
}

/**
 * Split a very long line (without newlines) into smaller chunks at word boundaries
 */
function splitLongLine(line: string, maxLength: number): string[] {
	const chunks: string[] = [];
	let remaining = line;

	while (remaining.length > maxLength) {
		// Try to split at a space
		let splitIndex = remaining.lastIndexOf(' ', maxLength);
		if (splitIndex === -1 || splitIndex < maxLength / 2) {
			// No good space found, split at max length
			splitIndex = maxLength;
		}
		chunks.push(remaining.substring(0, splitIndex));
		remaining = remaining.substring(splitIndex).trimStart();
	}

	if (remaining.length > 0) {
		chunks.push(remaining);
	}

	return chunks;
}

/**
 * Find the opening code block marker to determine the language
 */
function findCodeBlockStart(lines: string[], currentIndex: number): string {
	// Walk backwards to find the opening ```
	for (let i = currentIndex - 1; i >= 0; i--) {
		const line = lines[i].trimStart();
		if (line.startsWith('```')) {
			return line;
		}
	}
	// Default to plain code block
	return '```';
}
