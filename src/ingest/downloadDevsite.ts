import { SiteCrawler } from './downloadSiteChunks.js';

const crawley = new SiteCrawler({
	startUrl: 'https://discord.com/developers/docs/',
	contentSelector: '#algolia-crawler--page-content-container',
});

await crawley.downloadSiteChunks();
