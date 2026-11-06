import { describe, expect, it } from "vitest";
import { parseConfig } from "../src/config.js";

describe("WikidataConfig parsing", () => {
  it("defaults to localhost:7001/sparql and standard options", () => {
    const config = parseConfig({});
    expect(config.sparqlUrl).toBe("http://localhost:7001/sparql");
    expect(config.timeoutMs).toBe(30000);
    expect(config.allowRawSparql).toBe(true);
    expect(config.cacheTtlMs).toBe(300000);
  });

  it("normalizes origin-only URL to /sparql", () => {
    const config = parseConfig({ WIKIDATA_SPARQL_URL: "http://100.96.219.81:7001" });
    expect(config.sparqlUrl).toBe("http://100.96.219.81:7001/sparql");
  });

  it("preserves explicit SPARQL endpoint path", () => {
    const config = parseConfig({ WIKIDATA_SPARQL_URL: "http://custom-host:8080/my-sparql" });
    expect(config.sparqlUrl).toBe("http://custom-host:8080/my-sparql");
  });

  it("parses custom timeout, raw SPARQL toggle, and cache TTL", () => {
    const config = parseConfig({
      WIKIDATA_TIMEOUT_MS: "15000",
      WIKIDATA_ALLOW_RAW_SPARQL: "false",
      WIKIDATA_CACHE_TTL_MS: "0",
    });
    expect(config.timeoutMs).toBe(15000);
    expect(config.allowRawSparql).toBe(false);
    expect(config.cacheTtlMs).toBe(0);
  });

  it("throws on invalid URL format", () => {
    expect(() => parseConfig({ WIKIDATA_SPARQL_URL: "not-a-valid-url" })).toThrow(
      /Invalid URL format/
    );
  });
});
