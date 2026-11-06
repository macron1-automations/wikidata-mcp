import { WikidataClient, escapeSparqlString, extractEntityId } from "../client.js";
import { DOMAIN_PRESETS, NOISE_CLASS_QIDS, getDomainPreset } from "../schema/domains.js";
import { DISAMBIGUATION_PREDICATES, getPropertyLabel } from "../schema/predicates.js";
import {
  CandidateFingerprint,
  EntityResolutionInput,
  EntityResolutionResult,
  ResolvedCandidate,
} from "../types.js";

interface RawCandidateHit {
  s: string;
  namePred: string;
  searchLabel: string;
  type: string;
  isDomainDirect: boolean;
  isDomainSubclass: boolean;
}

export class EntityResolver {
  constructor(private client: WikidataClient) {}

  public async resolveBatch(inputs: EntityResolutionInput[]): Promise<EntityResolutionResult[]> {
    if (!inputs || inputs.length === 0) {
      return [];
    }

    const results: EntityResolutionResult[] = [];
    for (const input of inputs) {
      const result = await this.resolveSingle(input);
      results.push(result);
    }

    return results;
  }

  private generateLabelVariants(mention: string, alternateLabels: string[] = []): string[] {
    const set = new Set<string>();
    const add = (str: string) => {
      const trimmed = str.trim();
      if (trimmed.length > 0) {
        set.add(trimmed);
      }
    };

    add(mention);
    for (const alt of alternateLabels) {
      add(alt);
    }

    // Common prefixes to strip, e.g., "The People's Republic of China" -> "People's Republic of China"
    const lower = mention.toLowerCase();
    if (lower.startsWith("the ")) {
      add(mention.slice(4).trim());
    }

    // Expand title-casing if mention is all lowercase
    if (mention === mention.toLowerCase() && mention.length > 2) {
      const titleCased = mention
        .split(/\s+/)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
      add(titleCased);
    }

    return Array.from(set);
  }

  private buildSparqlLiterals(strings: string[]): string {
    const literals: string[] = [];
    for (const s of strings) {
      const esc = escapeSparqlString(s);
      literals.push(`"${esc}"@en`);
      literals.push(`"${esc}"@mul`);
    }
    return literals.join(" ");
  }

