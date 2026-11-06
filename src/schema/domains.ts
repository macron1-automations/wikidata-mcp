import { DomainPreset, SupportedDomain } from "../types.js";

export const DOMAIN_PRESETS: Record<SupportedDomain, DomainPreset> = {
  country: {
    domain: "country",
    label: "Country / Sovereign State",
    description: "Sovereign states, federations, republics, monarchies, and disputed or dependent territories",
    rootClassQids: [
      "Q3624078",  // sovereign state
      "Q6256",     // country
      "Q7270",     // republic
      "Q41614",    // constitutional monarchy
      "Q179164",   // unitary state
      "Q43702",    // federation
      "Q15239622", // disputed territory
      "Q161243",   // dependent territory
    ],
  },
  person: {
    domain: "person",
    label: "Person / Human",
    description: "Individual humans (political leaders, executives, military commanders, analysts)",
    rootClassQids: [
      "Q5", // human
    ],
  },
  organization: {
    domain: "organization",
    label: "Organization / Institution / Alliance",
    description: "Supranational bodies, military alliances, international agencies, NGOs, government entities",
    rootClassQids: [
      "Q43229",    // organization
      "Q245065",   // intergovernmental organization
      "Q484652",   // international organization
      "Q79913",    // non-governmental organization
      "Q327333",   // government agency
      "Q1071027",  // alliance
      "Q1127126",  // military alliance
      "Q11204",    // legislature
    ],
  },
  company: {
    domain: "company",
    label: "Company / Business / Enterprise",
    description: "Commercial enterprises, public companies, state-owned firms, defense contractors, tech giants",
    rootClassQids: [
      "Q4830453",  // business
      "Q6881511",  // enterprise
      "Q891723",   // public company
      "Q270791",   // state-owned enterprise
      "Q22687",    // bank
      "Q2457512",  // defense contractor
    ],
  },
  central_bank: {
    domain: "central_bank",
    label: "Central Bank / Monetary Authority",
    description: "National central banks, monetary authorities, and financial regulatory agencies",
    rootClassQids: [
      "Q163740",   // central bank
      "Q1416342",  // financial regulatory agency
      "Q254159",   // monetary authority
    ],
  },
  political_party: {
    domain: "political_party",
    label: "Political Party / Coalition",
    description: "Political parties, parliamentary groups, and electoral coalitions",
    rootClassQids: [
      "Q7278",     // political party
      "Q124964",   // political coalition
      "Q41710",    // parliamentary group
    ],
  },
  military: {
    domain: "military",
    label: "Military / Armed Forces / Weapons",
    description: "Armed forces branches, military units, intelligence services, defense platforms, weapon systems",
    rootClassQids: [
      "Q772547",   // armed forces
      "Q176799",   // military unit
      "Q781132",   // military branch
      "Q47913",    // intelligence agency
      "Q728",      // weapon
      "Q15142894", // weapon family
    ],
  },
  conflict: {
    domain: "conflict",
    label: "Conflict / War / Military Operation",
    description: "Wars, armed conflicts, invasions, military operations, and international crises",
    rootClassQids: [
      "Q198",      // war
      "Q350604",   // armed conflict
      "Q467011",   // invasion
      "Q645883",   // military operation
      "Q18643213", // international crisis
      "Q8465",     // civil war
      "Q180684",   // ongoing conflict
    ],
  },
  geographic_feature: {
    domain: "geographic_feature",
    label: "Geographic Feature / Waterway / City",
    description: "Straits, seas, rivers, canals, chokepoints, mountains, cities, administrative entities, oil/gas basins",
    rootClassQids: [
      "Q37901",    // strait
      "Q165",      // sea
      "Q9430",     // ocean
      "Q4022",     // river
      "Q12284",    // canal
      "Q23442",    // island
      "Q46831",    // mountain range
      "Q515",      // city
      "Q1549591",  // big city
      "Q5119",     // capital city
      "Q56061",    // administrative territorial entity
      "Q4291415",  // oil and gas field
      "Q44782",    // port
    ],
  },
  infrastructure: {
    domain: "infrastructure",
    label: "Infrastructure / Energy / Logistics",
    description: "Pipelines, power stations, nuclear plants, submarine cables, spaceports, transit hubs",
    rootClassQids: [
      "Q1262090",  // pipeline
      "Q159719",   // power station
      "Q134447",   // nuclear power plant
      "Q506371",   // submarine communications cable
      "Q194188",   // spaceport
      "Q1248784",  // airport
      "Q55488",    // railway station
    ],
  },
  product_or_tech: {
    domain: "product_or_tech",
    label: "Product / Technology / AI Model",
    description: "Software, large language models, AI systems, satellites, space vehicles, chips",
    rootClassQids: [
      "Q7397",        // software
      "Q115305900",   // large language model
      "Q117349473",   // artificial intelligence model
      "Q40218",       // spacecraft
      "Q26540",       // artificial satellite
      "Q80831",       // integrated circuit
    ],
  },
  any: {
    domain: "any",
    label: "Any Domain",
    description: "No domain class filter applied; matches any non-noise entity",
    rootClassQids: [],
  },
};

export const NOISE_CLASS_QIDS = new Set([
  "Q4167410",  // Wikimedia disambiguation page
  "Q13442814", // scholarly article
  "Q16521",    // taxon
  "Q202444",   // given name
  "Q101352",   // family name
  "Q4167836",  // Wikimedia category
  "Q11266439", // Wikimedia template
  "Q13406463", // Wikimedia list article
  "Q7366",     // song
  "Q134556",   // single
  "Q482994",   // album
  "Q11424",    // film (unless explicitly resolving media)
]);

export const SPORTS_ENTERTAINMENT_HUB_QIDS = new Set([
  "Q159821",   // Olympic Games
  "Q16510064", // multi-sport event
  "Q18608583", // recurring sporting event
  "Q114609228",// recurring sporting event edition
  "Q13406554", // sports competition
  "Q27020041", // curling championship
  "Q10688145", // season
  "Q13499",    // world championship
  "Q1079023",  // championship
  "Q1656682",  // tournament
  "Q19317",    // FIFA World Cup
  "Q5389",     // Olympic sport
  "Q482994",   // album
  "Q5398426",  // television series
]);

export function getDomainPreset(domain?: string): DomainPreset {
  if (domain && domain in DOMAIN_PRESETS) {
    return DOMAIN_PRESETS[domain as SupportedDomain];
  }
  return DOMAIN_PRESETS.any;
}

export function getAllDomainPresets(): DomainPreset[] {
  return Object.values(DOMAIN_PRESETS);
}
