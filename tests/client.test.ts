import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  WikidataClient,
  WikidataClientError,
  escapeSparqlString,
  extractEntityId,
  isPid,
  isQid,
} from "../src/client.js";
import { WikidataConfig } from "../src/config.js";

function sparqlResponse(bindings: Record<string, any>[], vars: string[] = []): Response {
  return new Response(
    JSON.stringify({
      head: { vars },
      results: { bindings },
      meta: { "query-time-ms": 10, "result-size-total": bindings.length },
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/sparql-results+json" },
    }
  );
}

describe("WikidataClient and helpers", () => {
  let fetchSpy: any;
  const config: WikidataConfig = {
    sparqlUrl: "http://localhost:7001/sparql",
    timeoutMs: 5000,
    allowRawSparql: true,
    cacheTtlMs: 60000,
  };

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("validates QIDs and PIDs correctly", () => {
    expect(isQid("Q159")).toBe(true);
    expect(isQid("Q1")).toBe(true);
    expect(isQid("Q0")).toBe(false);
    expect(isQid("P31")).toBe(false);
    expect(isQid("Russia")).toBe(false);

    expect(isPid("P31")).toBe(true);
    expect(isPid("P1082")).toBe(true);
    expect(isPid("Q159")).toBe(false);
  });

  it("extracts entity ID from URIs or returns bare ID", () => {
    expect(extractEntityId("http://www.wikidata.org/entity/Q159")).toBe("Q159");
    expect(extractEntityId("http://www.wikidata.org/prop/direct/P31")).toBe("P31");
    expect(extractEntityId("Q159")).toBe("Q159");
    expect(extractEntityId("P31")).toBe("P31");
  });

  it("escapes SPARQL strings safely", () => {
    expect(escapeSparqlString('Hello "World"')).toBe('Hello \\"World\\"');
    expect(escapeSparqlString("Line 1\nLine 2")).toBe("Line 1\\nLine 2");
  });

  it("auto-injects standard prefixes if missing", () => {
    const client = new WikidataClient(config);
    const query = "SELECT * WHERE { ?s ?p ?o }";
    const withPrefixes = client.ensurePrefixes(query);

    expect(withPrefixes).toContain("PREFIX wd: <http://www.wikidata.org/entity/>");
    expect(withPrefixes).toContain("PREFIX wdt: <http://www.wikidata.org/prop/direct/>");
    expect(withPrefixes).toContain("PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>");
  });

  it("hydrates labels prioritizing @en over @mul and caches results", async () => {
    fetchSpy.mockResolvedValueOnce(
      sparqlResponse([
        {
          entity: { type: "uri", value: "http://www.wikidata.org/entity/Q159" },
          label: { type: "literal", value: "Russia", "xml:lang": "mul" },
        },
        {
          entity: { type: "uri", value: "http://www.wikidata.org/entity/Q159" },
          label: { type: "literal", value: "Russian Federation", "xml:lang": "en" },
        },
        {
          entity: { type: "uri", value: "http://www.wikidata.org/entity/Q148" },
          label: { type: "literal", value: "People's Republic of China", "xml:lang": "mul" },
        },
      ])
    );

    const client = new WikidataClient(config);
    const labels1 = await client.hydrateLabels(["Q159", "Q148"]);

    expect(labels1.get("Q159")).toBe("Russian Federation"); // prioritized @en
    expect(labels1.get("Q148")).toBe("People's Republic of China"); // @mul used when no @en
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Subsequent call should hit in-memory cache without extra fetch
    const labels2 = await client.hydrateLabels(["Q159"]);
    expect(labels2.get("Q159")).toBe("Russian Federation");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("formats actionable error messages on connection failure", async () => {
    fetchSpy.mockRejectedValueOnce(new Error("connect ECONNREFUSED 127.0.0.1:7001"));

    const client = new WikidataClient(config);
    await expect(client.checkHealth()).rejects.toThrowError(
      /Ensure your local-wikidata container is running/
    );
  });
});
