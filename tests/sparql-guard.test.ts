import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WikidataConfig } from "../src/config.js";
import { createWikidataMcpServer } from "../src/server.js";

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

describe("query_sparql tool guardrails", () => {
  let fetchSpy: any;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  async function createConnectedClient(overrides: Partial<WikidataConfig> = {}) {
    const config: WikidataConfig = {
      sparqlUrl: "http://localhost:7001/sparql",
      timeoutMs: 5000,
      allowRawSparql: true,
      cacheTtlMs: 60000,
      ...overrides,
    };

    const server = createWikidataMcpServer(config);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);

    const mcpClient = new Client({ name: "test-client", version: "1.0.0" }, { capabilities: {} });
    await mcpClient.connect(clientTransport);
    return mcpClient;
  }

  it("prohibits mutating SPARQL statements (INSERT, DELETE, DROP)", async () => {
    const client = await createConnectedClient();

    const res = await client.callTool({
      name: "query_sparql",
      arguments: {
        query: "DELETE WHERE { ?s ?p ?o }",
      },
    });

    expect(res.isError).toBe(true);
    expect((res.content[0] as any).text).toContain("Forbidden SPARQL query");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("prohibits non-SELECT/ASK queries", async () => {
    const client = await createConnectedClient();

    const res = await client.callTool({
      name: "query_sparql",
      arguments: {
        query: "CONSTRUCT { ?s ?p ?o } WHERE { ?s ?p ?o }",
      },
    });

    expect(res.isError).toBe(true);
    expect((res.content[0] as any).text).toContain("Query must be a SELECT or ASK SPARQL query");
  });

  it("blocks execution when WIKIDATA_ALLOW_RAW_SPARQL is disabled", async () => {
    const client = await createConnectedClient({ allowRawSparql: false });

    const res = await client.callTool({
      name: "query_sparql",
      arguments: {
        query: "SELECT * WHERE { ?s ?p ?o } LIMIT 5",
      },
    });

    expect(res.isError).toBe(true);
    expect((res.content[0] as any).text).toContain("Raw SPARQL queries are disabled on this server");
  });

  it("enforces row limit clamp and hydrates QID/PID labels", async () => {
    const client = await createConnectedClient();

    // Mock query response
    fetchSpy
      .mockResolvedValueOnce(
        sparqlResponse([
          {
            s: { type: "uri", value: "http://www.wikidata.org/entity/Q159" },
            p: { type: "uri", value: "http://www.wikidata.org/prop/direct/P36" },
            o: { type: "uri", value: "http://www.wikidata.org/entity/Q649" },
          },
        ])
      )
      // Mock label hydration for Q159 and Q649
      .mockResolvedValueOnce(
        sparqlResponse([
          {
            entity: { type: "uri", value: "http://www.wikidata.org/entity/Q159" },
            label: { type: "literal", value: "Russia", "xml:lang": "en" },
          },
          {
            entity: { type: "uri", value: "http://www.wikidata.org/entity/Q649" },
            label: { type: "literal", value: "Moscow", "xml:lang": "en" },
          },
        ])
      );

    const res = await client.callTool({
      name: "query_sparql",
      arguments: {
        query: "SELECT ?s ?p ?o WHERE { ?s ?p ?o } LIMIT 1000",
      },
    });

    expect(res.isError).toBeFalsy();
    const data = JSON.parse((res.content[0] as any).text);
    const row = data.results.bindings[0];

    expect(row.sLabel).toBe("Russia");
    expect(row.pLabel).toBe("capital");
    expect(row.oLabel).toBe("Moscow");
  });
});
