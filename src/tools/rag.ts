import { Pinecone } from '@pinecone-database/pinecone';
import { OpenAI } from 'openai';
import { config } from '../config.js';

const openai = new OpenAI({ apiKey: config.OPENAI_API_KEY });
const pinecone = new Pinecone({ apiKey: config.PINECONE_API_KEY });

export async function getEmbedding(text: string) {
	const response = await openai.embeddings.create({
		model: 'text-embedding-ada-002',
		input: text,
	});
	return response.data[0].embedding;
}

export async function queryPinecone(userQuery: string) {
	const index = pinecone.Index(config.PINECONE_INDEX_NAME);
	const queryEmbedding = await getEmbedding(userQuery);
	const queryResponse = await index.query({
		vector: queryEmbedding,
		topK: 15,
		includeMetadata: true,
	});
	if (config.WUNGUS_DEBUG) {
		console.log(queryResponse);
	}
	return queryResponse.matches;
}

export async function getContext(question: string) {
	const retrievedDocs = await queryPinecone(question);
	let context = '';
	const urls = new Set<string>();
	for (const match of retrievedDocs) {
		const nextChunk = `${match?.metadata?.url}: ${match.metadata?.text}\n`;
		if (context.length + nextChunk.length < 8192) {
			context += nextChunk;
			urls.add(match.metadata?.url as string);
		} else {
			break;
		}
	}
	if (config.WUNGUS_DEBUG) {
		console.log(JSON.stringify(retrievedDocs, null, 2));
	}
	return { context, urls };
}
