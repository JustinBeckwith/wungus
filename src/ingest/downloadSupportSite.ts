import { SiteCrawler } from './downloadSiteChunks.js';

const crawley = new SiteCrawler({
	startUrl: 'https://support-dev.discord.com/hc/en-us',
	contentSelector: 'main',
	validDomains: [
		'https://support-dev.discord.com/hc/en-us',
		'https://discorddevs.zendesk.com/hc/',
	],
	headless: false,
});

await crawley.downloadSiteChunks();
