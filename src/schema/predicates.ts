export const DEFAULT_OSINT_PREDICATES = [
  // Core Identity & Taxonomy
  "P31",   // instance of
  "P279",  // subclass of
  "P1448", // official name
  "P1813", // short name
  "P138",  // named after
  "P1889", // different from
  "P571",  // inception
  "P576",  // dissolved, abolished or demolished date

  // Geopolitics, States & Geography
  "P17",   // country
  "P131",  // located in administrative territorial entity
  "P30",   // continent
  "P36",   // capital
  "P37",   // official language
  "P38",   // currency
  "P35",   // head of state
  "P6",    // head of government
  "P122",  // form of government
  "P463",  // member of
  "P47",   // shares border with
  "P206",  // located in or next to body of water
  "P205",  // basin country
  "P706",  // located in/on physical feature

  // Conflict, Security & Defense
  "P710",  // participant
  "P137",  // operator
  "P176",  // manufacturer

  // People, Politics & Leadership
  "P27",   // country of citizenship
  "P735",  // given name
  "P734",  // family name
  "P569",  // date of birth
  "P570",  // date of death
  "P106",  // occupation
  "P102",  // member of political party
  "P39",   // position held
  "P488",  // chairperson
  "P108",  // employer

  // Corporate, Markets, Tech & Energy
  "P159",  // headquarters location
  "P112",  // founded by
  "P169",  // chief executive officer
  "P749",  // parent organization
  "P355",  // has subsidiary
  "P127",  // owned by
  "P414",  // stock exchange
  "P249",  // ticker symbol
  "P452",  // industry
  "P178",  // developer
  "P1056", // product or material produced
  "P361",  // part of
  "P527",  // has part
] as const;

export const DISAMBIGUATION_PREDICATES = [
  "P31",
  "P17",
  "P571",
  "P159",
  "P112",
  "P169",
  "P414",
  "P27",
  "P106",
  "P39",
  "P749",
  "P1889",
  "P35",
  "P6",
] as const;

export const PROPERTY_LABELS: Record<string, string> = {
  // Core & Structural
  P31: "instance of",
  P279: "subclass of",
  P361: "part of",
  P527: "has part",
  P138: "named after",
  P1889: "different from",
  P1448: "official name",
  P1813: "short name",
  P1705: "native label",
  P1476: "title",
  P154: "logo image",
  P18: "image",
  P856: "official website",

  // Dates & Chronology
  P571: "inception",
  P576: "dissolved, abolished or demolished date",
  P569: "date of birth",
  P570: "date of death",
  P580: "start time",
  P582: "end time",
  P585: "point in time",

  // Geopolitics & Governance
  P17: "country",
  P131: "located in the administrative territorial entity",
  P30: "continent",
  P36: "capital",
  P37: "official language",
  P38: "currency",
  P35: "head of state",
  P6: "head of government",
  P122: "form of government",
  P463: "member of",
  P47: "shares border with",
  P150: "contains administrative territorial entity",
  P530: "diplomatic relation",
  P298: "ISO 3166-1 alpha-3 code",
  P297: "ISO 3166-1 alpha-2 code",
  P299: "ISO 3166-1 numeric code",
  P1082: "population",

  // Conflict, Military & Defense
  P710: "participant",
  P1120: "number of deaths",
  P1339: "number of injured",
  P607: "conflict",
  P241: "military branch",
  P410: "military rank",
  P772547: "armed forces",
  P828: "has cause",
  P1542: "cause of",
  P137: "operator",
  P176: "manufacturer",

  // Geography & Physical Environment
  P206: "located in or next to body of water",
  P205: "basin country",
  P706: "located in/on physical feature",
  P625: "coordinate location",
  P2044: "elevation above sea level",
  P2046: "area",
  P2043: "length",
  P403: "mouth of the watercourse",

  // People & Politics
  P27: "country of citizenship",
  P735: "given name",
  P734: "family name",
  P106: "occupation",
  P102: "member of political party",
  P39: "position held",
  P488: "chairperson",
  P108: "employer",
  P1142: "political ideology",
  P69: "educated at",
  P19: "place of birth",
  P20: "place of death",
  P26: "spouse",
  P22: "father",
  P25: "mother",
  P40: "child",
  P166: "award received",

  // Corporate, Finance, Tech & Infrastructure
  P159: "headquarters location",
  P112: "founded by",
  P169: "chief executive officer",
  P749: "parent organization",
  P355: "has subsidiary",
  P127: "owned by",
  P414: "stock exchange",
  P249: "ticker symbol",
  P452: "industry",
  P178: "developer",
  P1056: "product or material produced",
  P1454: "legal form",
  P2139: "total revenue",
  P2295: "net profit",
  P3320: "board member",
  P1365: "replaces",
  P1366: "replaced by",
  P121: "item operated",
  P793: "significant event",
  P1195: "file extension",
  P306: "operating system",
};

export function getPropertyLabel(pid: string): string {
  const cleanPid = pid.replace(/^https?:\/\/www\.wikidata\.org\/prop\/direct\//, "").replace(/^wdt:/, "");
  return PROPERTY_LABELS[cleanPid] || cleanPid;
}
