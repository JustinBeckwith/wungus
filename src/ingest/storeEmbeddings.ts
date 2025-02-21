import fs from 'node:fs/promises';
import { Pinecone } from '@pinecone-database/pinecone';
import { config } from '../config.js';

const pinecone = new Pinecone({ apiKey: config.PINECONE_API_KEY });

interface Doc {
	url: string;
	text: string;
	chunks: string[];
	embeddings: number[][];
}

const [filePath] = process.argv.slice(2);
const rawContents = await fs.readFile(filePath, 'utf-8');
const docs: Doc[] = JSON.parse(rawContents);
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
