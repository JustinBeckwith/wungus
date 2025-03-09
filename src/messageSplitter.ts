/**
 * Split a message into chunks of < 2000 characters. Try to not break code blocks.
 */
export function splitMessage(message: string): [string, string[]] {
	let openCodeBlock = false;
	let chunk = '';
	const remainder: string[] = [];
	const lines = message.split('\n');

	for (const line of lines) {
		// Count number of ``` occurrences in the line
		const codeBlockMarkers = (line.match(/```/g) || []).length;
		// Each odd occurrence toggles the state
		if (codeBlockMarkers % 2 === 1) {
			openCodeBlock = !openCodeBlock;
		}
		// If even number of ``` in line, state remains the same

		if (`${chunk}\n${line}`.length > 2000) {
			if (openCodeBlock) {
				remainder.push(line);
			} else {
				remainder.push(`${chunk}\n${line}`);
				chunk = '';
			}
		} else {
			chunk += `\n${line}`;
		}
	}

	if (chunk.length > 0) {
		remainder.push(chunk);
	}

	return [remainder.shift() || '', remainder];
}
