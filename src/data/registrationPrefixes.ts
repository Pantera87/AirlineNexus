// Realistic aircraft registration (tail number) generation based on the
// airline's hub country. Patterns are representative approximations of each
// country's ICAO-style registration scheme (prefix, separator and suffix).
//
// Template syntax: 'l' = random letter (A-Z), 'd' = random digit (0-9);
// every other character is emitted literally (e.g. 'C-flll' -> C-FABC).
import { getAirportByIata } from './airports';

const REGISTRATION_TEMPLATES: Record<string, string> = {
  // Africa
  'Afghanistan': 'YA-lll',
  'Albania': 'ZH-lld',
  'Algeria': '7V-lld',
  'Angola': 'EX-lld',
  'Benin': '3D-lld',
  'Botswana': 'A7-lld',
  'Burkina Faso': '7T-lld',
  'Burundi': '9U-ddd',
  'Cameroon': 'TR-lld',
  'Cape Verde': 'XW-lld',
  'Central African Republic': 'TY-lld',
  'Chad': '3T-lld',
  'Comoros': '6O-lld',
  "Côte d'Ivoire": '3E-lld',
  'Democratic Republic of the Congo': '9F-lld',
  'Djibouti': 'J8-lld',
  'Egypt': 'SU-lll',
  'Equatorial Guinea': 'YS-lld',
  'Eritrea': 'ER-lld',
  'Eswatini': '7P-lld',
  'Ethiopia': 'ET-lll',
  'Gabon': 'TR-lll',
  'Gambia': '7C-lld',
  'Ghana': '9G-lll',
  'Guinea': '7X-lld',
  'Guinea-Bissau': '7W-lld',
  'Kenya': '5K-lll',
  'Lesotho': 'A7-lld',
  'Liberia': 'LJ-lld',
  'Libya': '5A-lld',
  'Madagascar': '9M-lll',
  'Malawi': '9C-lld',
  'Mali': '7B-lld',
  'Mauritania': '4J-lll',
  'Mauritius': '7T-lld',
  'Morocco': '9Q-lld',
  'Mozambique': 'PT-lll',
  'Namibia': '5V-lld',
  'Niger': '3O-lld',
  'Nigeria': '5N-lll',
  'Republic of the Congo': '9Q-lll',
  'Réunion': 'F-Olll',
  'Rwanda': '9X-lld',
  'Saint Helena, Ascension and Tristan da Cunha': 'VP-Hddd',
  'Saint Pierre and Miquelon': 'F-Olll',
  'Samoa': 'Nddddd',
  'São Tomé and Principe': 'AD-lll',
  'Senegal': '7V-lld',
  'Seychelles': '7V-lld',
  'Sierra Leone': '5L-lld',
  'Solomon Islands': '9M-lld',
  'Somalia': '3H-ddd',
  'South Africa': 'ZS-lll',
  'South Sudan': '5Y-lll',
  'Sudan': 'SU-lld',
  'Tanzania': '5H-lll',
  'Timor-Leste': '7D-lll',
  'Togo': '2B-lld',
  'Tonga': 'A3-lll',
  'Tunisia': 'TS-lll',
  'Turks and Caicos Islands': 'VQ-Tddd',
  'Tuvalu': 'T2-lll',
  'Uganda': '5X-lld',
  'Vanuatu': 'YJ-lll',
  'Wallis and Futuna': 'F-Olll',
  'Western Sahara (disputed territory)': '9W-lld',
  'Yemen': '7O-lll',
  'Zambia': '9J-lll',
  'Zimbabwe': 'Z-llll',

  // Americas
  'American Samoa': 'Nddddd',
  'Anguilla': 'VP-Addd',
  'Antigua and Barbuda': 'V2-lll',
  'Argentina': 'LV-lld',
  'Aruba': 'PJ-lll',
  'Bahamas': 'CP-ddd',
  'Barbados': 'YB6-lld',
  'Belize': 'V2-lll',
  'Bermuda': 'VP-Bddd',
  'Bolivia': 'CP-dddd',
  'Brazil': 'PT-lll',
  'British Virgin Islands': 'VP-Bddd',
  'Cayman Islands': 'VP-Cddd',
  'Canada': 'C-flll',
  'Caribbean Netherlands': 'PJ-lll',
  'Chile': 'CC-lld',
  'Colombia': 'HK-lll',
  'Costa Rica': 'HP-ddd',
  'Cuba': 'CP-dddd',
  'Curaçao': 'PJ-lll',
  'Dominica': 'VP-Dddd',
  'Dominican Republic': 'HD-lld',
  'Ecuador': 'HC-lld',
  'El Salvador': 'PH-ddd',
  'Falkland Islands': 'VP-Fddd',
  'Grenada': 'VP-Gddd',
  'Guadeloupe': 'F-Olll',
  'Guam': 'Nddddd',
  'Guatemala': 'TA-lld',
  'Guyana': '8Y-lll',
  'Haiti': 'HI-ddd',
  'Honduras': 'HR-lld',
  'Jamaica': '9J-lld',
  'Marshall Islands': 'Nddddd',
  'Martinique': 'F-Olll',
  'Mayotte': 'F-Olll',
  'Mexico': 'XA-lll',
  'Micronesia': 'V8-lld',
  'Montserrat': 'VP-Mddd',
  'Nicaragua': 'PH-ddd',
  'Northern Mariana Islands': 'Nddddd',
  'Panama': 'HP-ddd',
  'Papua New Guinea': 'P2-lll',
  'Paraguay': 'CZ-lld',
  'Peru': 'OB-lld',
  'Philippines': 'RP-lddd',
  'Puerto Rico': 'Nddddd',
  'Saint Barthélemy': 'F-Olll',
  'Saint Kitts and Nevis': 'VP-Kddd',
  'Saint Lucia': 'YB2-lld',
  'Saint Martin': 'F-Olll',
  'Saint Vincent and the Grenadines': 'VP-Vddd',
  'Suriname': '9Y-lll',
  'Trinidad and Tobago': '9Y-lll',
  'U.S. Virgin Islands': 'Nddddd',
  'United States': 'Nddddd',
  'United States Minor Outlying Islands': 'Nddddd',
  'Uruguay': 'CX-lll',
  'Venezuela': 'YV-lll',

  // Asia
  'Bahrain': '9A-lld',
  'Bangladesh': 'F8-lld',
  'Bhutan': 'XU-lld',
  'Brunei': '9V-lll',
  'Cambodia': 'RD-lld',
  'China': 'B-ddddd',
  'Hong Kong': 'B-lll',
  'India': 'VT-lddd',
  'Indonesia': 'PK-lll',
  'Iran': 'EP-lld',
  'Iraq': 'YI-lld',
  'Israel': '4X-lld',
  'Japan': 'JAddll',
  'Jordan': 'JY-lld',
  'Kazakhstan': 'PK-lll',
  'Kiribati': 'T7-lld',
  'Kuwait': 'JK-lll',
  'Kyrgyzstan': 'EX-lld',
  'Laos': 'RD-lll',
  'Macau': 'B-lll',
  'Malaysia': '9M-lll',
  'Maldives': '8Q-lld',
  'Myanmar': 'ZS-lld',
  'Nepal': '9A-lld',
  'North Korea': 'PK-lld',
  'Oman': 'A7-lld',
  'Pakistan': 'AP-lld',
  'Palau': 'V8-lll',
  'Qatar': 'A7-lld',
  'Russia': 'RA-ddddd',
  'Saudi Arabia': 'HZ-lll',
  'United Arab Emirates': 'A6-lll',
  'Singapore': '9V-lll',
  'South Korea': 'HLdddd',
  'Sri Lanka': '4R-lll',
  'Taiwan': 'B-ddddd',
  'Tajikistan': 'EY-lld',
  'Thailand': 'HS-lll',
  'Turkey': 'TC-lll',
  'Turkmenistan': 'EZ-lld',
  'Uzbekistan': 'UK-lld',
  'Vietnam': 'VN-lddd',

  // Europe
  'Armenia': 'EK-lld',
  'Austria': 'OE-lll',
  'Azerbaijan': '4K-lld',
  'Belarus': 'EX-ddd',
  'Belgium': 'OH-lll',
  'Bosnia and Herzegovina': '9A-lld',
  'Bulgaria': 'LB-lld',
  'Croatia': '9A-lld',
  'Cyprus': '5B-lld',
  'Czech Republic': 'OK-lld',
  'Denmark': 'OY-lld',
  'Estonia': 'ES-lld',
  'Faroe Islands': 'OY-lld',
  'Finland': 'OH-lll',
  'France': 'F-Glll',
  'French Guiana': 'F-Ylll',
  'French Polynesia': 'F-Olll',
  'Georgia': '4L-lld',
  'Germany': 'D-llld',
  'Gibraltar': 'G-Xlll',
  'Greece': 'SX-lll',
  'Greenland': 'OJ-lll',
  'Guernsey': 'G-Ulll',
  'Hungary': 'HA-lld',
  'Iceland': 'TF-lll',
  'Ireland': 'EI-lll',
  'Isle of Man': 'G-Mlll',
  'Italy': 'I-llll',
  'Jersey': 'G-Jlll',
  'Kosovo': 'ZK-lld',
  'Latvia': 'YL-lld',
  'Lebanon': 'TK-lld',
  'Lithuania': 'LY-lld',
  'Luxembourg': 'LX-lld',
  'Malta': '9H-lld',
  'Moldova': 'ER-lld',
  'Monaco': 'F-Tlll',
  'Mongolia': 'JU-lld',
  'Montenegro': 'M3-lld',
  'Netherlands': 'PH-lll',
  'New Caledonia': 'F-Olll',
  'North Macedonia': 'EX-ddd',
  'Norway': 'LA-lll',
  'Poland': 'SP-lld',
  'Portugal': 'CP-lll',
  'Romania': 'YR-lld',
  'Serbia': 'YU-ddd',
  'Sint Maarten': 'PH-lld',
  'Slovakia': 'OM-lld',
  'Slovenia': 'S2-lld',
  'Spain': 'EC-lll',
  'Sweden': 'SE-lld',
  'Switzerland': 'HB-Jlll',
  'Syria': 'YK-lld',
  'United Kingdom': 'G-llll',

  // Oceania
  'Australia': 'VH-lll',
  'Christmas Island': 'VH-lll',
  'Cocos (Keeling) Islands': 'VH-lll',
  'Cook Islands': 'ZK-lll',
  'Fiji': '9H-lll',
  'New Zealand': 'ZK-lll',
  'Nauru': 'V8-lll',
  'Niue': 'ZK-lll',
  'Norfolk Island': 'VH-lll',
};

