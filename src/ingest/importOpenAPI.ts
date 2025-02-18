import fs from 'node:fs/promises';

interface OpenAPISpec {
	paths: Record<string, unknown>;
}

const url =
	'https://raw.githubusercontent.com/discord/discord-api-spec/refs/heads/main/specs/openapi.json';
const response = await fetch(url);
const spec = (await response.json()) as OpenAPISpec;

const endpoints: Record<string, unknown> = {};

for (const [path, methods] of Object.entries(spec.paths)) {
	for (const [method, details] of Object.entries(
		methods as Record<string, unknown>,
	)) {
		const endpointKey = `${method.toUpperCase()} ${path}`;
		endpoints[endpointKey] = details;
	}
}

await fs.writeFile('endpoints.json', JSON.stringify(endpoints, null, 2));
