import fs from 'node:fs/promises';
import { graphql } from '@octokit/graphql';
import { config } from '../config.js';

interface Comment {
	node: {
		body: string;
		url: string;
	};
}

interface Issue {
	node: {
		title: string;
		body: string;
		url: string;
		comments: {
			edges: Comment[];
		};
	};
}

interface GraphQLResponse {
	repository: {
		issues: {
			edges: Issue[];
			pageInfo: {
				endCursor: string;
				hasNextPage: boolean;
			};
		};
	};
}

const GITHUB_TOKEN = config.GITHUB_TOKEN;
const REPO_OWNER = 'discord';
const REPO_NAME = 'discord-api-docs';

const graphqlWithAuth = graphql.defaults({
	headers: {
		authorization: `token ${GITHUB_TOKEN}`,
	},
});

async function fetchIssuesWithComments(cursor: string | null = null) {
	const query = `
    query($owner: String!, $name: String!, $cursor: String) {
      repository(owner: $owner, name: $name) {
        issues(first: 100, after: $cursor) {
          edges {
            node {
              title
              body
              url
              comments(first: 100) {
                edges {
                  node {
                    body
                    url
                  }
                }
              }
            }
          }
          pageInfo {
            endCursor
            hasNextPage
          }
        }
      }
    }
  `;

	const variables = {
		owner: REPO_OWNER,
		name: REPO_NAME,
		cursor,
	};

	try {
		const response: GraphQLResponse = await graphqlWithAuth(query, variables);
		console.log(`Fetched ${response.repository.issues.edges.length} issues`);
		return response.repository.issues;
		// biome-ignore lint/suspicious/noExplicitAny: <explanation>
	} catch (error: any) {
		if (error.headers?.['retry-after']) {
			const retryAfter = Number.parseInt(error.headers['retry-after'], 10);
			console.log(`Rate limited. Retrying after ${retryAfter} seconds...`);
			await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
			return fetchIssuesWithComments(cursor);
		}
		throw error;
	}
}

async function downloadGitHubIssues() {
	let allIssues: Issue[] = [];
	let cursor = null;
	let hasNextPage = true;

	while (hasNextPage) {
		const issues = await fetchIssuesWithComments(cursor);
		allIssues = allIssues.concat(issues.edges);
		cursor = issues.pageInfo.endCursor;
		hasNextPage = issues.pageInfo.hasNextPage;
	}

	const issuesData = allIssues.map((issue) => ({
		title: issue.node.title,
		description: issue.node.body,
		url: issue.node.url,
		comments: issue.node.comments.edges.map((comment) => ({
			body: comment.node.body,
			url: comment.node.url,
		})),
	}));

	await fs.writeFile(
		`tmp/${REPO_NAME}-issues.json`,
		JSON.stringify(issuesData, null, 2),
	);
	console.log(
		'Issues and comments have been downloaded and saved to github-issues.json',
	);
}

downloadGitHubIssues();
