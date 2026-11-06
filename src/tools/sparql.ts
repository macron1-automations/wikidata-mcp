import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { WikidataClient, extractEntityId, isPid, isQid } from "../client.js";
import { getPropertyLabel } from "../schema/predicates.js";

const MUTATING_KEYWORDS_REGEX = /\b(INSERT|DELETE|DROP|LOAD|CLEAR|CREATE|COPY|MOVE|ADD)\b/i;

export function registerSparqlTools(server: McpServer, client: WikidataClient): void {
  server.tool(
    "query_sparql",
    "Execute an arbitrary read-only SPARQL SELECT or ASK query against the local QLever Wikidata endpoint. Auto-declares standard prefixes (wd:, wdt:, rdfs:, xsd:) and enforces query limits.",
    {
      query: z.string().describe("Read-only SPARQL query (SELECT or ASK)."),
      limit: z
        .number()
        .optional()
        .describe("Maximum rows to return (clamped between 1 and 500, default: 100)."),
      hydrate_labels: z
        .boolean()
        .optional()
        .describe("Whether to automatically resolve entity QID and property PID labels in results (default: true)."),
    },
    async (args) => {
      if (!client.config.allowRawSparql) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: "Raw SPARQL queries are disabled on this server (WIKIDATA_ALLOW_RAW_SPARQL=false).",
            },
          ],
        };
      }

      const rawQuery = args.query.trim();

      // Safety check: prohibit modifying SPARQL statements
      if (MUTATING_KEYWORDS_REGEX.test(rawQuery)) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: "Forbidden SPARQL query: only read-only SELECT and ASK queries are permitted.",
            },
          ],
        };
      }

      // Check query form
      const strippedComments = rawQuery.replace(/#[^\n\r]*/g, "").trim();
      const isSelect = /\bSELECT\b/i.test(strippedComments);
      const isAsk = /\bASK\b/i.test(strippedComments);

      if (!isSelect && !isAsk) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: "Query must be a SELECT or ASK SPARQL query.",
            },
          ],
        };
      }

      let finalQuery = rawQuery;
      const rowLimit = Math.min(Math.max(args.limit || 100, 1), 500);

      if (isSelect) {
        const limitMatch = strippedComments.match(/\bLIMIT\s+(\d+)/i);
        if (limitMatch) {
          const currentLimit = parseInt(limitMatch[1], 10);
          if (currentLimit > 500) {
            finalQuery = finalQuery.replace(/\bLIMIT\s+\d+/i, `LIMIT ${rowLimit}`);
          }
        } else {
          finalQuery = `${finalQuery}\nLIMIT ${rowLimit}`;
        }
      }

      try {
        const resp = await client.query(finalQuery);

        if (args.hydrate_labels !== false && resp.results?.bindings) {
          const qidsToHydrate = new Set<string>();
          for (const b of resp.results.bindings) {
            for (const val of Object.values(b)) {
              if (val.type === "uri") {
                const id = extractEntityId(val.value);
                if (isQid(id)) qidsToHydrate.add(id);
              }
            }
          }

          const labelsMap = await client.hydrateLabels(Array.from(qidsToHydrate));

          // Enrich bindings with label annotations
          const enrichedBindings = resp.results.bindings.map((binding) => {
            const row: Record<string, any> = {};
            for (const [varName, val] of Object.entries(binding)) {
              const id = extractEntityId(val.value);
              row[varName] = val.value;
              if (isQid(id)) {
                row[`${varName}Label`] = labelsMap.get(id) || id;
              } else if (isPid(id)) {
                row[`${varName}Label`] = getPropertyLabel(id);
              }
            }
            return row;
          });

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    head: resp.head,
                    results: { bindings: enrichedBindings },
                    meta: resp.meta,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(resp, null, 2),
            },
          ],
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `SPARQL execution error: ${err.message}`,
            },
          ],
        };
      }
    }
  );
}
