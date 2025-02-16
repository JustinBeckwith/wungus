import fs from 'node:fs/promises';
import path from 'node:path';
import { Pinecone } from '@pinecone-database/pinecone';
import { config } from '../config.js';

const pinecone = new Pinecone({ apiKey: config.PINECONE_API_KEY });

interface Doc {
	file: string;
	text: string;
	chunks: string[];
	embeddings: number[][];
}

async function storeEmbeddings() {
	const embeddingFilePath = path.join(process.cwd(), 'embeddings.json');
	const docs: Doc[] = JSON.parse(await fs.readFile(embeddingFilePath, 'utf-8'));
	const index = pinecone.Index(config.PINECONE_INDEX_NAME);
	for (const doc of docs) {
		for (let i = 0; i < doc.embeddings.length; i++) {
			console.log(`Storing embeddings for ${doc.file} #${i}`);
			await index.upsert([
				{
					id: `${doc.file}_${i}`,
					values: doc.embeddings[i],
					metadata: { text: doc.chunks[i] },
				},
			]);
		}
	}
}

await storeEmbeddings();
