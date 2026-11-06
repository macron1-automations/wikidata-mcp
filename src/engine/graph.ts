import { WikidataClient, extractEntityId, isPid, isQid } from "../client.js";
import { SPORTS_ENTERTAINMENT_HUB_QIDS, getDomainPreset } from "../schema/domains.js";
import { DEFAULT_OSINT_PREDICATES, getPropertyLabel } from "../schema/predicates.js";
import {
  CrossLinksResult,
  DirectEdge,
  EntityOutboundTriples,
  FormattedTripleValue,
  InboundRelationRoster,
  PredicateTriples,
  SharedHubCrossLink,
} from "../types.js";

export class WikidataGraphEngine {
  constructor(private client: WikidataClient) {}

  public async getEntityTriples(
    qids: string[],
    options: {
      predicates?: string[];
      include_unwhitelisted?: boolean;
      max_values_per_predicate?: number;
    } = {}
  ): Promise<EntityOutboundTriples[]> {
    const validQids = Array.from(new Set(qids.map(extractEntityId).filter(isQid)));
    if (validQids.length === 0) {
      return [];
    }

    const predicatesToQuery: string[] = [];
    if (options.predicates && options.predicates.length > 0) {
      for (const p of options.predicates) {
        const pid = extractEntityId(p);
        if (isPid(pid)) predicatesToQuery.push(pid);
      }
    } else if (!options.include_unwhitelisted) {
      predicatesToQuery.push(...DEFAULT_OSINT_PREDICATES);
    }

    const maxValues =
      options.max_values_per_predicate && options.max_values_per_predicate > 0
        ? options.max_values_per_predicate
        : 20;

    const valuesS = validQids.map((q) => `wd:${q}`).join(" ");
    let query: string;

    if (predicatesToQuery.length > 0) {
      const valuesP = predicatesToQuery.map((p) => `wdt:${p}`).join(" ");
      query = `
        SELECT ?s ?p ?o WHERE {
          VALUES ?s { ${valuesS} }
          VALUES ?p { ${valuesP} }
          ?s ?p ?o .
        }
        LIMIT 5000
      `;
    } else {
      // Unwhitelisted query with limit
      query = `
        SELECT ?s ?p ?o WHERE {
          VALUES ?s { ${valuesS} }
          ?s ?p ?o .
        }
        LIMIT 2000
      `;
    }

    const resp = await this.client.query(query);

    // Collect all QIDs that need label hydration
    const qidsToHydrate = new Set<string>(validQids);
    for (const b of resp.results.bindings) {
      const oUri = b.o?.value || "";
      const oQid = extractEntityId(oUri);
      if (isQid(oQid)) {
        qidsToHydrate.add(oQid);
      }
    }

    const labelsMap = await this.client.hydrateLabels(Array.from(qidsToHydrate));

    // Group bindings by subject QID -> predicate ID -> list of values
    const grouped = new Map<string, Map<string, FormattedTripleValue[]>>();
    for (const q of validQids) {
      grouped.set(q, new Map<string, FormattedTripleValue[]>());
    }

    // Keep track of literal deduplication (e.g. English vs mul text)
    const seenLiterals = new Set<string>();

    for (const b of resp.results.bindings) {
      const s = extractEntityId(b.s?.value);
      const p = extractEntityId(b.p?.value);
      const oVal = b.o?.value || "";
      const oType = b.o?.type;
      const lang = b.o?.["xml:lang"];
      const datatype = b.o?.datatype;

      if (!s || !p || !oVal) continue;
      const sMap = grouped.get(s);
      if (!sMap) continue;

      let pList = sMap.get(p);
      if (!pList) {
        pList = [];
        sMap.set(p, pList);
      }

      if (pList.length >= maxValues) {
        continue;
      }

      const oQid = extractEntityId(oVal);
      if (oType === "uri" && isQid(oQid)) {
        // Prevent duplicate object QIDs in the same predicate list
        if (!pList.some((item) => item.qid === oQid)) {
          pList.push({
            value: oVal,
            qid: oQid,
            label: labelsMap.get(oQid) || oQid,
          });
        }
      } else {
        // Deduplicate literal strings across en/mul
        const literalKey = `${s}|${p}|${oVal}`;
        if (seenLiterals.has(literalKey)) {
          continue;
        }
        seenLiterals.add(literalKey);

        let formattedVal = oVal;
        // Clean ISO dates: "+2022-02-24T00:00:00Z" -> "2022-02-24"
        if (datatype?.includes("dateTime") || datatype?.includes("date")) {
          const m = oVal.match(/^\+?(\d{4}(?:-\d{2}-\d{2})?)/);
          if (m) formattedVal = m[1];
        }

        pList.push({
          value: formattedVal,
          datatype,
          label: lang ? `${formattedVal} (@${lang})` : formattedVal,
        });
      }
    }

    const result: EntityOutboundTriples[] = [];
    for (const qid of validQids) {
      const sMap = grouped.get(qid)!;
      const triples: PredicateTriples[] = [];

      for (const [pid, vals] of sMap.entries()) {
        triples.push({
          predicate_id: pid,
          predicate_label: getPropertyLabel(pid),
          values: vals,
        });
      }

      result.push({
        qid,
        label: labelsMap.get(qid) || qid,
        triples,
      });
    }

    return result;
  }

