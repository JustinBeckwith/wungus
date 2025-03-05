import fs from 'node:fs/promises';
import { SiteCrawler } from './downloadSiteChunks.js';

const crawley = new SiteCrawler({
	startUrl: 'https://support-dev.discord.com/hc/en-us',
	contentSelector: 'main',
	validDomains: [
		'https://support-dev.discord.com/hc/en-us',
		'https://discorddevs.zendesk.com/hc/',
	],
	headless: false,
	/**
	 * TODO: Right now we conflate ignoring scanning a particular page, and ignoring
	 * the content for that page.  For example:  we should scan this page for links:
	 * https://support-dev.discord.com/hc/en-us/categories/360000656511
	 * But we should also not add the content of that page as an embedding.  It's unclear
	 * to me if this should be done by more strictly analyzing the content, or by
	 * adding an additional parameter here to "scan for links but not ingest".
	 */
	ignorePatterns: [
		/article_attachments/,
		/\/requests\/new/,
		/\/related\/click/,
		/\/categories\/360000656531/,
		/\/en-us\/signin/,
		/\/articles\/6206007597207/,
	],
});

const data = await crawley.downloadSiteChunks();

for (const key of Object.keys(data)) {
	if (!key.includes('/articles/')) {
		delete data[key];
	}
}

const outputFilename = 'tmp/raw-supportsite.json';
await fs.writeFile(outputFilename, JSON.stringify(data, null, 2));
