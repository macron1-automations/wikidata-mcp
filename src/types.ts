export interface SparqlBindingValue {
  type: "uri" | "literal" | "bnode" | "typed-literal";
  value: string;
  datatype?: string;
  "xml:lang"?: string;
}

export interface SparqlResponse {
  head: {
    vars: string[];
  };
  results: {
    bindings: Record<string, SparqlBindingValue>[];
  };
  meta?: {
    "query-time-ms"?: number;
    "result-size-total"?: number;
    [key: string]: unknown;
  };
}

export type SupportedDomain =
  | "country"
  | "person"
  | "organization"
  | "company"
  | "central_bank"
  | "political_party"
  | "military"
  | "conflict"
  | "geographic_feature"
  | "infrastructure"
  | "product_or_tech"
  | "any";

export interface DomainPreset {
  domain: SupportedDomain;
  label: string;
  description: string;
  rootClassQids: string[];
}

export interface EntityResolutionInput {
  mention: string;
  alternate_labels?: string[];
  domain?: SupportedDomain;
  class_qids?: string[];
  max_candidates?: number;
}

export interface CandidateFingerprint {
  inception_year?: number | string;
  country_label?: string;
  country_qid?: string;
  hq_label?: string;
  hq_qid?: string;
  head_of_state_or_gov?: string;
  occupation_or_role?: string;
  stock_exchange_or_ticker?: string;
  parent_org_label?: string;
  different_from_labels?: string[];
}

export interface ResolvedCandidate {
  qid: string;
  label: string;
  instance_of_qids: string[];
  instance_of_labels: string[];
  match_source: "rdfs:label" | "P1813_short_name" | "P1448_official_name" | "alternate_label";
  score: number;
  domain_match: boolean;
  fingerprint: CandidateFingerprint;
}

export interface EntityResolutionResult {
  mention: string;
  status: "resolved" | "ambiguous" | "not_mapped";
  resolved_entity?: {
    qid: string;
    label: string;
    instance_of: string[];
    fingerprint?: CandidateFingerprint;
  };
  candidates?: ResolvedCandidate[];
  domain_mismatch_candidates?: ResolvedCandidate[];
  resolution_note?: string;
}

export interface FormattedTripleValue {
  value: string;
  qid?: string;
  label?: string;
  datatype?: string;
}

export interface PredicateTriples {
  predicate_id: string;
  predicate_label: string;
  values: FormattedTripleValue[];
}

export interface EntityOutboundTriples {
  qid: string;
  label: string;
  triples: PredicateTriples[];
}

export interface InboundRelationItem {
  subject_qid: string;
  subject_label: string;
  subject_instance_of?: string[];
}

export interface InboundRelationRoster {
  target_qid: string;
  target_label: string;
  predicate_id: string;
  predicate_label: string;
  total_inbound_count: number;
  returned_count: number;
  is_truncated: boolean;
  subjects: InboundRelationItem[];
}

export interface DirectEdge {
  subject_qid: string;
  subject_label: string;
  predicate_id: string;
  predicate_label: string;
  object_qid: string;
  object_label: string;
}

export interface SharedHubCrossLink {
  hub_qid: string;
  hub_label: string;
  hub_type_labels?: string[];
  relation_predicate_id: string;
  relation_predicate_label: string;
  direction: "outbound_shared" | "inbound_shared";
  connected_qids: string[];
  connected_labels: string[];
}

export interface CrossLinksResult {
  direct_edges: DirectEdge[];
  shared_hubs: SharedHubCrossLink[];
}

export interface GroundEntitiesResult {
  entities: EntityResolutionResult[];
  outbound: EntityOutboundTriples[];
  inbound: InboundRelationRoster[];
  cross_links: CrossLinksResult;
  summary: {
    total_mentions: number;
    resolved_count: number;
    ambiguous_count: number;
    unmapped_count: number;
  };
}
