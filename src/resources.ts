import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { isQid } from "./client.js";
import { WikidataGraphEngine } from "./engine/graph.js";
import { getAllDomainPresets } from "./schema/domains.js";
import { DEFAULT_OSINT_PREDICATES, PROPERTY_LABELS } from "./schema/predicates.js";

const BRIEF_ENRICHMENT_GUIDELINES = `# Wikidata Brief Enrichment Guidelines

## Purpose
Resolve named entities against the local Wikidata Truthy SPARQL endpoint (English-only, ~2.9B triples) and enrich intelligence briefs with verified triples while keeping prose clear and scannable.

## Workflow
1. Extract named entities from the source briefing, noting the domain context (e.g., country, leader, company, alliance, geographic feature).
2. Call \`ground_entities\` with the extracted mentions.
3. Review ambiguous mentions or unmapped items:
   - For ambiguous items, inspect fingerprint fields (inception, country, HQ, leader) or call \`resolve_entities\` with specific \`class_qids\`.
   - Distinguish persistent entities from transient news events: events (e.g. daily strikes, flash protests) rarely have stable Wikidata items; link to the underlying war, conflict, or participating state.
4. Compose the enriched brief:
   - Preserve the source document's structure, headings, and wording verbatim.
   - Tag the FIRST mention of each resolved entity inline using backticks, e.g. \`Russia \`Q159\`\`.
   - Beneath each claim or SITREP bullet, append a single \`▸ Wikidata grounding:\` line with 2–5 curated triples.
   - For MacronX Executive Intelligence Briefs (EIB): never use nested bullets; keep the grounding line at the same indentation level or separated by a blank line.
5. Close the document with a short "Resolution notes" section documenting unmapped entities, caveats, or disambiguation choices.
`;

export function registerResources(server: McpServer, graph: WikidataGraphEngine): void {
  // 1. Predicates catalog
  server.resource(
    "schema-predicates",
    "wikidata://schema/predicates",
    {
      description: "Curated OSINT predicate whitelist and static English label dictionary for Wikidata properties.",
      mimeType: "application/json",
    },
    async (uri) => {
      const payload = {
        default_osint_predicates: DEFAULT_OSINT_PREDICATES.map((pid) => ({
          pid,
          label: PROPERTY_LABELS[pid] || pid,
        })),
        property_labels_dictionary: PROPERTY_LABELS,
      };

      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(payload, null, 2),
          },
        ],
      };
    }
  );

  // 2. Domains catalog
  server.resource(
    "schema-domains",
    "wikidata://schema/domains",
    {
      description: "Catalog of supported semantic domain presets and their mapped root Wikidata class QIDs.",
      mimeType: "application/json",
    },
    async (uri) => {
      const presets = getAllDomainPresets();
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(presets, null, 2),
          },
        ],
      };
    }
  );

  // 3. Guidelines
  server.resource(
    "guidelines-brief-enrichment",
    "wikidata://guidelines/brief-enrichment",
    {
      description: "Editorial guidelines and formatting rules for grounding executive intelligence briefs with Wikidata.",
      mimeType: "text/markdown",
    },
    async (uri) => {
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "text/markdown",
            text: BRIEF_ENRICHMENT_GUIDELINES,
          },
        ],
      };
    }
  );

  // 4. Entity profile template
  server.resource(
    "entity-profile",
    new ResourceTemplate("wikidata://entities/{qid}", { list: undefined }),
    {
      description: "Live outbound triple profile for any Wikidata entity QID.",
      mimeType: "application/json",
    },
    async (uri, { qid }) => {
      const qidStr = Array.isArray(qid) ? qid[0] : qid;
      if (!isQid(qidStr)) {
        throw new Error(`Invalid Wikidata QID: "${qidStr}"`);
      }

      const profiles = await graph.getEntityTriples([qidStr]);
      const profile = profiles[0] || { qid: qidStr, label: qidStr, triples: [] };

      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(profile, null, 2),
          },
        ],
      };
    }
  );
}
