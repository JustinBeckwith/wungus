import fs from 'node:fs/promises';
import path from 'node:path';
import { OpenAI } from 'openai';
import { config } from '../config.js';

const openai = new OpenAI({ apiKey: config.OPENAI_API_KEY });

const MAX_CHUNK_SIZE = 8000;
const OVERLAP = 200;

interface Doc {
	url: string;
	text: string;
	chunks: string[];
	embeddings: number[][];
}

const [filePath] = process.argv.slice(2);
const rawContents = await fs.readFile(filePath, 'utf-8');
const contents: Record<string, string> = JSON.parse(rawContents);
const embeddings = await createEmbeddings(contents);
const outputFilename = `tmp/embeddings-${path.basename(filePath)}`;
await fs.writeFile(outputFilename, JSON.stringify(embeddings, null, 2));

async function createEmbeddings(contents: Record<string, string>) {
	const docs: Doc[] = [];
	for (const [url, text] of Object.entries(contents)) {
		const doc: Doc = { url, text, embeddings: [], chunks: [] };
		try {
			if (text.trim().length === 0) {
				continue;
			}
			if (text.trim().length < 100) {
				console.log(`Skipping ${url} because it's too short`);
				continue;
			}
			doc.chunks = chunkPage(text);
			console.log(`Creating embeddings for ${url}`);
			const response = await openai.embeddings.create({
				model: 'text-embedding-ada-002',
				input: doc.chunks,
			});
			doc.embeddings = response.data.map((x) => x.embedding);
			docs.push(doc);
		} catch (error) {
			console.log(JSON.stringify(doc, null, 2));
			console.error(`Error creating embeddings for ${doc.url}: ${error}`);
		}
	}
	return docs;
}

/**
 * Assuming the text is markdown, split the text by H2 headings and chunk each section.
 * @param text
 * @returns A collection of chunks per h2 section
 */
function chunkPage(text: string) {
	const chunks: string[] = [];
	const sections = text.split(/^##\s+/gm); // Split text by H2 headings

	for (const section of sections) {
		if (section.trim().length > 0) {
			const subchunks = chunkText(section.trim());
			chunks.push(...subchunks);
		}
	}

	return chunks;
}

function chunkText(text: string) {
	const chunks: string[] = [];
	const words: string[] = text.split(' ');
	let chunk: string[] = [];

	for (const word of words) {
		if (chunk.join(' ').length + word.length < MAX_CHUNK_SIZE) {
			chunk.push(word);
		} else {
			chunks.push(chunk.join(' '));
			chunk = chunk.slice(-OVERLAP / 2).concat([word]);
		}
	}

	if (chunk.length) chunks.push(chunk.join(' '));
	return chunks;
}