const DEFAULT_TEMPLATE = 'Nddddd'; // Fallback (US-style) for unknown countries
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const MAX_ATTEMPTS = 100;

function randomLetter(): string {
  return LETTERS[Math.floor(Math.random() * LETTERS.length)];
}

function randomDigit(): string {
  return String(Math.floor(Math.random() * 10));
}

/** Expand a registration template into a concrete tail number. */
function generateFromTemplate(template: string): string {
  let reg = '';
  for (const ch of template) {
    if (ch === 'l') reg += randomLetter();
    else if (ch === 'd') reg += randomDigit();
    // Real tail numbers are always uppercase — normalize literals too.
    else reg += ch.toUpperCase();
  }
  return reg;
}

/**
 * Generate a plausible aircraft registration for the given country.
 * Pass `exclude` (e.g. existing fleet registrations) to avoid duplicates.
 */
export function generateRegistration(
  country: string | null | undefined,
  exclude?: readonly string[]
): string {
  const template = (country && REGISTRATION_TEMPLATES[country]) || DEFAULT_TEMPLATE;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const reg = generateFromTemplate(template);
    if (!exclude || !exclude.includes(reg)) return reg;
  }
  // Collision budget exhausted — accept the last candidate.
  return generateFromTemplate(template);
}

/**
 * Generate a registration for the airline headquartered at `hubIata`.
 * The hub airport's country determines the registration prefix/suffix scheme.
 */
export function generateRegistrationForHub(
  hubIata: string,
  exclude?: readonly string[]
): string {
  const hub = getAirportByIata(hubIata);
  return generateRegistration(hub?.country, exclude);
}
