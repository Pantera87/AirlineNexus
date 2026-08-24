// ============================================================
// Airport database generator
// ------------------------------------------------------------
// Reads world-airports.csv (OurAirports format) from the project
// root and emits src/data/airports-full.generated.ts containing
// every airport that has an IATA code and scheduled passenger
// service. Curated hubs in src/data/airports.ts are merged at
// runtime (curated entries win on IATA conflicts).
//
// Usage: npm run generate:airports
// ============================================================

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const CSV_PATH = resolve(ROOT, 'world-airports.csv');
const OUT_PATH = resolve(ROOT, 'src', 'data', 'airports-full.generated.ts');

// ------------------------------------------------------------
// Minimal CSV parser (handles quoted fields, embedded commas,
// escaped quotes and CRLF line endings)
// ------------------------------------------------------------
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.length > 1 || row[0].length > 0) rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  // Flush last field/row
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

// ------------------------------------------------------------
// Derivation tables
// ------------------------------------------------------------
const CONTINENT_MAP = {
  AF: 'Africa',
  AN: 'Antarctica',
  AS: 'Asia',
  EU: 'Europe',
  NA: 'North America',
  OC: 'Oceania',
  SA: 'South America',
};

// ISO country -> default IANA timezone (major countries; the rest
// fall back to a longitude-based UTC offset)
const COUNTRY_TIMEZONE = {
  // North & Central America + Caribbean
  US: 'America/New_York', CA: 'America/Toronto', MX: 'America/Mexico_City',
  GT: 'America/Guatemala', BZ: 'America/Belize', SV: 'America/El_Salvador',
  HN: 'America/Tegucigalpa', NI: 'America/Managua', CR: 'America/Costa_Rica',
  PA: 'America/Panama', CU: 'America/Havana', DO: 'America/Santo_Domingo',
  PR: 'America/Puerto_Rico', JM: 'America/Jamaica', TT: 'America/Port_of_Spain',
  BB: 'America/Barbados', BS: 'America/Nassau', HT: 'America/Port-au-Prince',
  // South America
  BR: 'America/Sao_Paulo', AR: 'America/Argentina/Buenos_Aires', CL: 'America/Santiago',
  CO: 'America/Bogota', PE: 'America/Lima', VE: 'America/Caracas', EC: 'America/Guayaquil',
  BO: 'America/La_Paz', UY: 'America/Montevideo', PY: 'America/Asuncion',
  // Europe
  GB: 'Europe/London', IE: 'Europe/Dublin', FR: 'Europe/Paris', DE: 'Europe/Berlin',
  ES: 'Europe/Madrid', PT: 'Europe/Lisbon', IT: 'Europe/Rome',
  NL: 'Europe/Amsterdam', BE: 'Europe/Brussels', CH: 'Europe/Zurich', AT: 'Europe/Vienna',
  PL: 'Europe/Warsaw', CZ: 'Europe/Prague', SK: 'Europe/Bratislava', HU: 'Europe/Budapest',
  RO: 'Europe/Bucharest', BG: 'Europe/Sofia', GR: 'Europe/Athens', SE: 'Europe/Stockholm',
  NO: 'Europe/Oslo', DK: 'Europe/Copenhagen', FI: 'Europe/Helsinki', IS: 'Atlantic/Reykjavik',
  LU: 'Europe/Luxembourg', MT: 'Europe/Malta', CY: 'Asia/Nicosia', HR: 'Europe/Zagreb',
  SI: 'Europe/Ljubljana', RS: 'Europe/Belgrade', BA: 'Europe/Sarajevo', AL: 'Europe/Tirane',
  MK: 'Europe/Skopje', ME: 'Europe/Podgorica', XK: 'Europe/Belgrade', TR: 'Europe/Istanbul',
  RU: 'Europe/Moscow', UA: 'Europe/Kyiv', BY: 'Europe/Minsk', EE: 'Europe/Tallinn',
  LV: 'Europe/Riga', LT: 'Europe/Vilnius', MD: 'Europe/Chisinau', AM: 'Asia/Yerevan',
  AZ: 'Asia/Baku', GE: 'Asia/Tbilisi',
  // Asia
  IN: 'Asia/Kolkata', CN: 'Asia/Shanghai', JP: 'Asia/Tokyo', KR: 'Asia/Seoul',
  KP: 'Asia/Pyongyang', MN: 'Asia/Ulaanbaatar', TH: 'Asia/Bangkok', VN: 'Asia/Ho_Chi_Minh',
  KH: 'Asia/Phnom_Penh', LA: 'Asia/Vientiane', MM: 'Asia/Yangon', MY: 'Asia/Kuala_Lumpur',
  SG: 'Asia/Singapore', ID: 'Asia/Jakarta', PH: 'Asia/Manila', BN: 'Asia/Brunei',
  TL: 'Asia/Dili', BD: 'Asia/Dhaka', PK: 'Asia/Karachi', LK: 'Asia/Colombo',
  NP: 'Asia/Kathmandu', BT: 'Asia/Thimphu', MV: 'Indian/Maldives', AF: 'Asia/Kabul',
  IR: 'Asia/Tehran', IQ: 'Asia/Baghdad', IL: 'Asia/Jerusalem', JO: 'Asia/Amman',
  PS: 'Asia/Gaza', LB: 'Asia/Beirut', SY: 'Asia/Damascus', SA: 'Asia/Riyadh',
  AE: 'Asia/Dubai', OM: 'Asia/Muscat', QA: 'Asia/Qatar', KW: 'Asia/Kuwait',
  BH: 'Asia/Bahrain', YE: 'Asia/Aden', KZ: 'Asia/Almaty', UZ: 'Asia/Tashkent',
  TJ: 'Asia/Dushanbe', TM: 'Asia/Ashgabat', KG: 'Asia/Bishkek',
  // Africa
  EG: 'Africa/Cairo', MA: 'Africa/Casablanca', DZ: 'Africa/Algiers', TN: 'Africa/Tunis',
  LY: 'Africa/Tripoli', SD: 'Africa/Khartoum', SS: 'Africa/Juba', ET: 'Africa/Addis_Ababa',
  KE: 'Africa/Nairobi', TZ: 'Africa/Dar_es_Salaam', UG: 'Africa/Kampala', ZA: 'Africa/Johannesburg',
  NA: 'Africa/Windhoek', BW: 'Africa/Gaborone', MZ: 'Africa/Maputo', AO: 'Africa/Luanda',
  NG: 'Africa/Lagos', GH: 'Africa/Accra', CI: 'Africa/Abidjan', SN: 'Africa/Dakar',
  ML: 'Africa/Bamako', NE: 'Africa/Niamey', TD: 'Africa/Ndjamena', CM: 'Africa/Douala',
  GA: 'Africa/Libreville', CG: 'Africa/Brazzaville', CD: 'Africa/Kinshasa', BI: 'Africa/Bujumbura',
  RW: 'Africa/Kigali', MU: 'Indian/Mauritius', MG: 'Indian/Antananarivo', MW: 'Africa/Blantyre',
  ZM: 'Africa/Lusaka', ZW: 'Africa/Harare', SO: 'Africa/Mogadishu', DJ: 'Africa/Djibouti',
  ER: 'Africa/Asmara', GM: 'Africa/Banjul', GW: 'Africa/Bissau', SL: 'Africa/Freetown',
  LR: 'Africa/Monrovia', CV: 'Atlantic/Cape_Verde', SC: 'Indian/Mahe', KM: 'Indian/Comoro',
  LS: 'Africa/Maseru', SZ: 'Africa/Mbabane', GQ: 'Africa/Libreville', BJ: 'Africa/Porto-Novo',
  TG: 'Africa/Lome', BF: 'Africa/Ouagadougou', MR: 'Africa/Nouakchott', EH: 'Africa/El_Aaiun',
  // Oceania
  AU: 'Australia/Sydney', NZ: 'Pacific/Auckland', FJ: 'Pacific/Fiji', PG: 'Pacific/Port_Moresby',
};

