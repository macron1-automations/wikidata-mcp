import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { WikidataGraphEngine } from "../engine/graph.js";

export function registerTripleTools(server: McpServer, graph: WikidataGraphEngine): void {
  server.tool(
    "get_entity_triples",
    "Retrieve curated outbound Wikidata triples for one or more entity QIDs. Returns grouped, deduplicated facts with human-readable predicate and object labels.",
    {
      qids: z.array(z.string()).describe("List of Wikidata entity QIDs (e.g. ['Q159', 'Q148'])."),
      predicates: z
        .array(z.string())
        .optional()
        .describe("Specific property IDs (e.g. ['P31', 'P36', 'P463']) to restrict retrieval to. Defaults to curated OSINT whitelist."),
      include_unwhitelisted: z
        .boolean()
        .optional()
        .describe("Set true to retrieve all direct outbound properties without whitelist filtering (capped at 2000 bindings)."),
      max_values_per_predicate: z
        .number()
        .optional()
        .describe("Maximum number of values to retain per predicate (default: 20)."),
    },
    async (args) => {
      try {
        const results = await graph.getEntityTriples(args.qids, {
          predicates: args.predicates,
          include_unwhitelisted: args.include_unwhitelisted,
          max_values_per_predicate: args.max_values_per_predicate,
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(results, null, 2),
            },
          ],
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Failed to retrieve entity triples: ${err.message}`,
            },
          ],
        };
      }
    }
  );
}
