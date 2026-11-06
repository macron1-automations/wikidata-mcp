# Wikidata MCP

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-emerald.svg)](LICENSE)

Model Context Protocol (MCP) server for local [Wikidata Truthy](https://github.com/macron1-automations/local-wikidata) knowledge grounding, entity resolution, and Executive Intelligence Brief (EIB) enrichment.

Designed as an MCP companion to the [MacronX](https://github.com/macron1-automations/macronx) OSINT pipeline and the self-hosted [local-wikidata](https://github.com/macron1-automations/local-wikidata) QLever instance (~2.93B best-rank triples on `localhost:7001/sparql`).

---

## What It Does

`wikidata-mcp` transitions the manual, prompt-heavy [wikidata-brief-enrich](https://github.com/macron1-automations/wikidata-brief-enrich) skill into a fast, deterministic, batch-oriented knowledge graph server:

- **Single-Shot Brief Grounding (`ground_entities`)**: Resolves all named entity mentions in an article or SITREP, retrieves curated outbound triples, discovers direct and shared connections (alliances, conflicts, water bodies), and pulls inbound rosters in a single composite call.
- **Layered Deterministic Disambiguation (`resolve_entities`)**: Matches exact labels, short names (`P1813`), and official names (`P1448`), filters against curated `P31` domain class presets and 1-hop `P279` subclasses, filters Wikimedia noise (disambiguation pages, taxa, scholarly articles, songs), and computes disambiguation fingerprints (head of state, inception, HQ, country) to resolve homonyms deterministically without LLM hallucination.
- **Batched Label Hydration & `@en`/`@mul` Deduplication**: Structural graph queries never join multiple `OPTIONAL { ?x rdfs:label ?label }` clauses inline. A dedicated `LabelHydrator` batch-resolves QIDs into clean English labels with an in-memory TTL cache, prioritizing `@en` over `@mul` and eliminating row duplication.
- **Sports & Entertainment Hub Filtering**: Strips recurring athletic tournaments, curling championships, and cups when discovering shared `P710` conflict/event hubs so sovereign states and leaders cross-reference only geopolitical summits, treaties, and conflicts.
- **Guarded SPARQL Escape Hatch (`query_sparql`)**: Allows agents to run custom read-only `SELECT`/`ASK` queries with auto-injected standard prefixes (`wd:`, `wdt:`, `rdfs:`, `xsd:`), enforced row limits (max 500), and automated QID/PID label hydration.
- **Editorial Prompts & Schema Resources**: Includes MCP prompts (`enrich_brief`, `verify_claims`, `extract_and_ground_entities`) and resources (`wikidata://schema/predicates`, `wikidata://schema/domains`, `wikidata://entities/{qid}`) that instruct any connected agent to produce MacronX-compliant flat-bullet executive briefs with inline `` `QID` `` tags and `▸ Wikidata grounding:` lines.

---

## Installation & Build

```bash
cd /Users/leonid/src/wikidata-mcp
npm install
npm run build
npm test
```

---

## Environment Configuration

| Variable | Required | Default | Description |
|---|---|---|---|
| `WIKIDATA_SPARQL_URL` | No | `http://localhost:7001/sparql` | URL of the local QLever SPARQL endpoint (e.g. `http://localhost:7001/sparql` or Tailscale host `http://100.96.219.81:7001/sparql`). |
| `WIKIDATA_TIMEOUT_MS` | No | `30000` | Per-query HTTP timeout in milliseconds. |
| `WIKIDATA_ALLOW_RAW_SPARQL` | No | `true` | When `false` or `0`, disables the `query_sparql` escape hatch tool. |
| `WIKIDATA_CACHE_TTL_MS` | No | `300000` | In-memory label cache TTL in milliseconds (5 minutes). Set to `0` to disable caching. |

---

## MCP Client Configuration

### 1. Antigravity IDE / Claude Desktop / Cursor

Add to your `mcpServers` configuration:

```json
{
  "mcpServers": {
    "wikidata": {
      "command": "node",
      "args": ["/Users/leonid/src/wikidata-mcp/dist/index.js"],
      "env": {
        "WIKIDATA_SPARQL_URL": "http://100.96.219.81:7001/sparql"
      }
    }
  }
}
```

### 2. Claude Code CLI

```bash
claude mcp add wikidata \
  -e WIKIDATA_SPARQL_URL=http://100.96.219.81:7001/sparql \
  -- node /Users/leonid/src/wikidata-mcp/dist/index.js
```

### 3. OpenCode (`opencode.json`)

```json
{
  "mcp": {
    "wikidata": {
      "command": "node",
      "args": ["/Users/leonid/src/wikidata-mcp/dist/index.js"],
      "env": {
        "WIKIDATA_SPARQL_URL": "http://100.96.219.81:7001/sparql"
      }
    }
  }
}
```

---

## MCP Surface Reference

### Tools (7 Domain Tools)

- **`check_health`**: Verifies connectivity to the local QLever SPARQL endpoint and reports total indexed triples (~2.93B) and query latency.
- **`ground_entities`**: Single composite tool for brief enrichment: resolves a batch of entity mentions, retrieves curated outbound triples, discovers direct links and shared alliances/conflicts, and pulls inbound rosters.
- **`resolve_entities`**: Resolves free-text mentions to Wikidata QIDs using label matching (`rdfs:label`, `P1813`, `P1448`), domain class filtering (`country`, `person`, `company`, `conflict`, `geographic_feature`, `infrastructure`, `military`, `organization`, etc.), and disambiguation fingerprints.
- **`get_entity_triples`**: Retrieves curated outbound triples for one or more entity QIDs with human-readable property and object labels (covering 48 OSINT predicates across all MacronX sectors).
- **`find_cross_links`**: Identifies direct edges (`A -> P -> B`) and shared group/conflict hubs between a set of resolved entities while filtering out sports and entertainment competitions.
- **`get_inbound_relations`**: Retrieves inbound rosters (e.g. member countries via `P463`, conflict participants via `P710`, basin countries via `P205`) with accurate total counts and truncation flags.
- **`query_sparql`**: Executes arbitrary read-only SPARQL `SELECT` or `ASK` queries with auto-injected prefixes, row limit clamping (max 500), and automated QID/PID label annotation.

### Resources (`wikidata://`)

- `wikidata://schema/predicates` — JSON catalog of all 48 default OSINT predicates and the ~200-property static English label dictionary.
- `wikidata://schema/domains` — JSON catalog of supported domain presets and their mapped root Wikidata class QIDs.
- `wikidata://guidelines/brief-enrichment` — Full editorial guidelines and formatting rules for grounding executive intelligence briefs.
- `wikidata://entities/{qid}` — Live outbound triple profile for any Wikidata entity QID.

### Guided Workflow Prompts

- `enrich_brief` (`brief_text`, `eib_flat_bullets`) — Guides the agent through extracting mentions, calling `ground_entities`, preserving wording verbatim, tagging first mentions inline (``Russia `Q159` ``), and placing `▸ Wikidata grounding:` lines following MacronX flat-bullet rules.
- `extract_and_ground_entities` (`text`) — Generates a structured knowledge catalog (entities, outbound triples, cross-links, unmapped items) from a source document.
- `verify_claims` (`claims_text`) — Fact-checks specific claims (memberships, alliances, borders, leadership, ownership) against the local Wikidata knowledge store.

---

## Development & Testing

```bash
# Typecheck
npm run typecheck

# Run unit and end-to-end test suite (vitest)
npm test

# Build production bundles (tsup)
npm run build
```

## License

MIT © 2026 Leonid Medovyy <leonid@macron1.io>
