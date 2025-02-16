import { Pinecone } from '@pinecone-database/pinecone';
import { config } from '../config.js';

const pinecone = new Pinecone({ apiKey: config.PINECONE_API_KEY });

async function createPineconeIndex() {
	await pinecone.createIndex({
		name: config.PINECONE_INDEX_NAME,
		dimension: 1536,
		metric: 'cosine',
		spec: {
			serverless: {
				cloud: 'aws',
				region: 'us-east-1',
			},
		},
	});
}

await createPineconeIndex();
