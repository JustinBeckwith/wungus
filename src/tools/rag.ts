import { Pinecone } from '@pinecone-database/pinecone';
import { OpenAI } from 'openai';
import { config } from '../config.js';

const openai = new OpenAI({ apiKey: config.OPENAI_API_KEY });
const pinecone = new Pinecone({ apiKey: config.PINECONE_API_KEY });

export async function getEmbedding(text: string) {
	console.log(`Creating embedding for: ${text}`);
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
		topK: 5,
		includeMetadata: true,
	});
	console.log(queryResponse);
	return queryResponse.matches;
}

export async function getContext(question: string) {
	const retrievedDocs = await queryPinecone(question);
	const context = retrievedDocs
		.map((match) => `${match?.metadata?.url}: ${match.metadata?.text}`)
		.join('\n');
	const uniqueUrls = new Set(
		retrievedDocs
			.filter((doc) => !!doc.metadata?.url)
			.map((doc) => doc.metadata?.url as string),
	);
	const urls = Array.from(uniqueUrls)
		.map((url) => `-# - ${url}`)
		.join('\n');
	return { context, urls };
}
