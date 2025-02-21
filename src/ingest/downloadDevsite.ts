import fs from 'node:fs/promises';
import { SiteCrawler } from './downloadSiteChunks.js';

const crawley = new SiteCrawler({
	startUrl: 'https://discord.com/developers/docs/',
	contentSelector: '#algolia-crawler--page-content-container',
});

const data = await crawley.downloadSiteChunks();

const outputFilename = 'tmp/raw-devsite.json';
await fs.writeFile(outputFilename, JSON.stringify(data, null, 2));
