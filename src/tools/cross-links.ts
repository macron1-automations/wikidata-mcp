import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { WikidataGraphEngine } from "../engine/graph.js";

export function registerCrossLinkTools(server: McpServer, graph: WikidataGraphEngine): void {
  server.tool(
    "find_cross_links",
    "Discover direct relationships and shared hubs (alliances, conflicts, parent entities, shared bodies of water) between a set of resolved Wikidata entities, filtering out irrelevant entertainment/sports hubs.",
    {
      qids: z
        .array(z.string())
        .describe("List of at least two Wikidata entity QIDs to cross-reference (e.g. ['Q159', 'Q212', 'Q7184'])."),
      max_direct_edges: z
        .number()
        .optional()
        .describe("Maximum number of direct inter-entity edges to return (default: 50)."),
      max_shared_hubs: z
        .number()
        .optional()
        .describe("Maximum number of shared hub connections to return (default: 30)."),
    },
    async (args) => {
      try {
        const results = await graph.findCrossLinks(args.qids, {
          max_direct_edges: args.max_direct_edges,
          max_shared_hubs: args.max_shared_hubs,
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
              text: `Failed to find cross links: ${err.message}`,
            },
          ],
        };
      }
    }
  );
}
