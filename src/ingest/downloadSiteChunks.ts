import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import puppeteer from 'puppeteer';

export interface DownloadSiteChunksOptions {
	startUrl: string;
	contentSelector: string;
	validDomains?: string[];
	headless?: boolean;
}

export class SiteCrawler {
	private startUrl: string;
	private contentSelector: string;
	private validDomains: string[];
	private data: Record<string, string> = {};
	private visitedUrls: Set<string> = new Set();
	private urlQueue: string[] = [];
	private headless: boolean;

	constructor(options: DownloadSiteChunksOptions) {
		this.startUrl = options.startUrl;
		this.contentSelector = options.contentSelector;
		this.validDomains = options.validDomains ?? [options.startUrl];
		this.headless = options.headless ?? true;
	}

	async downloadSiteChunks() {
		console.log(
			`Crawling ${this.startUrl} with selector ${this.contentSelector}`,
		);
		const pupOpts = this.headless
			? {}
			: {
					headless: false,
					args: ['--disable-blink-features=AutomationControlled'],
				};
		const browser = await puppeteer.launch(pupOpts);

		const baseDomain = new URL(this.startUrl).hostname;
		this.urlQueue.push(this.startUrl);

		while (this.urlQueue.length > 0) {
			const nextURL = this.urlQueue.shift();
			if (nextURL) {
				await this.crawl(browser, nextURL, baseDomain, this.contentSelector);
			}
		}

		await browser.close();

		const filename = `tmp/chunks-${randomUUID()}.json`;
		await fs.writeFile(filename, JSON.stringify(this.data, null, 2));
		console.log(`Chunks saved to ${filename}`);
	}

	/**
	 * Fetches the rendered HTML content of a given URL using Puppeteer.
	 * @param browser Puppeteer browser instance.
	 * @param url The URL to fetch.
	 * @returns Extracted text and links from the page.
	 */
	private async fetchPageContent(
		browser: puppeteer.Browser,
		url: string,
		contentSelector?: string,
	): Promise<{ text: string; links: string[] }> {
		const page = await browser.newPage();
		console.log(`Fetching page content: ${url}`);
		console.log(`Content Selector: ${contentSelector}`);

		try {
			await page.goto(url, { waitUntil: 'networkidle2' });

			// Extract page text (removes HTML tags)
			const text = await page.evaluate((containerId) => {
				console.log(`Container: ${containerId}`);
				function cleanText(el: Element) {
					return (el as HTMLElement).innerText.trim();
				}

				function extractTable(table: HTMLTableElement) {
					return Array.from(table.rows)
						.map((row) =>
							Array.from(row.cells)
								.map((cell) => cell.innerText.trim())
								.join(' | '),
						)
						.join('\n');
				}
				const content = [];
				const elems = document.querySelectorAll(`${containerId} *`);
				console.log(elems);
				for (const el of elems) {
					const tagName = el.tagName.toLowerCase();
					if (tagName.match(/^h[1-3]$/)) {
						content.push(`### ${cleanText(el)}`); // Preserve headings
					} else if (tagName === 'p') {
						content.push(cleanText(el)); // Preserve paragraphs
					} else if (tagName === 'pre') {
						content.push(`\n\`\`\`\n${cleanText(el)}\n\`\`\`\n`); // Code block
					} else if (tagName === 'code' && el.closest('pre') === null) {
						content.push(`\`${cleanText(el)}\``); // Inline code (if not inside <pre>)
					} else if (tagName === 'table') {
						content.push(`\nTable:\n${extractTable(el as HTMLTableElement)}`); // Structured table
					}
				}
				return content.join('\n\n'); // Preserve order in output
			}, contentSelector);

			// Extract links and convert them to absolute URLs
			const links = await page.evaluate(() => {
				return Array.from(document.querySelectorAll('a'))
					.map((a) => a.href)
					.filter((href) => href.startsWith('http')); // Ensure valid absolute URLs
			});

			await page.close();
			return { text: text || '', links };
		} catch (error) {
			console.error(`Error fetching ${url}:`, error);
			await page.close();
			return { text: '', links: [] };
		}
	}

	/**
	 * Adds URLs to the queue if they belong to the same domain and haven't been visited.
	 * @param links Extracted links from the page.
	 * @param baseDomain The domain to restrict crawling to.
	 */
	private enqueueLinks(links: string[], baseDomain: string) {
		for (const link of links) {
			const urlObj = new URL(link);
			urlObj.hash = ''; // Remove hash to ensure unique URLs
			urlObj.search = ''; // Remove search params to ensure unique URLs
			console.log(`maybe queue: ${urlObj.href}`);
			if (
				this.isValidDomain(urlObj.href) &&
				!this.visitedUrls.has(urlObj.href)
			) {
				this.urlQueue.push(urlObj.href);
			}
		}
	}

	/**
	 * Crawls a webpage, extracts text, and discovers new links.
	 * @param browser Puppeteer browser instance.
	 * @param url The URL to crawl.
	 * @param baseDomain The base domain to restrict crawling.
	 */
	private async crawl(
		browser: puppeteer.Browser,
		url: string,
		baseDomain: string,
		contentSelector?: string,
	) {
		const urlObj = new URL(url);
		urlObj.hash = ''; // Remove hash to ensure unique URLs
		urlObj.search = ''; // Remove search params to ensure unique URLs
		if (this.visitedUrls.has(urlObj.href)) return;
		this.visitedUrls.add(urlObj.href);

		const { text, links } = await this.fetchPageContent(
			browser,
			urlObj.href,
			contentSelector,
		);
		console.log(`Extracted Text from ${urlObj.href}:`);
		console.log(text);
		console.log(`Queuing ${links.length} links`);
		this.data[urlObj.href] = text;

		this.enqueueLinks(links, baseDomain);
	}

	private isValidDomain(url: string) {
		for (const domain of this.validDomains) {
			if (url.startsWith(domain)) {
				console.log(`Valid domain: ${url}`);
				return true;
			}
		}
		console.log(`INValid domain: ${url}`);
		return false;
	}
}
