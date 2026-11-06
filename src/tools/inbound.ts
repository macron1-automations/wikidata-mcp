import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { WikidataGraphEngine } from "../engine/graph.js";

export function registerInboundTools(server: McpServer, graph: WikidataGraphEngine): void {
  server.tool(
    "get_inbound_relations",
    "Retrieve inbound relations for target entities (e.g. alliance members via P463, conflict participants via P710, basin countries via P205, corporate owners via P127). Includes accurate total counts and truncation flags.",
    {
      target_qids: z
        .array(z.string())
        .describe("Target entity QIDs (e.g. ['Q7184'] for NATO, ['Q110999040'] for Russo-Ukrainian War)."),
      predicates: z
        .array(z.string())
        .optional()
        .describe("Inbound predicate IDs (e.g. ['P463', 'P710', 'P205', 'P17']). Defaults to ['P463', 'P710', 'P205', 'P17', 'P749', 'P127', 'P355']."),
      subject_domain: z
        .string()
        .optional()
        .describe("Constrain inbound subjects to a domain (e.g. 'country' to only list member countries)."),
      subject_class_qids: z
        .array(z.string())
        .optional()
        .describe("Constrain inbound subjects to specific class QIDs."),
      filter_subject_qids: z
        .array(z.string())
        .optional()
        .describe("Filter inbound subjects to check membership only within a specific candidate set."),
      limit_per_relation: z
        .number()
        .optional()
        .describe("Maximum subjects to return per relation (default: 50)."),
    },
    async (args) => {
      try {
        const results = await graph.getInboundRelations(args.target_qids, {
          predicates: args.predicates,
          subject_domain: args.subject_domain,
          subject_class_qids: args.subject_class_qids,
          filter_subject_qids: args.filter_subject_qids,
          limit_per_relation: args.limit_per_relation,
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
              text: `Failed to retrieve inbound relations: ${err.message}`,
            },
          ],
        };
      }
    }
  );
}
