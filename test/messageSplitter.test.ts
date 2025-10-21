import assert from 'node:assert';
import { describe, it } from 'node:test';
import { splitMessage } from '../src/messageSplitter.js';

describe('messageSplitter', () => {
	it('should not split messages under 2000 characters', () => {
		const message = 'This is a short message that fits in one chunk.';
		const [first, rest] = splitMessage(message);

		assert.strictEqual(first, message);
		assert.strictEqual(rest.length, 0);
	});

	it('should split long messages at line boundaries', () => {
		const lines = Array(100).fill('This is a line of text.');
		const message = lines.join('\n');
		const [first, rest] = splitMessage(message);

		assert.ok(first.length <= 2000);
		assert.ok(rest.length > 0);
		for (const chunk of rest) {
			assert.ok(chunk.length <= 2000);
		}
	});

	it('should not break code blocks across chunks', () => {
		const codeBlock = `\`\`\`javascript\n${'function test() {\n'.repeat(100)}}\n\`\`\``;
		const message = `Here is some code:\n${codeBlock}\nThat was the code.`;
		const [first, rest] = splitMessage(message);

		// The code block should be in one chunk (may be split with closing/opening)
		const allChunks = [first, ...rest];

		// Each chunk should have balanced ``` markers (or have closing/opening at boundaries)
		for (let i = 0; i < allChunks.length; i++) {
			const chunk = allChunks[i];
			const backtickCount = (chunk.match(/```/g) || []).length;

			if (i === 0 && allChunks.length > 1) {
				// First chunk might end with closing ```
				assert.ok(backtickCount % 2 === 0 || chunk.trimEnd().endsWith('```'));
			} else if (i === allChunks.length - 1 && allChunks.length > 1) {
				// Last chunk might start with opening ```
				assert.ok(
					backtickCount % 2 === 0 || chunk.trimStart().startsWith('```'),
				);
			} else if (i > 0 && i < allChunks.length - 1) {
				// Middle chunks should have both closing and opening
				assert.ok(backtickCount % 2 === 0);
			}
		}
	});

	it('should preserve code block language identifiers', () => {
		const message = `\`\`\`typescript\n${'const x: string = "hello";\n'.repeat(100)}\`\`\`\nSome text after`;

		const [first, rest] = splitMessage(message);
		const allChunks = [first, ...rest];

		// If split, continuation should also have typescript identifier
		for (const chunk of allChunks) {
			if (chunk.includes('```') && chunk.includes('const x:')) {
				assert.ok(chunk.includes('```typescript'));
			}
		}
	});

	it('should handle multiple code blocks in one message', () => {
		const message =
			'First block:\n```python\nprint("hello")\n```\n\n' +
			'Second block:\n```javascript\nconsole.log("world")\n```\n\n' +
			'Third block:\n```bash\necho "test"\n```';

		const [first, rest] = splitMessage(message);

		// Should not break (it's short enough)
		assert.strictEqual(rest.length, 0);
		assert.strictEqual(first, message);
	});

	it('should handle code blocks that must be split', () => {
		// Create a code block that's definitely over 2000 chars
		const longCode = 'x'.repeat(500);
		const lines = Array(10).fill(`const line = "${longCode}";`).join('\n');
		const message = `Here's the code:\n\`\`\`javascript\n${lines}\n\`\`\`\nEnd of code.`;

		const [first, rest] = splitMessage(message);
		const allChunks = [first, ...rest];

		// Verify each chunk is under limit
		for (const chunk of allChunks) {
			assert.ok(chunk.length <= 2000);
		}

		// If split happened, verify code blocks are properly closed/opened
		if (rest.length > 0) {
			// First chunk should end with ```
			assert.ok(first.trimEnd().endsWith('```'));

			// Middle chunks should start and end with ```
			for (let i = 0; i < rest.length - 1; i++) {
				const chunk = rest[i];
				assert.ok(chunk.trimStart().startsWith('```'));
				assert.ok(chunk.trimEnd().endsWith('```'));
			}

			// Last chunk might start with ``` if still in code block
			const lastChunk = rest[rest.length - 1];
			const firstHasOpeningBlock = first.includes('```javascript');
			if (firstHasOpeningBlock) {
				assert.ok(lastChunk.includes('```'));
			}
		}
	});

	it('should handle nested markdown structures', () => {
		const message =
			'Here is a [link with `code` inside](https://example.com)\n' +
			'And **bold text with `more code`** too.\n' +
			'Plus *italic with [nested link](https://test.com)* for good measure.';

		const [first, rest] = splitMessage(message);

		// Should not split (short message)
		assert.strictEqual(first, message);
		assert.strictEqual(rest.length, 0);
	});

	it('should handle very long lines without newlines', () => {
		const longLine = 'x'.repeat(3000);
		const message = `Before\n${longLine}\nAfter`;

		const [first, rest] = splitMessage(message);
		const allChunks = [first, ...rest];

		// Should split the long line
		assert.ok(rest.length > 0);

		// Each chunk should be under limit
		for (const chunk of allChunks) {
			assert.ok(chunk.length <= 2000);
		}
	});

	it('should handle message that starts with code block', () => {
		const message = `\`\`\`python\n${'def hello():\n'.repeat(100)}    print("world")\n\`\`\``;

		const [first, rest] = splitMessage(message);
		const allChunks = [first, ...rest];

		// Verify all chunks are under limit
		for (const chunk of allChunks) {
			assert.ok(chunk.length <= 2000);
		}

		// First chunk should start with ```python
		assert.ok(first.trimStart().startsWith('```python'));
	});

	it('should handle message that ends with code block', () => {
		const preamble = `Here is a long explanation: ${'word '.repeat(50)}`;
		const codeBlock = `\`\`\`javascript\n${'console.log("test");\n'.repeat(100)}\`\`\``;
		const message = `${preamble}\n${codeBlock}`;

		const [first, rest] = splitMessage(message);
		const allChunks = [first, ...rest];

		// Verify all chunks are under limit
		for (const chunk of allChunks) {
			assert.ok(chunk.length <= 2000);
		}

		// Last chunk should end with ```
		const lastChunk = allChunks[allChunks.length - 1];
		assert.ok(lastChunk.trimEnd().endsWith('```'));
	});

	it('should handle empty lines in code blocks', () => {
		const message =
			'```python\ndef test():\n    pass\n\n\ndef another():\n    pass\n```';

		const [first, rest] = splitMessage(message);

		// Should not split (short enough)
		assert.strictEqual(first, message);
		assert.strictEqual(rest.length, 0);
	});

	it('should reconstruct the original message when joined', () => {
		const message = 'Line 1\nLine 2\nLine 3\nLine 4';
		const [first, rest] = splitMessage(message);

		const reconstructed = [first, ...rest].join('\n');

		// For short messages, should be identical
		assert.strictEqual(reconstructed, message);
	});

	it('should handle message with inline code that is not a block', () => {
		const message =
			'Use `console.log()` to print. Or try `process.exit()` instead.';

		const [first, rest] = splitMessage(message);

		assert.strictEqual(first, message);
		assert.strictEqual(rest.length, 0);
	});

	it('should handle real-world Discord bot response scenario', () => {
		// Simulate a typical bot response with explanation + code
		const explanation = 'Here is how you can do it:\n\n';
		const codeExample =
			'```typescript\nimport { Client } from "discord.js";\n\n' +
			'const client = new Client({\n' +
			'  intents: ["Guilds", "GuildMessages"]\n' +
			'});\n\n' +
			'client.on("messageCreate", (message) => {\n' +
			'  console.log(message.content);\n' +
			'});\n```\n\n';
		const footer = 'This will log all messages to the console.';

		const message = explanation + codeExample + footer;
		const [first, rest] = splitMessage(message);

		// Should fit in one chunk
		assert.strictEqual(rest.length, 0);

		// Should preserve the exact content
		assert.strictEqual(first, message);
	});

	it('should handle edge case of exactly 2000 characters', () => {
		// Create a message that's exactly 2000 chars
		const line = 'x'.repeat(100);
		let message = '';
		while (message.length < 2000) {
			const remaining = 2000 - message.length;
			if (remaining < line.length + 1) {
				message += 'x'.repeat(remaining);
			} else {
				message += `${line}\n`;
			}
		}
		message = message.substring(0, 2000);

		const [first, rest] = splitMessage(message);

		assert.strictEqual(first.length, 2000);
		assert.strictEqual(rest.length, 0);
	});

	it('should properly close and reopen C++ code blocks when split', () => {
		// Create a large C++ code sample that will definitely need splitting
		const cppCode = `Here's how to do it in C++:

\`\`\`cpp
#include <iostream>
#include <string>

int main() {
${'    std::cout << "Line of code" << std::endl;\n'.repeat(80)}
    return 0;
}
\`\`\`

That should work for you.`;

		const [first, rest] = splitMessage(cppCode);
		const allChunks = [first, ...rest];

		// Should have multiple chunks
		assert.ok(rest.length > 0, 'Should split into multiple chunks');

		// First chunk should end with ```
		assert.ok(
			first.trimEnd().endsWith('```'),
			`First chunk should end with closing backticks. Actual ending: "${first.slice(-20)}"`,
		);

		// If there are continuation chunks, they should start with ```cpp
		for (let i = 0; i < rest.length; i++) {
			const chunk = rest[i];

			// If this chunk contains code (not just the closing text), it should start with ```cpp
			if (chunk.includes('std::cout') || chunk.includes('return 0')) {
				assert.ok(
					chunk.trimStart().startsWith('```cpp') ||
						chunk.trimStart().startsWith('```c++'),
					`Chunk ${i + 1} should start with \`\`\`cpp or \`\`\`c++. Actual start: "${chunk.slice(0, 20)}"`,
				);
			}

			// Each chunk should be under 2000 chars
			assert.ok(chunk.length <= 2000, `Chunk ${i + 1} exceeds 2000 characters`);
		}

		// Last chunk should end with ``` (the closing of the code block)
		const lastChunk = allChunks[allChunks.length - 1];
		assert.ok(
			lastChunk.includes('```'),
			'Last chunk should contain closing backticks',
		);
	});
});
