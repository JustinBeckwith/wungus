import fs from 'node:fs/promises';
import path from 'node:path';
import { OpenAI } from 'openai';
import { config } from '../config.js';

const openai = new OpenAI({ apiKey: config.OPENAI_API_KEY });

interface GitHubIssue {
	title: string;
	description: string;
	url: string;
	comments: [
		{
			body: string;
			url: string;
		},
	];
}

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
const contents: GitHubIssue[] = JSON.parse(rawContents);
const embeddings = await createEmbeddings(contents);
const outputFilename = `tmp/embeddings-${path.basename(filePath)}`;
await fs.writeFile(outputFilename, JSON.stringify(embeddings, null, 2));

async function createEmbeddings(contents: GitHubIssue[]) {
	const docs: Doc[] = [];
	for (const issue of contents) {
		const url = issue.url;
		let text = `${issue.title}\n${issue.description}\n\nComments:\n`;
		text += issue.comments.map((c) => c.body).join('\n');
		const doc: Doc = { url, text, embeddings: [], chunks: [] };
		try {
			if (text.trim().length === 0) {
				continue;
			}
			if (text.trim().length < 100) {
				console.log(`Skipping ${url} because it's too short`);
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
