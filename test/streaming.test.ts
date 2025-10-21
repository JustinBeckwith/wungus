import assert from 'node:assert';
import { describe, it } from 'node:test';
import { splitMessage } from '../src/messageSplitter.js';

describe('streaming message behavior', () => {
	it('should simulate the Discord streaming scenario correctly', () => {
		// Simulate what happens in the actual Discord handler:
		// 1. Chunks accumulate in a window
		// 2. When window > 2000, we split and send
		// 3. Continue accumulating new chunks

		let chunkWindow: string[] = [];
		const sentMessages: string[] = [];

		// Simulate streaming chunks that build up a large C++ code sample
		const streamingChunks = [
			'Here is how you can ',
			'do it in C++:\n\n',
			'```cpp\n',
			'#include <iostream>\n',
			'#include <string>\n\n',
			'int main() {\n',
		];

		// Add 100 lines of code to make it definitely over 2000 chars
		for (let i = 0; i < 100; i++) {
			streamingChunks.push(`    std::cout << "Line ${i}" << std::endl;\n`);
		}

		streamingChunks.push(
			'    return 0;\n',
			'}\n',
			'```\n\n',
			'That should work!',
		);

		// Simulate the streaming loop
		for (const chunk of streamingChunks) {
			chunkWindow.push(chunk);

			// Check if we need to split (same logic as messageCreate.ts)
			if (chunkWindow.join('').length > 2000) {
				const [content, remainder] = splitMessage(chunkWindow.join(''), {
					incomplete: true,
				});

				// Send first message
				sentMessages.push(content);

				// Send all but the last remainder chunk
				for (let i = 0; i < remainder.length - 1; i++) {
					sentMessages.push(remainder[i]);
				}

				// Keep the last remainder chunk in the window if it exists (it may be incomplete)
				if (remainder.length > 0) {
					chunkWindow = [remainder[remainder.length - 1]];
				} else {
					chunkWindow = [];
				}
			}
		}

		// Flush remaining
		if (chunkWindow.length > 0) {
			const remaining = chunkWindow.join('');
			// If remaining is large, split it too
			if (remaining.length > 2000) {
				const [content, remainder] = splitMessage(remaining);
				sentMessages.push(content);
				for (const chunk of remainder) {
					sentMessages.push(chunk);
				}
			} else {
				sentMessages.push(remaining);
			}
		}

		// Verify we sent multiple messages
		assert.ok(
			sentMessages.length > 1,
			'Should have split into multiple messages',
		);

		// Verify each message is under 2000 chars
		for (let i = 0; i < sentMessages.length; i++) {
			assert.ok(
				sentMessages[i].length <= 2000,
				`Message ${i} exceeds 2000 characters: ${sentMessages[i].length}`,
			);
		}

		// Verify code block handling:
		// Messages with code should properly open code blocks
		// Last message should close it, others might be incomplete (streaming)
		for (let i = 0; i < sentMessages.length; i++) {
			const msg = sentMessages[i];
			const isLast = i === sentMessages.length - 1;

			// If this message contains code
			if (msg.includes('std::cout')) {
				const backtickCount = (msg.match(/```/g) || []).length;

				// Should start with ```cpp or ```c++ or have preamble before it
				assert.ok(
					msg.trimStart().startsWith('```cpp') ||
						msg.trimStart().startsWith('```c++') ||
						msg.includes('\n```cpp') ||
						msg.includes('\n```c++'),
					`Message ${i} should contain \`\`\`cpp opening. Start: "${msg.slice(0, 50)}"`,
				);

				// Last message should be complete (even number of backticks)
				if (isLast) {
					assert.ok(
						backtickCount % 2 === 0,
						`Last message should have balanced \`\`\`. Count: ${backtickCount}`,
					);
				} else {
					// Middle messages might be incomplete (odd backticks, no closing)
					// Just verify they have at least one opening ```
					assert.ok(
						backtickCount >= 1,
						`Message ${i} should have at least one \`\`\``,
					);
				}
			}
		}
	});

	it('should handle streaming that splits in the middle of code', () => {
		// More aggressive test: split right in the middle of code block
		const chunkWindow: string[] = [];
		const sentMessages: string[] = [];

		// Create exactly enough content to force a split mid-code
		const intro = 'Here is the code:\n\n```cpp\n';
		chunkWindow.push(intro);

		// Add lines until we're just under 2000
		while (chunkWindow.join('').length < 1900) {
			chunkWindow.push('int x = 42;\n');
		}

		// Now add enough to push over
		chunkWindow.push('int y = 100;\n'.repeat(20));

		// This should trigger the split
		assert.ok(chunkWindow.join('').length > 2000);

		const [content, remainder] = splitMessage(chunkWindow.join(''));
		sentMessages.push(content);
		for (const chunk of remainder) {
			sentMessages.push(chunk);
		}

		// Verify split happened
		assert.ok(sentMessages.length > 1, 'Should split into multiple messages');

		// First message should end with ```
		assert.ok(
			sentMessages[0].trimEnd().endsWith('```'),
			`First message should close code block. Ending: "${sentMessages[0].slice(-20)}"`,
		);

		// Second message should start with ```cpp
		assert.ok(
			sentMessages[1].trimStart().startsWith('```cpp'),
			`Second message should open code block. Starting: "${sentMessages[1].slice(0, 20)}"`,
		);
	});
});
