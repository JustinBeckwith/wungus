import { Pinecone } from '@pinecone-database/pinecone';
import { config } from '../config.js';

const pinecone = new Pinecone({ apiKey: config.PINECONE_API_KEY });

const index = await pinecone.index(config.PINECONE_INDEX_NAME);
let cursor: string | undefined = undefined;
const allVectors: unknown[] = [];

do {
	const response = await index.listPaginated({
		limit: 100,
		paginationToken: cursor,
	});
	if (response.vectors && response.vectors.length > 0) {
		allVectors.push(...response.vectors);
		cursor = response.pagination?.next; // Move to the next batch
	} else {
		cursor = undefined; // No more data
	}
} while (cursor);

console.log(`Total vectors retrieved: ${allVectors.length}`);

for (const vector of allVectors) {
	console.log(vector);
}
