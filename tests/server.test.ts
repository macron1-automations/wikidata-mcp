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

describe("WikidataMcpServer end-to-end suite", () => {
  let fetchSpy: any;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  async function createConnectedTestPair(overrides: Partial<WikidataConfig> = {}) {
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

  it("registers all domain tools, resources, resource templates, and prompts", async () => {
    const client = await createConnectedTestPair();

    // 1. Tools
    const toolsRes = await client.listTools();
    const toolNames = toolsRes.tools.map((t) => t.name);

    expect(toolNames).toContain("check_health");
    expect(toolNames).toContain("resolve_entities");
    expect(toolNames).toContain("get_entity_triples");
    expect(toolNames).toContain("get_inbound_relations");
    expect(toolNames).toContain("find_cross_links");
    expect(toolNames).toContain("ground_entities");
    expect(toolNames).toContain("query_sparql");
    expect(toolNames).toHaveLength(7);

    // 2. Resources
    const resourcesRes = await client.listResources();
    const uris = resourcesRes.resources.map((r) => r.uri);

    expect(uris).toContain("wikidata://schema/predicates");
    expect(uris).toContain("wikidata://schema/domains");
    expect(uris).toContain("wikidata://guidelines/brief-enrichment");

    // 3. Resource templates
    const templatesRes = await client.listResourceTemplates();
    const templateUris = templatesRes.resourceTemplates.map((t) => t.uriTemplate);
    expect(templateUris).toContain("wikidata://entities/{qid}");

    // 4. Prompts
    const promptsRes = await client.listPrompts();
    const promptNames = promptsRes.prompts.map((p) => p.name);

    expect(promptNames).toContain("enrich_brief");
    expect(promptNames).toContain("extract_and_ground_entities");
    expect(promptNames).toContain("verify_claims");
    expect(promptNames).toHaveLength(3);
  });

  it("reads schema resources successfully", async () => {
    const client = await createConnectedTestPair();

    const predRes = await client.readResource({ uri: "wikidata://schema/predicates" });
    expect(predRes.contents).toHaveLength(1);
    const predData = JSON.parse((predRes.contents[0] as any).text);
    expect(predData.default_osint_predicates).toBeInstanceOf(Array);
    expect(predData.default_osint_predicates.length).toBeGreaterThan(40);

    const domRes = await client.readResource({ uri: "wikidata://schema/domains" });
    const domData = JSON.parse((domRes.contents[0] as any).text);
    expect(domData).toBeInstanceOf(Array);
    expect(domData.some((d: any) => d.domain === "country")).toBe(true);

    const guideRes = await client.readResource({ uri: "wikidata://guidelines/brief-enrichment" });
    const guideText = (guideRes.contents[0] as any).text;
    expect(guideText).toContain("Wikidata Brief Enrichment Guidelines");
  });

  it("executes check_health tool", async () => {
    fetchSpy.mockResolvedValueOnce(
      sparqlResponse([{ c: { type: "literal", value: "2926237465" } }])
    );

    const client = await createConnectedTestPair();
    const res = await client.callTool({
      name: "check_health",
      arguments: {},
    });

    expect(res.isError).toBeFalsy();
    const data = JSON.parse((res.content[0] as any).text);
    expect(data.status).toBe("ok");
    expect(data.totalTriples).toBe(2926237465);
  });

  it("executes get_prompt for enrich_brief", async () => {
    const client = await createConnectedTestPair();
    const promptRes = await client.getPrompt({
      name: "enrich_brief",
      arguments: {
        brief_text: "Russian forces conducted maneuvers near the border.",
      },
    });

    expect(promptRes.messages).toHaveLength(1);
    const text = (promptRes.messages[0].content as any).text;
    expect(text).toContain("ground_entities");
    expect(text).toContain("Russian forces conducted maneuvers");
  });
});
