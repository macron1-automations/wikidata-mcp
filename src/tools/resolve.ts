import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { EntityResolver } from "../engine/resolver.js";
import { SupportedDomain } from "../types.js";

const domainSchema = z.enum([
  "country",
  "person",
  "organization",
  "company",
  "central_bank",
  "political_party",
  "military",
  "conflict",
  "geographic_feature",
  "infrastructure",
  "product_or_tech",
  "any",
]);

const entityInputSchema = z.object({
  mention: z.string().describe("The text mention to resolve (e.g. 'China', 'Gazprom', 'Strait of Hormuz')."),
  alternate_labels: z
    .array(z.string())
    .optional()
    .describe("Known aliases, official names, or acronyms to query in parallel."),
  domain: domainSchema
    .optional()
    .describe("Target semantic domain to constrain P31 classes (default: 'any')."),
  class_qids: z
    .array(z.string())
    .optional()
    .describe("Specific Wikidata class QIDs (P31/P279) to constrain candidate entities to."),
  max_candidates: z
    .number()
    .optional()
    .describe("Maximum number of candidates to return for ambiguous mentions (default: 5)."),
});

export function registerResolveTools(server: McpServer, resolver: EntityResolver): void {
  server.tool(
    "resolve_entities",
    "Resolve a batch of named entity mentions to Wikidata QIDs using deterministic label matching, domain P31/P279 class filtering, homonym scoring, and disambiguation fingerprints.",
    {
      entities: z.array(entityInputSchema).describe("List of entity mentions to resolve in batch."),
    },
    async (args) => {
      try {
        const results = await resolver.resolveBatch(
          args.entities.map((e) => ({
            mention: e.mention,
            alternate_labels: e.alternate_labels,
            domain: e.domain as SupportedDomain | undefined,
            class_qids: e.class_qids,
            max_candidates: e.max_candidates,
          }))
        );

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
              text: `Entity resolution failed: ${err.message}`,
            },
          ],
        };
      }
    }
  );
}