  private async resolveSingle(input: EntityResolutionInput): Promise<EntityResolutionResult> {
    const mention = input.mention?.trim();
    if (!mention) {
      return {
        mention: "",
        status: "not_mapped",
        resolution_note: "Empty mention provided",
      };
    }

    const maxCandidates = input.max_candidates && input.max_candidates > 0 ? input.max_candidates : 5;
    const variants = this.generateLabelVariants(mention, input.alternate_labels);
    const sparqlLiterals = this.buildSparqlLiterals(variants);

    const preset = getDomainPreset(input.domain);
    const domainClassQids = new Set<string>([
      ...preset.rootClassQids,
      ...(input.class_qids || []).map(extractEntityId),
    ]);

    let hits: RawCandidateHit[] = [];

    // Stage 1: Label-first candidate retrieval (extremely fast and memory-efficient in QLever)
    const noiseFilters = Array.from(NOISE_CLASS_QIDS)
      .map((q) => `wd:${q}`)
      .join(", ");

    const labelQuery = `
      SELECT DISTINCT ?s ?namePred ?searchLabel ?type WHERE {
        VALUES ?searchLabel { ${sparqlLiterals} }
        VALUES ?namePred { rdfs:label wdt:P1813 wdt:P1448 }
        ?s ?namePred ?searchLabel .
        ?s wdt:P31 ?type .
        FILTER(?type NOT IN (${noiseFilters}))
      }
      LIMIT 250
    `;

    try {
      const resp = await this.client.query(labelQuery);
      for (const b of resp.results.bindings) {
        const s = extractEntityId(b.s?.value);
        if (!s) continue;
        hits.push({
          s,
          namePred: extractEntityId(b.namePred?.value),
          searchLabel: b.searchLabel?.value || "",
          type: extractEntityId(b.type?.value),
          isDomainDirect: false,
          isDomainSubclass: false,
        });
      }
    } catch {
      // Handled below if hits remain empty
    }

    if (hits.length === 0) {
      return {
        mention,
        status: "not_mapped",
        resolution_note: `No Wikidata entity found matching "${mention}" (searched labels: ${variants.join(", ")}).`,
      };
    }

    // Check domain matches: first direct match against rootClassQids
    if (domainClassQids.size > 0) {
      const candidateTypes = new Set<string>(hits.map((h) => h.type).filter(Boolean));
      const directMatches = new Set<string>();
      const typesToCheckSubclass: string[] = [];

      for (const t of candidateTypes) {
        if (domainClassQids.has(t)) {
          directMatches.add(t);
        } else {
          typesToCheckSubclass.push(t);
        }
      }

      // Check 1-hop P279 subclasses for candidate types not directly in domainClassQids
      const subclassMatches = new Set<string>();
      if (typesToCheckSubclass.length > 0) {
        const tVals = typesToCheckSubclass.map((t) => `wd:${t}`).join(" ");
        const dVals = Array.from(domainClassQids).map((d) => `wd:${d}`).join(" ");
        const subQuery = `
          SELECT DISTINCT ?t WHERE {
            VALUES ?t { ${tVals} }
            VALUES ?targetClass { ${dVals} }
            ?t wdt:P279 ?targetClass .
          }
          LIMIT 100
        `;
        try {
          const subResp = await this.client.query(subQuery);
          for (const b of subResp.results.bindings) {
            const t = extractEntityId(b.t?.value);
            if (t) subclassMatches.add(t);
          }
        } catch {
          // If subclass query fails, continue with direct matches
        }
      }

      // Mark domain matches on hits
      for (const hit of hits) {
        if (directMatches.has(hit.type)) {
          hit.isDomainDirect = true;
        } else if (subclassMatches.has(hit.type)) {
          hit.isDomainSubclass = true;
        }
      }
    }

    const hasAnyDomainMatch = hits.some((h) => h.isDomainDirect || h.isDomainSubclass);
    const isDomainMismatchFallback = domainClassQids.size > 0 && !hasAnyDomainMatch;

    if (hits.length === 0) {
      return {
        mention,
        status: "not_mapped",
        resolution_note: `No Wikidata entity found matching "${mention}" (searched labels: ${variants.join(", ")}).`,
      };
    }

    // Stage 3: Fingerprinting, label hydration & ranking
    const distinctCandidateQids = Array.from(new Set(hits.map((h) => h.s)));
    const labelsMap = await this.client.hydrateLabels(distinctCandidateQids);

    // Fetch disambiguation fingerprints for all candidates in one batch
    const fingerprintMap = await this.fetchFingerprints(distinctCandidateQids);

    // Group hits by candidate QID
    const candidatesMap = new Map<string, ResolvedCandidate>();

    for (const hit of hits) {
      const qid = hit.s;
      let cand = candidatesMap.get(qid);
      if (!cand) {
        const candLabel = labelsMap.get(qid) || qid;
        const fp = fingerprintMap.get(qid) || {};
        const instanceQids = Array.from(
          new Set(hits.filter((h) => h.s === qid && h.type).map((h) => h.type))
        );

        let matchSource: ResolvedCandidate["match_source"] = "rdfs:label";
        if (hit.namePred === "P1813") matchSource = "P1813_short_name";
        else if (hit.namePred === "P1448") matchSource = "P1448_official_name";
        else if (hit.searchLabel.toLowerCase() !== mention.toLowerCase()) {
          matchSource = "alternate_label";
        }

        cand = {
          qid,
          label: candLabel,
          instance_of_qids: instanceQids,
          instance_of_labels: [],
          match_source: matchSource,
          score: 0,
          domain_match: hit.isDomainDirect || hit.isDomainSubclass,
          fingerprint: fp,
        };
        candidatesMap.set(qid, cand);
      } else {
        if (hit.isDomainDirect || hit.isDomainSubclass) {
          cand.domain_match = true;
        }
      }
    }

    // Hydrate instance_of labels
    const allTypeQids = Array.from(
      new Set(Array.from(candidatesMap.values()).flatMap((c) => c.instance_of_qids))
    );
    const typeLabels = await this.client.hydrateLabels(allTypeQids);
    for (const cand of candidatesMap.values()) {
      cand.instance_of_labels = cand.instance_of_qids.map((t) => typeLabels.get(t) || t);
    }

    // Score candidates
    for (const cand of candidatesMap.values()) {
      let score = 0;

      // Label match strength
      if (cand.label.toLowerCase() === mention.toLowerCase()) {
        score += 50;
      } else if (cand.match_source === "rdfs:label") {
        score += 40;
      } else if (cand.match_source === "alternate_label") {
        score += 35;
      } else if (cand.match_source === "P1448_official_name") {
        score += 30;
      } else if (cand.match_source === "P1813_short_name") {
        score += 25;
      }

      // Domain match
      if (cand.domain_match) {
        score += 40;
      }

      // Fingerprint completeness bonus
      const fp = cand.fingerprint;
      if (fp.country_qid || fp.country_label) score += 10;
      if (fp.inception_year) score += 10;
      if (fp.hq_label) score += 10;
      if (fp.head_of_state_or_gov) score += 10;
      if (fp.occupation_or_role) score += 10;
      if (fp.parent_org_label) score += 5;

      // Penalize noise types
      for (const t of cand.instance_of_qids) {
        if (NOISE_CLASS_QIDS.has(t)) {
          score -= 100;
        }
      }

      cand.score = score;
    }

    const sortedCandidates = Array.from(candidatesMap.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, maxCandidates);

    if (sortedCandidates.length === 0) {
      return {
        mention,
        status: "not_mapped",
        resolution_note: `Entities matched for "${mention}" were excluded as noise.`,
      };
    }

    if (isDomainMismatchFallback) {
      return {
        mention,
        status: "ambiguous",
        domain_mismatch_candidates: sortedCandidates,
        resolution_note: `No candidates matched the domain "${input.domain}". Found ${sortedCandidates.length} potential non-domain candidate(s) for review.`,
      };
    }

    const top = sortedCandidates[0];
    const second = sortedCandidates[1];

    // Single candidate OR dominant candidate
    const isUnambiguous =
      sortedCandidates.length === 1 ||
      (second && top.score >= second.score + 25) ||
      (top.domain_match && second && !second.domain_match);

    if (isUnambiguous && top.score > 30) {
      return {
        mention,
        status: "resolved",
        resolved_entity: {
          qid: top.qid,
          label: top.label,
          instance_of: top.instance_of_labels,
          fingerprint: top.fingerprint,
        },
        candidates: sortedCandidates,
      };
    }

    return {
      mention,
      status: "ambiguous",
      candidates: sortedCandidates,
      resolution_note: `Found ${sortedCandidates.length} candidate entities. Please choose or verify with additional predicates.`,
    };
  }

