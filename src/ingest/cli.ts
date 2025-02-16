import { Pinecone } from '@pinecone-database/pinecone';
import inquirer from 'inquirer';
import { OpenAI } from 'openai';
import { config } from '../config.js';

const openai = new OpenAI({ apiKey: config.OPENAI_API_KEY });
const pinecone = new Pinecone({ apiKey: config.PINECONE_API_KEY });

while (true) {
	const { question } = await inquirer.prompt([
		{
			type: 'input',
			name: 'question',
			message: 'Ask a question about the Discord API (or type "exit" to quit):',
		},
	]);

	if (question.toLowerCase() === 'exit') break;

	const retrievedDocs = await queryPinecone(question);
	console.log(retrievedDocs);

	const response = await openai.chat.completions.create({
		model: 'gpt-4',
		messages: [
			{
				role: 'system',
				content:
					"You are an assistant that answers questions specific to the Discord API. You should not answer questions about anything but Discord and it's associated API, tools, and libraries.  Use gen alpha language, but as cringey as possible and barely correct.  Use a ton of emojis.",
			},
			{
				role: 'user',
				content: `Based on the following information:\n\n${retrievedDocs}\n\nAnswer this query: ${question}`,
			},
		],
		stream: true,
	});

	for await (const chunk of response) {
		process.stdout.write(chunk.choices[0]?.delta?.content || '');
	}
	console.log('\n\n');
}

async function getEmbedding(text: string) {
	console.log(`Creating embedding for: ${text}`);
	const response = await openai.embeddings.create({
		model: 'text-embedding-ada-002',
		input: text,
	});
	return response.data[0].embedding;
}

async function queryPinecone(userQuery: string) {
	const index = pinecone.Index(config.PINECONE_INDEX_NAME);
	const queryEmbedding = await getEmbedding(userQuery);
	const queryResponse = await index.query({
		vector: queryEmbedding,
		topK: 5,
		includeMetadata: true,
	});
	console.log(queryResponse);
	return queryResponse.matches.map((match) => match.metadata?.text).join('\n');
}