  public async getInboundRelations(
    targetQids: string[],
    options: {
      predicates?: string[];
      subject_domain?: string;
      subject_class_qids?: string[];
      filter_subject_qids?: string[];
      limit_per_relation?: number;
    } = {}
  ): Promise<InboundRelationRoster[]> {
    const validTargets = Array.from(new Set(targetQids.map(extractEntityId).filter(isQid)));
    if (validTargets.length === 0) {
      return [];
    }

    const predicates = (options.predicates && options.predicates.length > 0
      ? options.predicates.map(extractEntityId).filter(isPid)
      : ["P463", "P710", "P205", "P17", "P749", "P127", "P355"]
    );

    const limit = options.limit_per_relation && options.limit_per_relation > 0
      ? options.limit_per_relation
      : 50;

    const domainPreset = getDomainPreset(options.subject_domain);
    const domainClasses = new Set<string>([
      ...domainPreset.rootClassQids,
      ...(options.subject_class_qids || []).map(extractEntityId).filter(isQid),
    ]);

    const targetLabels = await this.client.hydrateLabels(validTargets);
    const rosters: InboundRelationRoster[] = [];

    for (const targetQid of validTargets) {
      for (const pid of predicates) {
        let filterClause = "";
        if (options.filter_subject_qids && options.filter_subject_qids.length > 0) {
          const allowedSubs = options.filter_subject_qids
            .map(extractEntityId)
            .filter(isQid)
            .map((q) => `wd:${q}`)
            .join(" ");
          filterClause += ` VALUES ?s { ${allowedSubs} } `;
        }

        if (domainClasses.size > 0) {
          const classVals = Array.from(domainClasses).map((c) => `wd:${c}`).join(" ");
          filterClause += `
            VALUES ?dClass { ${classVals} }
            ?s wdt:P31 ?sType .
            { ?sType = ?dClass } UNION { ?sType wdt:P279 ?dClass }
          `;
        }

        // 1. Total count query
        const countQuery = `
          SELECT (COUNT(DISTINCT ?s) AS ?count) WHERE {
            ${filterClause}
            ?s wdt:${pid} wd:${targetQid} .
          }
        `;

        let totalCount = 0;
        try {
          const countResp = await this.client.query(countQuery);
          const cVal = countResp.results.bindings[0]?.count?.value;
          totalCount = cVal ? parseInt(cVal, 10) : 0;
        } catch {
          // If count fails, proceed to items
        }

        if (totalCount === 0) {
          rosters.push({
            target_qid: targetQid,
            target_label: targetLabels.get(targetQid) || targetQid,
            predicate_id: pid,
            predicate_label: getPropertyLabel(pid),
            total_inbound_count: 0,
            returned_count: 0,
            is_truncated: false,
            subjects: [],
          });
          continue;
        }

        // 2. Fetch up to limit items
        const itemsQuery = `
          SELECT DISTINCT ?s WHERE {
            ${filterClause}
            ?s wdt:${pid} wd:${targetQid} .
          }
          LIMIT ${limit}
        `;

        const itemsResp = await this.client.query(itemsQuery);
        const subQids: string[] = [];
        for (const b of itemsResp.results.bindings) {
          const sQid = extractEntityId(b.s?.value);
          if (isQid(sQid)) subQids.push(sQid);
        }

        const subLabels = await this.client.hydrateLabels(subQids);
        const subjects = subQids.map((sq) => ({
          subject_qid: sq,
          subject_label: subLabels.get(sq) || sq,
        }));

        rosters.push({
          target_qid: targetQid,
          target_label: targetLabels.get(targetQid) || targetQid,
          predicate_id: pid,
          predicate_label: getPropertyLabel(pid),
          total_inbound_count: totalCount,
          returned_count: subjects.length,
          is_truncated: totalCount > subjects.length,
          subjects,
        });
      }
    }

    return rosters;
  }

