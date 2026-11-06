import { WikidataConfig } from "./config.js";
import { SparqlResponse } from "./types.js";

export class WikidataClientError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly originalError?: unknown
  ) {
    super(message);
    this.name = "WikidataClientError";
  }
}

export function escapeSparqlString(str: string): string {
  return str
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t");
}

export function isQid(id: string): boolean {
  return /^Q[1-9]\d*$/.test(id);
}

export function isPid(id: string): boolean {
  return /^P[1-9]\d*$/.test(id);
}

export function extractEntityId(uriOrId: string): string {
  if (!uriOrId) return "";
  if (isQid(uriOrId) || isPid(uriOrId)) return uriOrId;
  const match = uriOrId.match(/[QP][1-9]\d*$/);
  return match ? match[0] : uriOrId;
}

export class WikidataClient {
  private labelCache = new Map<string, { label: string; expiry: number }>();

  constructor(public readonly config: WikidataConfig) {}

  public ensurePrefixes(query: string): string {
    const prefixes: string[] = [];
    if (!/PREFIX\s+wd:\s*<http:\/\/www\.wikidata\.org\/entity\/>/i.test(query)) {
      prefixes.push("PREFIX wd: <http://www.wikidata.org/entity/>");
    }
    if (!/PREFIX\s+wdt:\s*<http:\/\/www\.wikidata\.org\/prop\/direct\/>/i.test(query)) {
      prefixes.push("PREFIX wdt: <http://www.wikidata.org/prop/direct/>");
    }
    if (!/PREFIX\s+rdfs:\s*<http:\/\/www\.w3\.org\/2000\/01\/rdf-schema#>/i.test(query)) {
      prefixes.push("PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>");
    }
    if (!/PREFIX\s+xsd:\s*<http:\/\/www\.w3\.org\/2001\/XMLSchema#>/i.test(query)) {
      prefixes.push("PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>");
    }

    if (prefixes.length === 0) {
      return query;
    }
    return `${prefixes.join("\n")}\n${query}`;
  }

  public async query(sparql: string): Promise<SparqlResponse> {
    const fullQuery = this.ensurePrefixes(sparql.trim());

    try {
      const response = await fetch(this.config.sparqlUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/sparql-results+json",
        },
        body: new URLSearchParams({ query: fullQuery }),
        signal: AbortSignal.timeout(this.config.timeoutMs),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new WikidataClientError(
          `QLever SPARQL query returned HTTP ${response.status}: ${errText.slice(0, 500)}`,
          response.status
        );
      }

      const json = (await response.json()) as SparqlResponse;
      return json;
    } catch (err: any) {
      if (err instanceof WikidataClientError) {
        throw err;
      }
      if (err?.name === "TimeoutError") {
        throw new WikidataClientError(
          `SPARQL query timed out after ${this.config.timeoutMs}ms against ${this.config.sparqlUrl}`,
          408,
          err
        );
      }
      throw new WikidataClientError(
        `Failed to reach QLever SPARQL endpoint at ${this.config.sparqlUrl}: ${err?.message || String(err)}. Ensure your local-wikidata container is running (qlever.server.wikidata-truthy on port 7001).`,
        undefined,
        err
      );
    }
  }

  public async checkHealth(): Promise<{
    status: "ok" | "error";
    totalTriples?: number;
    queryLatencyMs: number;
    sparqlUrl: string;
  }> {
    const t0 = Date.now();
    try {
      const res = await this.query("SELECT (COUNT(*) AS ?c) WHERE { ?s ?p ?o }");
      const latency = Date.now() - t0;
      const countVal = res.results.bindings[0]?.c?.value;
      const totalTriples = countVal ? parseInt(countVal, 10) : undefined;
      return {
        status: "ok",
        totalTriples,
        queryLatencyMs: latency,
        sparqlUrl: this.config.sparqlUrl,
      };
    } catch (err) {
      const latency = Date.now() - t0;
      throw new WikidataClientError(
        `QLever health check failed against ${this.config.sparqlUrl} (${latency}ms): ${(err as Error).message}`
      );
    }
  }

  public async hydrateLabels(qids: string[]): Promise<Map<string, string>> {
    const result = new Map<string, string>();
    const uniqueQids = Array.from(new Set(qids.map(extractEntityId).filter(isQid)));
    if (uniqueQids.length === 0) {
      return result;
    }

    const now = Date.now();
    const missing: string[] = [];

    for (const qid of uniqueQids) {
      const cached = this.labelCache.get(qid);
      if (cached && (this.config.cacheTtlMs === 0 || cached.expiry > now)) {
        result.set(qid, cached.label);
      } else {
        missing.push(qid);
      }
    }

    if (missing.length === 0) {
      return result;
    }

    // Batch in chunks of 200
    const chunkSize = 200;
    for (let i = 0; i < missing.length; i += chunkSize) {
      const chunk = missing.slice(i, i + chunkSize);
      const values = chunk.map((q) => `wd:${q}`).join(" ");
      const query = `
        SELECT ?entity ?label WHERE {
          VALUES ?entity { ${values} }
          ?entity rdfs:label ?label .
        }
      `;

      const response = await this.query(query);

      // Group candidate labels per QID to prioritize @en > @mul > other
      const perEntityLabels = new Map<string, { en?: string; mul?: string; other?: string }>();

      for (const b of response.results.bindings) {
        const qid = extractEntityId(b.entity?.value);
        if (!qid) continue;
        const labelObj = b.label;
        if (!labelObj) continue;

        const lang = labelObj["xml:lang"] || "";
        const val = labelObj.value;

        let entry = perEntityLabels.get(qid);
        if (!entry) {
          entry = {};
          perEntityLabels.set(qid, entry);
        }

        if (lang === "en") {
          entry.en = val;
        } else if (lang === "mul") {
          entry.mul = val;
        } else if (!entry.other) {
          entry.other = val;
        }
      }

      for (const qid of chunk) {
        const entry = perEntityLabels.get(qid);
        const bestLabel = entry?.en || entry?.mul || entry?.other || qid;
        result.set(qid, bestLabel);

        if (this.config.cacheTtlMs > 0) {
          this.labelCache.set(qid, {
            label: bestLabel,
            expiry: now + this.config.cacheTtlMs,
          });
        }
      }
    }

    return result;
  }
}
