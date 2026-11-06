import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WikidataClient } from "../client.js";

export function registerSystemTools(server: McpServer, client: WikidataClient): void {
  server.tool(
    "check_health",
    "Verify connectivity to the local QLever Wikidata Truthy SPARQL endpoint and return the total indexed triple count and query latency.",
    {},
    async () => {
      try {
        const health = await client.checkHealth();
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(health, null, 2),
            },
          ],
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Health check failed: ${err.message}`,
            },
          ],
        };
      }
    }
  );
}
