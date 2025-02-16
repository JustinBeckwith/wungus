import fs from 'node:fs/promises';
import { Pinecone } from '@pinecone-database/pinecone';
import { OpenAI } from 'openai';
import { config } from '../config.js';

const pinecone = new Pinecone({ apiKey: config.PINECONE_API_KEY });
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
console.log(embeddings);
await storeEmbeddings(embeddings);

async function createEmbeddings(contents: Record<string, string>) {
	const docs: Doc[] = [];
	for (const [url, text] of Object.entries(contents)) {
		const doc: Doc = { url, text, embeddings: [], chunks: [] };
		try {
			if (text.trim().length === 0) {
				continue;
			}
			doc.chunks = chunkText(text);
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

async function storeEmbeddings(docs: Doc[]) {
	const index = pinecone.Index(config.PINECONE_INDEX_NAME);
	for (const doc of docs) {
		for (let i = 0; i < doc.embeddings.length; i++) {
			console.log(`Storing embeddings for ${doc.url} #${i}`);
			await index.upsert([
				{
					id: `${doc.url}/${i}`,
					values: doc.embeddings[i],
					metadata: {
						text: doc.chunks[i],
						url: doc.url,
					},
				},
			]);
		}
	}
}
