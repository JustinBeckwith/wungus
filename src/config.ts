import 'dotenv/config';

const vars = [
	'DISCORD_TOKEN',
	'DISCORD_CLIENT_ID',
	'PINECONE_API_KEY',
	'PINECONE_INDEX_NAME',
	'PINECONE_NAMESPACE',
	'OPENAI_API_KEY',
	'FORUM_CHANNEL_ID',
] as const;

const config = {} as Record<(typeof vars)[number], string> & {
	WUNGUS_DEBUG: boolean;
};
for (const key of vars) {
	const value = process.env[key];
	if (!value) {
		throw new Error(`Missing required environment variable: ${key}`);
	}
	config[key] = value;
}

config.WUNGUS_DEBUG = process.env.WUNGUS_DEBUG === 'true';

export { config };
