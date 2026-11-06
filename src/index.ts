import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { parseConfig } from "./config.js";
import { createWikidataMcpServer } from "./server.js";

async function main() {
  try {
    const config = parseConfig(process.env);
    const server = createWikidataMcpServer(config);
    const transport = new StdioServerTransport();

    process.stderr.write(
      `[wikidata-mcp] Starting server connected to ${config.sparqlUrl} (rawSparql: ${config.allowRawSparql})\n`
    );

    await server.connect(transport);

    process.stderr.write("[wikidata-mcp] Server ready and listening on stdio.\n");
  } catch (err: any) {
    process.stderr.write(`[wikidata-mcp] Fatal error: ${err.message}\n`);
    process.exit(1);
  }
}

main();
