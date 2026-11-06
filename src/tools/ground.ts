import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { WikidataGraphEngine } from "../engine/graph.js";
import { EntityResolver } from "../engine/resolver.js";
import { GroundEntitiesResult, SupportedDomain } from "../types.js";

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

const entityMentionSchema = z.object({
  mention: z.string().describe("Entity mention string from the brief."),
  alternate_labels: z
    .array(z.string())
    .optional()
    .describe("Known aliases, official names, or expansions."),
  domain: domainSchema
    .optional()
    .describe("Expected semantic domain to constrain resolution."),
  class_qids: z
    .array(z.string())
    .optional()
    .describe("Specific class QIDs to constrain candidate entities to."),
});

export function registerGroundTools(
  server: McpServer,
  resolver: EntityResolver,
  graph: WikidataGraphEngine
): void {
  server.tool(
    "ground_entities",
    "Single composite tool to ground a brief: resolves all mentions to Wikidata QIDs, retrieves curated outbound triples, discovers inter-entity cross-links and shared hubs, and retrieves key inbound rosters.",
    {
      entities: z.array(entityMentionSchema).describe("List of entity mentions extracted from the brief."),
      predicates: z
        .array(z.string())
        .optional()
        .describe("Optional override list of predicate IDs for outbound triples. Defaults to full OSINT whitelist."),
    },
    async (args) => {
      try {
        // 1. Resolve mentions
        const resolvedEntities = await resolver.resolveBatch(
          args.entities.map((e) => ({
            mention: e.mention,
            alternate_labels: e.alternate_labels,
            domain: e.domain as SupportedDomain | undefined,
            class_qids: e.class_qids,
          }))
        );

        const resolvedQids = resolvedEntities
          .filter((e) => e.status === "resolved" && e.resolved_entity?.qid)
          .map((e) => e.resolved_entity!.qid);

        // 2. Fetch outbound triples & 3. Find cross-links in parallel
        const [outbound, cross_links] = await Promise.all([
          resolvedQids.length > 0
            ? graph.getEntityTriples(resolvedQids, { predicates: args.predicates })
            : Promise.resolve([]),
          resolvedQids.length >= 2
            ? graph.findCrossLinks(resolvedQids)
            : Promise.resolve({ direct_edges: [], shared_hubs: [] }),
        ]);

        // 4. Inbound relations: identify any resolved alliance/bloc/conflict hubs
        const inboundTargetQids = new Set<string>();
        for (const re of resolvedEntities) {
          if (re.status === "resolved" && re.resolved_entity) {
            const types = (re.resolved_entity.instance_of || []).map((t) => t.toLowerCase());
            if (
              types.some((t) =>
                t.includes("alliance") ||
                t.includes("organization") ||
                t.includes("union") ||
                t.includes("conflict") ||
                t.includes("war")
              )
            ) {
              inboundTargetQids.add(re.resolved_entity.qid);
            }
          }
        }

        // Also check any shared hubs discovered in cross_links
        for (const hub of cross_links.shared_hubs) {
          inboundTargetQids.add(hub.hub_qid);
        }

        const inbound =
          inboundTargetQids.size > 0
            ? await graph.getInboundRelations(Array.from(inboundTargetQids).slice(0, 5), {
                predicates: ["P463", "P710", "P205"],
                limit_per_relation: 25,
              })
            : [];

        const resolvedCount = resolvedEntities.filter((e) => e.status === "resolved").length;
        const ambiguousCount = resolvedEntities.filter((e) => e.status === "ambiguous").length;
        const unmappedCount = resolvedEntities.filter((e) => e.status === "not_mapped").length;

        const result: GroundEntitiesResult = {
          entities: resolvedEntities,
          outbound,
          inbound,
          cross_links,
          summary: {
            total_mentions: args.entities.length,
            resolved_count: resolvedCount,
            ambiguous_count: ambiguousCount,
            unmapped_count: unmappedCount,
          },
        };

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Brief grounding pipeline failed: ${err.message}`,
            },
          ],
        };
      }
    }
  );
}
