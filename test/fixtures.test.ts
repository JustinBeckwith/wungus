import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { splitMessage } from '../src/messageSplitter.js';

/**
 * Fixture-based tests to ensure message splitting doesn't regress.
 * These tests use real-world Discord bot responses to verify the splitting logic
 * works correctly with actual content that would be sent to users.
 */

function loadFixture(filename: string): string {
	const fixturePath = join(process.cwd(), 'test', 'fixtures', filename);
	return readFileSync(fixturePath, 'utf-8');
}

describe('fixture-based message splitting', () => {
	describe('C++ Discord bot example', () => {
		it('should split long C++ response while preserving code blocks', () => {
			const message = loadFixture('cpp-long-response.txt');
			const [first, rest] = splitMessage(message);
			const allChunks = [first, ...rest];

			// Verify all chunks are under 2000 chars
			for (let i = 0; i < allChunks.length; i++) {
				assert.ok(
					allChunks[i].length <= 2000,
					`Chunk ${i} exceeds 2000 characters: ${allChunks[i].length}`,
				);
			}

			// Verify we actually split (this fixture is long)
			assert.ok(rest.length > 0, 'Should have split the long C++ response');

			// Verify each chunk with code has balanced backticks
			for (let i = 0; i < allChunks.length; i++) {
				const chunk = allChunks[i];
				if (chunk.includes('dpp::') || chunk.includes('#include')) {
					const backtickCount = (chunk.match(/```/g) || []).length;

					// Each chunk should have even backticks (properly opened/closed)
					assert.ok(
						backtickCount % 2 === 0,
						`Chunk ${i} has unbalanced backticks. Count: ${backtickCount}\nChunk preview: ${chunk.slice(0, 100)}...`,
					);

					// Should contain cpp language identifier
					assert.ok(
						chunk.includes('```cpp'),
						`Chunk ${i} with C++ code should have \`\`\`cpp marker`,
					);
				}
			}

			// Verify the full message can be reconstructed
			const reconstructed = allChunks.join('\n');
			// Should have same content (with newlines between chunks)
			assert.ok(
				reconstructed.includes('#include <dpp/dpp.h>'),
				'Should preserve C++ includes',
			);
			assert.ok(
				reconstructed.includes('bot.on_message_create'),
				'Should preserve bot event handlers',
			);
			assert.ok(
				reconstructed.includes('Install DPP'),
				'Should preserve instructions after code block',
			);
		});

		it('should handle C++ code with proper closing and reopening', () => {
			const message = loadFixture('cpp-long-response.txt');
			const [first, rest] = splitMessage(message);

			// First chunk should end with proper markdown
			if (first.includes('```cpp')) {
				// Should close the code block if it was opened
				assert.ok(
					first.includes('```'),
					'First chunk should have code block markers',
				);
			}

			// If there are remainder chunks with code, they should start with ```cpp
			for (const chunk of rest) {
				if (
					chunk.includes('dpp::') ||
					chunk.includes('std::') ||
					chunk.includes('#include')
				) {
					assert.ok(
						chunk.trimStart().startsWith('```cpp') ||
							chunk.includes('\n```cpp'),
						`Chunk with C++ code should open with \`\`\`cpp. Chunk start: ${chunk.slice(0, 50)}`,
					);
				}
			}
		});
	});

	describe('TypeScript API example', () => {
		it('should split long TypeScript response while preserving code blocks', () => {
			const message = loadFixture('typescript-api-response.txt');
			const [first, rest] = splitMessage(message);
			const allChunks = [first, ...rest];

			// Verify all chunks are under 2000 chars
			for (let i = 0; i < allChunks.length; i++) {
				assert.ok(
					allChunks[i].length <= 2000,
					`Chunk ${i} exceeds 2000 characters`,
				);
			}

			// This fixture should split
			assert.ok(rest.length > 0, 'Should have split the TypeScript response');

			// Verify TypeScript-specific content is preserved
			const reconstructed = allChunks.join('\n');
			assert.ok(
				reconstructed.includes('interface User'),
				'Should preserve TypeScript interfaces',
			);
			assert.ok(
				reconstructed.includes('async createUser'),
				'Should preserve async methods',
			);
			assert.ok(
				reconstructed.includes('express.json'),
				'Should preserve Express code',
			);

			// Verify code blocks are properly marked
			for (const chunk of allChunks) {
				if (chunk.includes('interface') || chunk.includes('async ')) {
					const backtickCount = (chunk.match(/```/g) || []).length;
					assert.ok(
						backtickCount % 2 === 0,
						'TypeScript chunks should have balanced backticks',
					);
					assert.ok(
						chunk.includes('```typescript') || chunk.includes('```ts'),
						'TypeScript code should have language identifier',
					);
				}
			}
		});
	});

	describe('Python example with multiple code blocks', () => {
		it('should handle Python response with multiple separate code blocks', () => {
			const message = loadFixture('python-multiple-blocks.txt');
			const [first, rest] = splitMessage(message);
			const allChunks = [first, ...rest];

			// Verify all chunks are under 2000 chars
			for (const chunk of allChunks) {
				assert.ok(
					chunk.length <= 2000,
					'All chunks should be under 2000 chars',
				);
			}

			// This fixture has multiple code blocks (bash, python, bash)
			const reconstructed = allChunks.join('\n');

			// Verify all code block types are preserved
			assert.ok(
				reconstructed.includes('```bash'),
				'Should preserve bash code blocks',
			);
			assert.ok(
				reconstructed.includes('```python'),
				'Should preserve python code blocks',
			);

			// Verify Python-specific content
			assert.ok(
				reconstructed.includes('discord.ext'),
				'Should preserve discord.py imports',
			);
			assert.ok(
				reconstructed.includes('@bot.command'),
				'Should preserve bot decorators',
			);
			assert.ok(
				reconstructed.includes('async def'),
				'Should preserve async functions',
			);

			// Each chunk with code should have balanced backticks
			for (const chunk of allChunks) {
				if (chunk.includes('import ') || chunk.includes('async def')) {
					const backtickCount = (chunk.match(/```/g) || []).length;
					assert.ok(
						backtickCount % 2 === 0,
						`Python chunks should have balanced backticks. Count: ${backtickCount}`,
					);
				}
			}
		});

		it('should preserve multiple distinct code blocks correctly', () => {
			const message = loadFixture('python-multiple-blocks.txt');
			const [first, rest] = splitMessage(message);
			const allChunks = [first, ...rest];

			// Count total code block markers in original and reconstructed
			const originalBackticks = (message.match(/```/g) || []).length;
			const reconstructed = allChunks.join('\n');

			// After splitting and rejoining, we might have MORE backticks (due to closing/opening)
			// But each chunk should still be balanced
			for (let i = 0; i < allChunks.length; i++) {
				const chunk = allChunks[i];
				const hasCode =
					chunk.includes('import ') ||
					chunk.includes('pip install') ||
					chunk.includes('async def');

				if (hasCode) {
					const backtickCount = (chunk.match(/```/g) || []).length;
					assert.ok(
						backtickCount >= 2 && backtickCount % 2 === 0,
						`Chunk ${i} with code should have at least one complete code block`,
					);
				}
			}

			// Should preserve all the distinct code sections
			const bashMatches = reconstructed.match(/```bash/g);
			assert.ok(
				bashMatches && bashMatches.length >= 2,
				'Should have at least 2 bash code blocks',
			);
			const pythonMatches = reconstructed.match(/```python/g);
			assert.ok(
				pythonMatches && pythonMatches.length >= 1,
				'Should have at least 1 python code block',
			);
		});
	});

	describe('JavaScript/React example', () => {
		it('should split React component while preserving JSX code', () => {
			const message = loadFixture('javascript-react-component.txt');
			const [first, rest] = splitMessage(message);
			const allChunks = [first, ...rest];

			// Verify all chunks are under limit
			for (const chunk of allChunks) {
				assert.ok(chunk.length <= 2000);
			}

			// Should split this long component
			assert.ok(rest.length > 0, 'Should split the React component');

			// Verify React-specific syntax is preserved
			const reconstructed = allChunks.join('\n');
			assert.ok(
				reconstructed.includes('useState'),
				'Should preserve React hooks',
			);
			assert.ok(
				reconstructed.includes('useEffect'),
				'Should preserve useEffect',
			);
			assert.ok(
				reconstructed.includes('className='),
				'Should preserve JSX className',
			);
			assert.ok(
				reconstructed.includes('export default'),
				'Should preserve exports',
			);

			// Verify code blocks
			for (const chunk of allChunks) {
				if (chunk.includes('function ') || chunk.includes('const ')) {
					const backtickCount = (chunk.match(/```/g) || []).length;
					assert.ok(
						backtickCount % 2 === 0,
						'JavaScript chunks should have balanced backticks',
					);
					assert.ok(
						chunk.includes('```javascript') ||
							chunk.includes('```js') ||
							chunk.includes('```jsx'),
						'JavaScript code should have language identifier',
					);
				}
			}
		});
	});

	describe('Edge cases from fixtures', () => {
		it('should handle code blocks at the very start of messages', () => {
			const message = loadFixture('cpp-long-response.txt');
			// Remove the preamble to make code block start immediately
			const codeOnlyMessage = message.substring(message.indexOf('```cpp'));

			const [first, rest] = splitMessage(codeOnlyMessage);
			const allChunks = [first, ...rest];

			// First chunk should start with ```cpp
			assert.ok(
				first.trimStart().startsWith('```cpp'),
				'Should handle code blocks at message start',
			);

			// All chunks should be valid
			for (const chunk of allChunks) {
				assert.ok(chunk.length <= 2000);
				if (chunk.includes('#include') || chunk.includes('dpp::')) {
					const backtickCount = (chunk.match(/```/g) || []).length;
					assert.ok(backtickCount % 2 === 0, 'Should have balanced backticks');
				}
			}
		});

		it('should handle code blocks at the very end of messages', () => {
			const message = loadFixture('python-multiple-blocks.txt');
			// Get just the last code block and some text after
			const lastBlock = message.substring(message.lastIndexOf('```bash'));

			const [first, rest] = splitMessage(lastBlock);

			// Should handle this small chunk without issues
			// Might not split, but if it does, should be valid
			const allChunks = [first, ...rest];
			for (const chunk of allChunks) {
				const backtickCount = (chunk.match(/```/g) || []).length;
				assert.ok(
					backtickCount % 2 === 0,
					'Should have balanced backticks in end blocks',
				);
			}
		});

		it('should handle fixtures with text before and after code', () => {
			// All our fixtures have this pattern, test explicitly
			const fixtures = [
				'cpp-long-response.txt',
				'typescript-api-response.txt',
				'python-multiple-blocks.txt',
				'javascript-react-component.txt',
			];

			for (const fixture of fixtures) {
				const message = loadFixture(fixture);
				const [first, rest] = splitMessage(message);
				const allChunks = [first, ...rest];

				// Verify structure
				assert.ok(
					allChunks.length > 0,
					`${fixture} should produce at least one chunk`,
				);

				for (const chunk of allChunks) {
					assert.ok(
						chunk.length <= 2000,
						`${fixture} chunks should be under 2000 chars`,
					);
				}

				// Verify backticks are balanced in all chunks
				for (let i = 0; i < allChunks.length; i++) {
					const chunk = allChunks[i];
					const backtickCount = (chunk.match(/```/g) || []).length;

					// If chunk has backticks, they should be balanced
					if (backtickCount > 0) {
						assert.ok(
							backtickCount % 2 === 0,
							`${fixture} chunk ${i} should have balanced backticks. Count: ${backtickCount}`,
						);
					}
				}
			}
		});
	});

	describe('Streaming simulation with fixtures', () => {
		it('should handle streaming C++ response correctly', () => {
			const fullMessage = loadFixture('cpp-long-response.txt');

			// Simulate streaming by breaking into chunks of varying sizes
			const streamChunks: string[] = [];
			let remaining = fullMessage;

			while (remaining.length > 0) {
				// Simulate variable chunk sizes (10-100 chars)
				const chunkSize = Math.min(
					Math.floor(Math.random() * 90) + 10,
					remaining.length,
				);
				streamChunks.push(remaining.substring(0, chunkSize));
				remaining = remaining.substring(chunkSize);
			}

			// Simulate the streaming loop like in messageCreate.ts
			let chunkWindow: string[] = [];
			const sentMessages: string[] = [];

			for (const chunk of streamChunks) {
				chunkWindow.push(chunk);

				if (chunkWindow.join('').length > 2000) {
					const [content, remainder] = splitMessage(chunkWindow.join(''), {
						incomplete: true,
					});

					sentMessages.push(content);

					// Send all but last remainder chunk
					for (let i = 0; i < remainder.length - 1; i++) {
						sentMessages.push(remainder[i]);
					}

					// Keep last remainder in window
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

			// Verify all sent messages are valid
			assert.ok(
				sentMessages.length > 0,
				'Should have sent at least one message',
			);

			for (let i = 0; i < sentMessages.length; i++) {
				assert.ok(
					sentMessages[i].length <= 2000,
					`Streamed message ${i} should be under 2000 chars`,
				);
			}

			// Last message should have balanced backticks
			const lastMsg = sentMessages[sentMessages.length - 1];
			const lastBacktickCount = (lastMsg.match(/```/g) || []).length;
			assert.ok(
				lastBacktickCount % 2 === 0,
				'Last streamed message should have balanced backticks',
			);
		});

		it('should handle streaming TypeScript response with complete code blocks', () => {
			const fullMessage = loadFixture('typescript-api-response.txt');

			// Similar streaming simulation
			const streamChunks: string[] = [];
			let remaining = fullMessage;

			// Simulate streaming in ~50 char chunks
			while (remaining.length > 0) {
				const chunkSize = Math.min(50, remaining.length);
				streamChunks.push(remaining.substring(0, chunkSize));
				remaining = remaining.substring(chunkSize);
			}

			let chunkWindow: string[] = [];
			const sentMessages: string[] = [];

			for (const chunk of streamChunks) {
				chunkWindow.push(chunk);

				if (chunkWindow.join('').length > 2000) {
					const [content, remainder] = splitMessage(chunkWindow.join(''), {
						incomplete: true,
					});

					sentMessages.push(content);

					for (let i = 0; i < remainder.length - 1; i++) {
						sentMessages.push(remainder[i]);
					}

					if (remainder.length > 0) {
						chunkWindow = [remainder[remainder.length - 1]];
					} else {
						chunkWindow = [];
					}
				}
			}

			if (chunkWindow.length > 0) {
				sentMessages.push(chunkWindow.join(''));
			}

			// Verify
			for (const msg of sentMessages) {
				assert.ok(msg.length <= 2000, 'All messages should be under limit');
			}

			// Verify TypeScript content is preserved across all messages
			const allContent = sentMessages.join('\n');
			assert.ok(
				allContent.includes('interface User'),
				'Should preserve TypeScript content',
			);
			assert.ok(
				allContent.includes('express'),
				'Should preserve import statements',
			);
		});
	});
});
