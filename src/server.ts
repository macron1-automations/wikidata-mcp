import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WikidataClient } from "./client.js";
import { WikidataConfig } from "./config.js";
import { WikidataGraphEngine } from "./engine/graph.js";
import { EntityResolver } from "./engine/resolver.js";
import { registerPrompts } from "./prompts.js";
import { registerResources } from "./resources.js";
import { registerCrossLinkTools } from "./tools/cross-links.js";
import { registerGroundTools } from "./tools/ground.js";
import { registerInboundTools } from "./tools/inbound.js";
import { registerResolveTools } from "./tools/resolve.js";
import { registerSparqlTools } from "./tools/sparql.js";
import { registerSystemTools } from "./tools/system.js";
import { registerTripleTools } from "./tools/triples.js";

const SERVER_INSTRUCTIONS = `This server connects to a local, high-performance QLever Wikidata Truthy SPARQL endpoint (~2.93B triples).
Use it to ground free-text intelligence briefs, reports, and news analysis with verified Wikidata entity QIDs, outbound triples, cross-links, and inbound rosters.

Key tools:
- ground_entities: Single composite tool for brief enrichment. Resolves mentions, retrieves triples, discovers cross-links, and pulls inbound alliance/conflict rosters.
- resolve_entities: Batched entity resolution with domain class filtering and disambiguation fingerprints.
- get_entity_triples: Outbound triples with clean labels and deduplicated values.
- find_cross_links: Direct edges and shared hubs (alliances, conflicts, geographic features) between resolved entities.
- get_inbound_relations: Inbound member rosters (P463), conflict participants (P710), basin countries (P205), etc.
- query_sparql: Guarded read-only SPARQL query execution for custom lookups.
- check_health: Test endpoint availability, triple count, and latency.
`;

export function createWikidataMcpServer(config: WikidataConfig): McpServer {
  const client = new WikidataClient(config);
  const resolver = new EntityResolver(client);
  const graph = new WikidataGraphEngine(client);

  const server = new McpServer(
    {
      name: "wikidata-mcp",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
        resources: {},
        prompts: {},
      },
      instructions: SERVER_INSTRUCTIONS,
    }
  );

  registerSystemTools(server, client);
  registerResolveTools(server, resolver);
  registerTripleTools(server, graph);
  registerInboundTools(server, graph);
  registerCrossLinkTools(server, graph);
  registerGroundTools(server, resolver, graph);
  registerSparqlTools(server, client);

  registerResources(server, graph);
  registerPrompts(server);

  return server;
}
