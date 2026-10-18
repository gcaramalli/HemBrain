// What kind of scene an event is, guessed from its title in English, French or
// Swedish (the 3D week, the living house). No three.js here, so any page can use it.
export type ActKind =
  | "meal" | "drinks" | "swim" | "racket" | "sport" | "health" | "party" | "family" | "travel" | "show"
  | "lesson" | "work" | "shop" | "outing" | "cleaning" | "repair" | "unknown";

// First match wins, so the order matters ("courses" is shopping before "course" is running,
// "cours de tennis" is tennis before "cours" is a lesson, "visite médicale" is health before a visit,
// "ménage" is cleaning before "nage" is swimming: \b doesn't see "é" as a letter).
const KINDS: [ActKind, RegExp][] = [
  ["drinks", /(after-?work|\baw\b|drinks|\bbar\b|ap[ée]ro|pub\b|cocktail|wine|d[ée]gustation|vinprovning|\b[öo]l\b|beer)/i],
  ["meal", /(d[iî]n(er|ner)|lunch|d[ée]jeuner|d[ée]j\b|brunch|breakfast|petit[- ]?d[ée]j|frukost|middag|resto|restaurant|fika|caf[ée]|coffee|bbq|barbecue|grill|pizza|souper|go[uû]ter|raclette|fondue)/i],
  ["cleaning", /(m[ée]nage|cleaning|cleaner|st[äa]d|nettoyage|lessive|repassage)/i],
  ["swim", /(swim|\bnag(e|eur|euse)|natation|piscine|pool|sim(ning|skola|hall)|badhus)/i],
  ["racket", /(padel|tennis|badminton|squash|ping[- ]?pong)/i],
  ["shop", /(courses|shopping|handla|ikea|march[ée]|market|achats?\b|soldes)/i],
  ["sport", /(gym|yoga|\brun|jogg|course [àa] pied|foot|fotboll|sport|tr[äa]ning|workout|pilates|v[ée]lo|cykel|\bski|match|crossfit|boxe|danse|dance|klättr|escalade|climb|golf|hockey|basket|rugby|handball|judo|karat)/i],
  ["health", /(m[ée]decin|docteur|doctor|dentist|tandl[äa]kare|l[äa]kare|bvc|vaccin|kin[ée]|physio|ost[ée]o|hospital|h[ôo]pital|sjukhus|v[åa]rdcentral|p[ée]diatr|pharma|apotek|opticien|optiker|check-?up|visite m[ée]dicale)/i],
  ["party", /(anniv|birthday|f[öo]delsedag|kalas|party|f[êe]te|soir[ée]e|mariage|wedding|br[öo]llop|bapt[êe]me|celebrat|jubil|cr[ée]maill[èe]re|housewarming|\bfest)/i],
  ["family", /(visite|visit|bes[öo]k|famille|family|familj|mamie|papy|mami\b|\bmum\b|\bmom\b|maman|mamma|\bdad\b|pappa|\bpapa\b|grand-?m[èe]re|grand-?p[èe]re|grands-parents|mormor|farmor|morfar|farfar|beaux-parents|belle-m[èe]re|beau-p[èe]re|sv[äa]rf[öo]r[äa]ldrar|cousin|kusin|oncle|tante|moster|faster|morbror|farbror)/i],
  ["travel", /(flight|\bvol\b|avion|flyg|train\b|t[åa]g\b|airport|a[ée]roport|voyage|trip\b|\bresa\b|vacances|semester|holiday|ferry|f[äa]rja|h[ôo]tel|airbnb|valise|d[ée]part|week-?end [àa])/i],
  ["show", /(cin[ée]|movie|film|\bbio\b|th[ée][âa]tre|theater|teater|concert|konsert|spectacle|op[ée]ra|show)/i],
  ["lesson", /(cours\b|lesson|class\b|lektion|kurs\b|le[çc]on|atelier|workshop|formation|training day|[ée]cole|school|skola|parents|utvecklingssamtal|piano|guitare|musique|solf[èe]ge|langue|spr[åa]k|exam|tenta\b|\bprov\b|partiel)/i],
  ["work", /(r[ée]union|meeting|m[öo]te|\bcall\b|entretien|interview|conf[ée]rence|\bwork\b|travail|jobb|bureau|office|kontor|s[ée]minaire|seminar|offsite|kick-?off|boss|client|kund|pr[ée]sentation|presentation|deadline|rapport|report|workshop)/i],
  ["outing", /(zoo|parc|park|mus[ée]e|museum|picnic|pique|plage|beach|strand|balade|promenade|walk\b|sortie|lekplats|playground|aquarium|ferme|skansen|utflykt)/i],
  ["repair", /(plomb|plumber|r[öo]rmokare|[ée]lectric|repair|\br[ée]par|tuyau|pipes|\bvvs\b|intervention|artisan|hantverk|install|livraison|delivery|d[ée]m[ée]nag|moving|garage|pneu|d[äa]ck|bilprovning)/i],
];

export function actKind(title: string, badge?: string, multiDay = false): ActKind {
  if (badge) return "party"; // our anniversary, a family birthday
  const kind = KINDS.find(([, re]) => re.test(title))?.[0] ?? "unknown"; // we build the missing ones as they come
  // Away for several days ("Nice avec Charlie", "Paris pour Skema"): a trip, unless it's a visit or a party.
  return multiDay && ["unknown", "lesson", "work", "outing"].includes(kind) ? "travel" : kind;
}
