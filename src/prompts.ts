import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export function registerPrompts(server: McpServer): void {
  // 1. enrich_brief
  server.prompt(
    "enrich_brief",
    "Ground an Executive Intelligence Brief or news report with Wikidata QID tags, verified triples, and cross-links.",
    {
      brief_text: z.string().describe("The full raw text of the intelligence brief or article."),
      eib_flat_bullets: z
        .boolean()
        .optional()
        .describe("Whether to strictly enforce MacronX single-indentation, no-nested-bullet rules (default: true)."),
    },
    async (args) => {
      const enforceFlat = args.eib_flat_bullets !== false;

      const promptText = `You are a Senior OSINT Knowledge Grounding Agent.
Your task is to enrich the intelligence brief below with verified Wikidata triples using the \`wikidata-mcp\` tools.

### Operational Instructions:
1. **Entity Extraction**: Identify all named entities (states, leaders, agencies, corporations, military units, straits/chokepoints, conflicts) in the source text.
2. **Grounding Call**: Call the \`ground_entities\` tool with the extracted entity list. Provide expected domains (e.g., 'country', 'person', 'company', 'conflict', 'geographic_feature') where obvious.
3. **Handle Edge Cases**:
   - For ambiguous entities: inspect the returned \`fingerprint\` properties to pick the canonical entity.
   - For unmapped items: check whether they represent generic events (e.g. daily airstrike) rather than persistent entities (the ongoing war). Map to the underlying war or participating states.
4. **Compose the Enhanced Document**:
   - **Verbatim Integrity**: Preserve the original text's structure, headings, and prose verbatim.
   - **Inline QID Tags**: Tag the *first* mention of each resolved entity inline with backticks, e.g. \`Russia \`Q159\`\`.
   - **Wikidata Grounding**: Under each claim/SITREP bullet, add one line:
     \`▸ Wikidata grounding: [Entity] ([Property] [Value]), ...\`
   ${enforceFlat ? "- **MacronX EIB Rule**: Never create nested or indented bullets. Keep the `▸ Wikidata grounding:` line at the top indentation level or separated by a blank line." : ""}
5. **Resolution Notes**:
   - Conclude the document with a concise "Resolution Notes" section listing any mentions with no stable Wikidata match or significant caveats.

### Source Document:
${args.brief_text}`;

      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: promptText,
            },
          },
        ],
      };
    }
  );

  // 2. extract_and_ground_entities
  server.prompt(
    "extract_and_ground_entities",
    "Extract all named entities from a document and generate a structured Wikidata knowledge grounding report.",
    {
      text: z.string().describe("The text document to analyze."),
    },
    async (args) => {
      const promptText = `You are an OSINT knowledge graph researcher.
Analyze the provided text and extract a comprehensive knowledge catalog using the \`wikidata-mcp\` tools.

### Steps:
1. Extract all named entities and call \`ground_entities\`.
2. Inspect any shared alliances, conflicts, or geographic features in \`cross_links\`.
3. Output a structured grounding report with:
   - **Resolved Entities**: \`[Mention] -> [Label] (QID): instance of [Types], Inception: [Year], Country: [Country]\`
   - **Key Triples**: Outbound relations relevant to the claims in the text.
   - **Inter-Entity Connections**: Direct edges and shared hubs discovered between entities.
   - **Unmapped / Ambiguous Mentions**: Mentions that did not resolve, with notes on why.

### Document:
${args.text}`;

      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: promptText,
            },
          },
        ],
      };
    }
  );

  // 3. verify_claims
  server.prompt(
    "verify_claims",
    "Verify factual claims (memberships, alliances, borders, leadership, ownership) against the local Wikidata knowledge store.",
    {
      claims_text: z.string().describe("The factual claims or statements to verify."),
    },
    async (args) => {
      const promptText = `You are an OSINT factual verification analyst.
Fact-check the specific claims made in the text below using the \`wikidata-mcp\` knowledge tools.

### Verification Protocol:
1. Identify the subjects and claimed relationships (e.g. membership in NATO, border sharing, state ownership, current head of state).
2. Call \`resolve_entities\` to obtain authoritative QIDs.
3. Call \`get_entity_triples\` and \`find_cross_links\` to test whether the claimed relations exist in the Wikidata graph.
4. For alliance or treaty claims, call \`get_inbound_relations\` (e.g. predicate \`P463\`) to verify whether the entity is in the official roster.
5. Provide a clear verification verdict:
   - **CONFIRMED**: Backed by authoritative triples.
   - **CONTRADICTED / NOT IN ARCHIVE**: E.g., target entity is NOT a member of the claimed alliance or is distinct.
   - **TEMPORAL / SCOPE CAVEAT**: Facts reflect persistent structures rather than breaking headlines.

### Claims to Verify:
${args.claims_text}`;

      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: promptText,
            },
          },
        ],
      };
    }
  );
}
