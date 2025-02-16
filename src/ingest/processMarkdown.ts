import fs from 'node:fs/promises';
import path from 'node:path';
import { OpenAI } from 'openai';
import { remark } from 'remark';
import remarkMdx from 'remark-mdx';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { visit } from 'unist-util-visit';
import { config } from '../config.js';

const openai = new OpenAI({ apiKey: config.OPENAI_API_KEY });

const MAX_CHUNK_SIZE = 8000;
const OVERLAP = 200;

interface Doc {
	file: string;
	text: string;
	chunks?: string[];
	embeddings?: number[][];
}

async function readTheDocs() {
	const directory = path.join(process.cwd(), '..', 'discord-api-docs', 'docs');
	const docs: Doc[] = [];
	const files = await fs.readdir(directory, {
		withFileTypes: true,
		recursive: true,
	});
	for (const file of files) {
		if (
			file.isFile() &&
			(file.name.endsWith('.md') || file.name.endsWith('.mdx'))
		) {
			const filename = path.join(file.parentPath, file.name);
			const content = await fs.readFile(filename, 'utf-8');
			docs.push({
				file: file.name,
				text: content,
			});
		}
	}
	return docs;
}

async function createDocChunks(docs: Doc[]) {
	for (const doc of docs) {
		const chunks = await getMarkdownChunks(doc.file, doc.text);
		doc.chunks = chunks;
	}
}

async function createEmbeddings(docs: Doc[]) {
	for (const doc of docs) {
		try {
			if (doc.chunks?.length === 0) {
				console.log(`No chunks found for ${doc.file}`);
				continue;
			}
			console.log(`Creating embeddings for ${doc.file}`);
			const response = await openai.embeddings.create({
				model: 'text-embedding-ada-002',
				input: doc.chunks || [],
			});
			doc.embeddings = response.data.map((x) => x.embedding);
		} catch (error) {
			console.log(JSON.stringify(doc, null, 2));
			console.error(`Error creating embeddings for ${doc.file}: ${error}`);
		}
	}
	await fs.writeFile('embeddings.json', JSON.stringify(docs, null, 2));
}

async function getMarkdownChunks(path: string, fileContent: string) {
	if (path.endsWith('.md')) {
		const ast = remark().parse(fileContent);
		const contentArray: string[] = [];
		visit(ast, (node) => {
			if (node.type === 'text' && 'value' in node) {
				contentArray.push(node.value);
			}
		});
		const content = contentArray.join('\n').trim();
		const chonks = chunkText(content);
		return chonks;
	}
	if (path.endsWith('.mdx')) {
		const processor = unified().use(remarkParse).use(remarkMdx);
		const ast = processor.parse(fileContent);
		const contentArray: string[] = [];
		visit(ast, (node) => {
			if (node.type === 'text' && 'value' in node) {
				contentArray.push(node.value as string);
			}
		});

		const content = contentArray.join('\n').trim();
		const chonks = chunkText(content);
		return chonks;
	}
	return [];
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

const docs = await readTheDocs();
await createDocChunks(docs);
await createEmbeddings(docs);
