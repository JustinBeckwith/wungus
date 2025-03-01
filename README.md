# WUNGUS

![Wungus](./assets/wungus.png)

Wungus is a Discord bot that uses LLMs to answer questions about the Discord API.  It's not quite ready for primetime.  

## Contributing

This project requires Node.js v20 or higher. After cloning the repository, install dependencies:

```bash
pnpm install
```

You're going to need a .env file to run the project.  See .env.example for the required variables.

```bash
cp .sample.env .env
```

For your own development, you're going to want to create your own:

- App in Discord
- OpenAI API key
- Pinecone API key
- Pinecone index name
- Pinecone namespace

Feed all of these into the .env file and you're off to the races.

### Running the bot

After setting up your `.env`:

```bash
pnpm dev
```

### Using the content ingestion tools

Right now they're a little rough, ok?  These tools will scan discord.dev and the support site,
create embeddings, and save them to pinecone.  You have to run each step in serial.  For example, to download and process devsite:

- `node build/src/ingest/downloadDevsite.js`
- `node build/src/ingest/createEmbeddings.js ./tmp/raw-devsite.json`
- `node build/src/ingest/storeEmbeddings.js ./tmp/embeddings-devsite.json`

