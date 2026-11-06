import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WikidataClient } from "../src/client.js";
import { WikidataConfig } from "../src/config.js";
import { EntityResolver } from "../src/engine/resolver.js";

function sparqlResponse(bindings: Record<string, any>[]): Response {
  return new Response(
    JSON.stringify({
      head: { vars: Object.keys(bindings[0] || {}) },
      results: { bindings },
      meta: { "query-time-ms": 5, "result-size-total": bindings.length },
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/sparql-results+json" },
    }
  );
}

describe("EntityResolver", () => {
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

  it("resolves alias/short-name 'China' to Q148 (People's Republic of China) with country domain", async () => {
    const client = new WikidataClient(config);
    const resolver = new EntityResolver(client);

    // 1. Stage 1 query mock: matches Q148 via P1813 / label
    fetchSpy
      .mockResolvedValueOnce(
        sparqlResponse([
          {
            s: { type: "uri", value: "http://www.wikidata.org/entity/Q148" },
            namePred: { type: "uri", value: "http://www.wikidata.org/prop/direct/P1813" },
            searchLabel: { type: "literal", value: "China" },
            type: { type: "uri", value: "http://www.wikidata.org/entity/Q3624078" },
            isDirect: { type: "literal", value: "true" },
            isSubclass: { type: "literal", value: "false" },
          },
        ])
      )
      // 2. Candidate label hydration mock
      .mockResolvedValueOnce(
        sparqlResponse([
          {
            entity: { type: "uri", value: "http://www.wikidata.org/entity/Q148" },
            label: { type: "literal", value: "People's Republic of China", "xml:lang": "en" },
          },
        ])
      )
      // 3. Candidate fingerprint mock (country, inception, head of state)
      .mockResolvedValueOnce(
        sparqlResponse([
          {
            s: { type: "uri", value: "http://www.wikidata.org/entity/Q148" },
            p: { type: "uri", value: "http://www.wikidata.org/prop/direct/P571" },
            o: { type: "literal", value: "+1949-10-01T00:00:00Z" },
          },
          {
            s: { type: "uri", value: "http://www.wikidata.org/entity/Q148" },
            p: { type: "uri", value: "http://www.wikidata.org/prop/direct/P35" },
            o: { type: "uri", value: "http://www.wikidata.org/entity/Q15031" },
          },
        ])
      )
      // 4. Object label hydration mock (Xi Jinping for P35)
      .mockResolvedValueOnce(
        sparqlResponse([
          {
            entity: { type: "uri", value: "http://www.wikidata.org/entity/Q15031" },
            label: { type: "literal", value: "Xi Jinping", "xml:lang": "en" },
          },
        ])
      )
      // 5. Type label hydration mock (Q3624078 -> sovereign state)
      .mockResolvedValueOnce(
        sparqlResponse([
          {
            entity: { type: "uri", value: "http://www.wikidata.org/entity/Q3624078" },
            label: { type: "literal", value: "sovereign state", "xml:lang": "en" },
          },
        ])
      );

    const results = await resolver.resolveBatch([
      {
        mention: "China",
        alternate_labels: ["PRC", "People's Republic of China"],
        domain: "country",
      },
    ]);

    expect(results).toHaveLength(1);
    const res = results[0];
    expect(res.status).toBe("resolved");
    expect(res.resolved_entity?.qid).toBe("Q148");
    expect(res.resolved_entity?.label).toBe("People's Republic of China");
    expect(res.resolved_entity?.instance_of).toContain("sovereign state");
    expect(res.resolved_entity?.fingerprint?.inception_year).toBe("1949");
    expect(res.resolved_entity?.fingerprint?.head_of_state_or_gov).toBe("Xi Jinping");
  });

  it("handles empty / unmapped entities gracefully", async () => {
    const client = new WikidataClient(config);
    const resolver = new EntityResolver(client);

    // Mock zero hits for Stage 1 and Stage 2
    fetchSpy
      .mockResolvedValueOnce(sparqlResponse([]))
      .mockResolvedValueOnce(sparqlResponse([]));

    const results = await resolver.resolveBatch([
      {
        mention: "Daily drone strike in Sector 4",
        domain: "conflict",
      },
    ]);

    expect(results).toHaveLength(1);
    expect(results[0].status).toBe("not_mapped");
    expect(results[0].resolution_note).toContain("No Wikidata entity found");
  });
});
