export interface DiscordStatusResponse {
	page: {
		id: string;
		name: string;
		url: string;
		time_zone: string;
		updated_at: string;
	};
	status: {
		indicator: string;
		description: string;
	};
}

export async function getApiStatus(): Promise<DiscordStatusResponse | null> {
	try {
		const response = await fetch(
			'https://discordstatus.com/api/v2/status.json',
		);
		const data: DiscordStatusResponse = await response.json();
		return data;
	} catch (error) {
		console.error('Error fetching Discord API status:', error);
		return null;
	}
}

export const toolsConfig = {
	type: 'function' as const,
	function: {
		name: 'get_api_status',
		description: 'Get the status of the Discord API.',
		parameters: {
			type: 'object',
			properties: {},
			required: [],
			additionalProperties: false,
		},
		strict: true,
	},
};