  private async fetchFingerprints(qids: string[]): Promise<Map<string, CandidateFingerprint>> {
    const result = new Map<string, CandidateFingerprint>();
    if (qids.length === 0) return result;

    const values = qids.map((q) => `wd:${q}`).join(" ");
    const preds = DISAMBIGUATION_PREDICATES.map((p) => `wdt:${p}`).join(" ");

    const query = `
      SELECT ?s ?p ?o WHERE {
        VALUES ?s { ${values} }
        VALUES ?p { ${preds} }
        ?s ?p ?o .
      }
      LIMIT 2000
    `;

    try {
      const resp = await this.client.query(query);
      const objectsToHydrate: string[] = [];

      // Collect raw values
      const rawMap = new Map<string, Map<string, string[]>>();
      for (const b of resp.results.bindings) {
        const s = extractEntityId(b.s?.value);
        const p = extractEntityId(b.p?.value);
        const o = b.o?.value || "";
        if (!s || !p || !o) continue;

        let sEntry = rawMap.get(s);
        if (!sEntry) {
          sEntry = new Map<string, string[]>();
          rawMap.set(s, sEntry);
        }
        let pList = sEntry.get(p);
        if (!pList) {
          pList = [];
          sEntry.set(p, pList);
        }
        pList.push(o);

        const oQid = extractEntityId(o);
        if (oQid.startsWith("Q")) {
          objectsToHydrate.push(oQid);
        }
      }

      const hydratedObjLabels = await this.client.hydrateLabels(objectsToHydrate);

      for (const qid of qids) {
        const sEntry = rawMap.get(qid);
        if (!sEntry) {
          result.set(qid, {});
          continue;
        }

        const fp: CandidateFingerprint = {};

        // Inception year
        const inceptionVal = sEntry.get("P571")?.[0];
        if (inceptionVal) {
          const yearMatch = inceptionVal.match(/(\d{4})/);
          fp.inception_year = yearMatch ? yearMatch[1] : inceptionVal;
        }

        // Country
        const countryUri = sEntry.get("P17")?.[0];
        if (countryUri) {
          const cQid = extractEntityId(countryUri);
          fp.country_qid = cQid;
          fp.country_label = hydratedObjLabels.get(cQid) || cQid;
        }

        // Headquarters
        const hqUri = sEntry.get("P159")?.[0];
        if (hqUri) {
          const hqQid = extractEntityId(hqUri);
          fp.hq_qid = hqQid;
          fp.hq_label = hydratedObjLabels.get(hqQid) || hqQid;
        }

        // Head of state / gov
        const leaderUri = sEntry.get("P35")?.[0] || sEntry.get("P6")?.[0];
        if (leaderUri) {
          const leaderQid = extractEntityId(leaderUri);
          fp.head_of_state_or_gov = hydratedObjLabels.get(leaderQid) || leaderQid;
        }

        // Occupation / position / role
        const roleUri = sEntry.get("P39")?.[0] || sEntry.get("P106")?.[0];
        if (roleUri) {
          const roleQid = extractEntityId(roleUri);
          fp.occupation_or_role = hydratedObjLabels.get(roleQid) || roleQid;
        }

        // Stock exchange
        const exchangeUri = sEntry.get("P414")?.[0];
        if (exchangeUri) {
          const exQid = extractEntityId(exchangeUri);
          fp.stock_exchange_or_ticker = hydratedObjLabels.get(exQid) || exQid;
        }

        // Parent org
        const parentUri = sEntry.get("P749")?.[0];
        if (parentUri) {
          const parentQid = extractEntityId(parentUri);
          fp.parent_org_label = hydratedObjLabels.get(parentQid) || parentQid;
        }

        // Different from
        const diffList = sEntry.get("P1889");
        if (diffList && diffList.length > 0) {
          fp.different_from_labels = diffList.map((uri) => {
            const dQid = extractEntityId(uri);
            return hydratedObjLabels.get(dQid) || dQid;
          });
        }

        result.set(qid, fp);
      }
    } catch {
      // Return empty fingerprints on failure
      for (const qid of qids) {
        if (!result.has(qid)) result.set(qid, {});
      }
    }

    return result;
  }
}