function fallbackTimezone(longitude) {
  // Etc/GMT sign is inverted relative to UTC offset
  const offset = Math.round(longitude / 15);
  return `Etc/GMT${offset <= 0 ? '-' + Math.abs(offset) : '+' + offset}`;
}

// Deterministic small hash for stable per-airport variety
function hashCode(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function escapeTsString(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

// ------------------------------------------------------------
// Main
// ------------------------------------------------------------
const raw = readFileSync(CSV_PATH, 'utf8');
const rows = parseCsv(raw);
if (rows.length < 2) {
  console.error('CSV appears to be empty.');
  process.exit(1);
}

const header = rows[0].map((h) => h.trim());
const col = Object.fromEntries(header.map((name, i) => [name, i]));

for (const required of ['ident', 'type', 'name', 'latitude_deg', 'longitude_deg', 'continent', 'country_name', 'iata_code', 'scheduled_service', 'score']) {
  if (!(required in col)) {
    console.error(`Missing expected column "${required}" in CSV. Header: ${header.join(', ')}`);
    process.exit(1);
  }
}

const byIata = new Map(); // iata -> best row (highest score)
let skippedNoIata = 0;
let skippedNoService = 0;
let skippedBadCoords = 0;

for (const r of rows.slice(1)) {
  const get = (name) => (col[name] != null && col[name] < r.length ? (r[col[name]] ?? '').trim() : '');

  const iata = get('iata_code').toUpperCase();
  if (!/^[A-Z]{3}$/.test(iata)) {
    skippedNoIata++;
    continue;
  }
  if (get('scheduled_service') !== '1') {
    skippedNoService++;
    continue;
  }

  const lat = parseFloat(get('latitude_deg'));
  const lon = parseFloat(get('longitude_deg'));
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    skippedBadCoords++;
    continue;
  }

  const score = parseInt(get('score'), 10) || 0;
  const existing = byIata.get(iata);
  if (!existing || score > existing.score) {
    byIata.set(iata, {
      iata,
      icao: get('ident').toUpperCase(),
      name: get('name'),
      city: (get('municipality') || get('region_name') || get('country_name')).trim(),
      country: get('country_name'),
      isoCountry: get('iso_country').toUpperCase(),
      continentCode: get('continent').toUpperCase(),
      lat,
      lon,
      type: get('type'),
      score,
    });
  }
}

const airports = [];
for (const a of byIata.values()) {
  const popularity = Math.max(1, Math.min(95, Math.round(Math.log10(a.score + 1) * 23)));
  const size = a.type === 'large_airport' && a.score >= 100000 ? 'large' : a.score >= 25000 ? 'medium' : 'small';

  const runwaysBySize = { large: 3, medium: 2, small: 1 };
  const terminalsBySize = { large: [1, 4], medium: [1, 2], small: [1, 1] };
  const h = hashCode(a.iata);
  const [tMin, tMax] = terminalsBySize[size];

  const landingFeeBase = size === 'large' ? 18000 : size === 'medium' ? 9000 : 4500;
  const landingFee = Math.round((landingFeeBase * (1 + popularity / 200)) / 100) * 100;

  airports.push({
    iata: a.iata,
    icao: a.icao || a.iata,
    name: a.name,
    city: a.city || a.country,
    country: a.country || 'Unknown',
    continent: CONTINENT_MAP[a.continentCode] || 'Other',
    latitude: Math.round(a.lat * 10000) / 10000,
    longitude: Math.round(a.lon * 10000) / 10000,
    timezone: COUNTRY_TIMEZONE[a.isoCountry] || fallbackTimezone(a.lon),
    size,
    runways: runwaysBySize[size],
    terminals: tMin + (h % (tMax - tMin + 1)),
    landingFee,
    slotRestrictions: false,
    popularity,
  });
}

airports.sort((x, y) => x.iata.localeCompare(y.iata));

const lines = [];
lines.push('// AUTO-GENERATED FILE — do not edit by hand.');
lines.push(`// Generated from world-airports.csv on ${new Date().toISOString()}`);
lines.push('// Regenerate with: npm run generate:airports');
lines.push('');
lines.push("import { Airport } from '@/types/game';");
lines.push('');
lines.push('export const CSV_AIRPORTS: Airport[] = [');

for (const a of airports) {
  lines.push(
    `  { iata: '${a.iata}', icao: '${a.icao}', name: '${escapeTsString(a.name)}', city: '${escapeTsString(a.city)}', country: '${escapeTsString(a.country)}', continent: '${a.continent}', latitude: ${a.latitude}, longitude: ${a.longitude}, timezone: '${a.timezone}', size: '${a.size}', runways: ${a.runways}, terminals: ${a.terminals}, landingFee: ${a.landingFee}, slotRestrictions: false, popularity: ${a.popularity} },`
  );
}

lines.push('];');
lines.push('');

writeFileSync(OUT_PATH, lines.join('\n'), 'utf8');

const bySize = airports.reduce((acc, a) => {
  acc[a.size] = (acc[a.size] || 0) + 1;
  return acc;
}, {});

console.log(`Generated ${airports.length} airports -> src/data/airports-full.generated.ts`);
console.log(`  by size: ${Object.entries(bySize).map(([k, v]) => `${k}=${v}`).join(', ')}`);
console.log(`  skipped: no IATA=${skippedNoIata}, no scheduled service=${skippedNoService}, bad coords=${skippedBadCoords}`);

