# Test Fixtures

This directory contains real-world Discord bot response examples used for testing message splitting functionality.

## Purpose

These fixtures ensure that the message splitter (`src/messageSplitter.ts`) correctly handles actual bot responses with:
- Long code samples in various languages
- Multiple code blocks in a single response
- Text before and after code blocks
- Real-world formatting patterns

## Fixtures

### `cpp-long-response.txt`
A comprehensive C++ Discord bot example using the DPP library. Contains:
- Long code block (>2000 characters) with includes, event handlers, and bot logic
- Instructions before and after the code block
- Multiple commands and features demonstrated

**Use case:** Tests splitting of large C++ code samples while preserving `cpp` language identifiers

### `typescript-api-response.txt`
A TypeScript Express REST API example. Contains:
- TypeScript interfaces and types
- Class-based service architecture
- Express route handlers with validation
- Error handling middleware

**Use case:** Tests TypeScript/JavaScript code splitting with complex syntax

### `python-multiple-blocks.txt`
A Python Discord bot using discord.py with multiple code blocks. Contains:
- Multiple distinct code blocks (bash, python, bash)
- Python decorators and async functions
- Setup instructions between code blocks

**Use case:** Tests handling of multiple separate code blocks in a single response

### `javascript-react-component.txt`
A React component example with hooks and event handlers. Contains:
- Modern React patterns (hooks, functional components)
- JSX syntax
- Event handling and state management

**Use case:** Tests JSX/React code splitting

## Testing Strategy

The fixtures are used in `test/fixtures.test.ts` to verify:

1. **Code block preservation:** Each language's code blocks remain valid after splitting
2. **Language identifiers:** Code blocks maintain their language tags (```cpp, ```typescript, etc.)
3. **Balanced backticks:** All chunks have properly opened and closed code blocks
4. **Content integrity:** All code and instructions are preserved
5. **Streaming simulation:** Fixtures are broken into streaming chunks to test real-world scenarios
6. **Edge cases:** Code blocks at start/end of messages, multiple blocks, etc.

## Why Fixtures?

Fixture-based tests are crucial because:
- They test **real content** that would actually be sent to Discord users
- They catch regressions when refactoring the splitter logic
- They document expected behavior with concrete examples
- They're harder to break than synthetic tests (can't adjust fixture to match broken code)

## Adding New Fixtures

When adding a new fixture:
1. Use a real Discord bot response pattern
2. Make it long enough to require splitting (>2000 characters)
3. Include realistic code examples with proper syntax
4. Add corresponding tests in `fixtures.test.ts`
5. Document what edge case or pattern it tests
