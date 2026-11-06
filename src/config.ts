export interface WikidataConfig {
  sparqlUrl: string;
  timeoutMs: number;
  allowRawSparql: boolean;
  cacheTtlMs: number;
}

export function parseConfig(env: NodeJS.ProcessEnv = process.env): WikidataConfig {
  const rawUrl = env.WIKIDATA_SPARQL_URL?.trim() || "http://localhost:7001/sparql";

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(`Invalid URL format in WIKIDATA_SPARQL_URL: "${rawUrl}"`);
  }

  // Normalize path: if given origin only or / without /sparql, point to /sparql
  let path = parsed.pathname.replace(/\/+$/, "");
  if (!path || path === "") {
    path = "/sparql";
  }

  const sparqlUrl = `${parsed.origin}${path}`;

  const timeoutMs = env.WIKIDATA_TIMEOUT_MS ? parseInt(env.WIKIDATA_TIMEOUT_MS, 10) : 30000;
  const allowRawSparql = env.WIKIDATA_ALLOW_RAW_SPARQL !== "false" && env.WIKIDATA_ALLOW_RAW_SPARQL !== "0";
  const cacheTtlMs = env.WIKIDATA_CACHE_TTL_MS ? parseInt(env.WIKIDATA_CACHE_TTL_MS, 10) : 300000;

  return {
    sparqlUrl,
    timeoutMs: isNaN(timeoutMs) || timeoutMs <= 0 ? 30000 : timeoutMs,
    allowRawSparql,
    cacheTtlMs: isNaN(cacheTtlMs) || cacheTtlMs < 0 ? 300000 : cacheTtlMs,
  };
}