  public async findCrossLinks(
    qids: string[],
    options: {
      max_direct_edges?: number;
      max_shared_hubs?: number;
    } = {}
  ): Promise<CrossLinksResult> {
    const validQids = Array.from(new Set(qids.map(extractEntityId).filter(isQid)));
    if (validQids.length < 2) {
      return { direct_edges: [], shared_hubs: [] };
    }

    const maxDirect = options.max_direct_edges && options.max_direct_edges > 0
      ? options.max_direct_edges
      : 50;
    const maxHubs = options.max_shared_hubs && options.max_shared_hubs > 0
      ? options.max_shared_hubs
      : 30;

    const valuesClause = validQids.map((q) => `wd:${q}`).join(" ");

    // 1. Direct edges: ?a ?p ?b
    const directQuery = `
      SELECT DISTINCT ?a ?p ?b WHERE {
        VALUES ?a { ${valuesClause} }
        VALUES ?b { ${valuesClause} }
        FILTER(?a != ?b)
        ?a ?p ?b .
        FILTER(STRSTARTS(STR(?p), "http://www.wikidata.org/prop/direct/"))
      }
      LIMIT ${maxDirect}
    `;

    // 2. Shared outbound hubs (e.g. member of alliance, basin country of water body, parent org)
    const outboundHubsQuery = `
      SELECT ?hub ?p (COUNT(DISTINCT ?a) AS ?c) WHERE {
        VALUES ?a { ${valuesClause} }
        VALUES ?p { wdt:P463 wdt:P206 wdt:P749 wdt:P127 wdt:P361 wdt:P205 }
        ?a ?p ?hub .
      }
      GROUP BY ?hub ?p
      HAVING (COUNT(DISTINCT ?a) >= 2)
      ORDER BY DESC(?c)
      LIMIT ${maxHubs}
    `;

    // 3. Shared inbound hubs (conflict participants P710, excluding sports/entertainment hubs)
    const sportsExclusions = Array.from(SPORTS_ENTERTAINMENT_HUB_QIDS)
      .map((q) => `wd:${q}`)
      .join(", ");

    const inboundHubsQuery = `
      SELECT ?hub (COUNT(DISTINCT ?a) AS ?c) WHERE {
        VALUES ?a { ${valuesClause} }
        ?hub wdt:P710 ?a .
        ?hub wdt:P31 ?htype .
        FILTER(?htype NOT IN (${sportsExclusions}))
      }
      GROUP BY ?hub
      HAVING (COUNT(DISTINCT ?a) >= 2)
      ORDER BY DESC(?c)
      LIMIT ${maxHubs}
    `;

    const [directResp, outHubsResp, inHubsResp] = await Promise.all([
      this.client.query(directQuery).catch(() => ({ results: { bindings: [] } })),
      this.client.query(outboundHubsQuery).catch(() => ({ results: { bindings: [] } })),
      this.client.query(inboundHubsQuery).catch(() => ({ results: { bindings: [] } })),
    ]);

    const qidsToHydrate = new Set<string>(validQids);

    // Collect direct edges
    const rawDirect: { a: string; p: string; b: string }[] = [];
    for (const bind of directResp.results.bindings) {
      const a = extractEntityId(bind.a?.value);
      const p = extractEntityId(bind.p?.value);
      const b = extractEntityId(bind.b?.value);
      if (a && p && b) {
        rawDirect.push({ a, p, b });
        qidsToHydrate.add(a);
        qidsToHydrate.add(b);
      }
    }

    // Collect hub QIDs
    const outHubQidsWithPred: { hubQid: string; pid: string }[] = [];
    for (const bind of outHubsResp.results.bindings) {
      const hubQid = extractEntityId(bind.hub?.value);
      const pid = extractEntityId(bind.p?.value);
      if (hubQid && pid) {
        outHubQidsWithPred.push({ hubQid, pid });
        qidsToHydrate.add(hubQid);
      }
    }

    const inHubQids: string[] = [];
    for (const bind of inHubsResp.results.bindings) {
      const hubQid = extractEntityId(bind.hub?.value);
      if (hubQid) {
        inHubQids.push(hubQid);
        qidsToHydrate.add(hubQid);
      }
    }

    const allLabels = await this.client.hydrateLabels(Array.from(qidsToHydrate));

    // Construct Direct Edges
    const direct_edges: DirectEdge[] = rawDirect.map((e) => ({
      subject_qid: e.a,
      subject_label: allLabels.get(e.a) || e.a,
      predicate_id: e.p,
      predicate_label: getPropertyLabel(e.p),
      object_qid: e.b,
      object_label: allLabels.get(e.b) || e.b,
    }));

    // Construct Shared Hubs
    const shared_hubs: SharedHubCrossLink[] = [];

    // Resolve connections for outbound hubs
    for (const { hubQid, pid } of outHubQidsWithPred) {
      const connectQuery = `
        SELECT DISTINCT ?a WHERE {
          VALUES ?a { ${valuesClause} }
          ?a wdt:${pid} wd:${hubQid} .
        }
      `;
      try {
        const cResp = await this.client.query(connectQuery);
        const connectedQids = cResp.results.bindings
          .map((b) => extractEntityId(b.a?.value))
          .filter(isQid);

        if (connectedQids.length >= 2) {
          shared_hubs.push({
            hub_qid: hubQid,
            hub_label: allLabels.get(hubQid) || hubQid,
            relation_predicate_id: pid,
            relation_predicate_label: getPropertyLabel(pid),
            direction: "outbound_shared",
            connected_qids: connectedQids,
            connected_labels: connectedQids.map((q) => allLabels.get(q) || q),
          });
        }
      } catch {
        // Continue to next hub on error
      }
    }

    // Resolve connections for inbound hubs (P710 conflict participants)
    const sportsTitleRegex = /\b(curling|championship|tournament|olympic|paralympic|trophy|world cup|eurovision|grand prix|world games)\b/i;

    for (const hubQid of inHubQids) {
      const hubLabel = allLabels.get(hubQid) || hubQid;
      if (sportsTitleRegex.test(hubLabel)) {
        continue;
      }

      const connectQuery = `
        SELECT DISTINCT ?a WHERE {
          VALUES ?a { ${valuesClause} }
          wd:${hubQid} wdt:P710 ?a .
        }
      `;
      try {
        const cResp = await this.client.query(connectQuery);
        const connectedQids = cResp.results.bindings
          .map((b) => extractEntityId(b.a?.value))
          .filter(isQid);

        if (connectedQids.length >= 2) {
          shared_hubs.push({
            hub_qid: hubQid,
            hub_label: hubLabel,
            relation_predicate_id: "P710",
            relation_predicate_label: "participant in conflict/event",
            direction: "inbound_shared",
            connected_qids: connectedQids,
            connected_labels: connectedQids.map((q) => allLabels.get(q) || q),
          });
        }
      } catch {
        // Continue to next hub on error
      }
    }

    return {
      direct_edges,
      shared_hubs,
    };
  }
}
