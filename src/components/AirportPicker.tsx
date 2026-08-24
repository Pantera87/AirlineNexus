import { useMemo, useRef, useState } from 'react';
import { Search, MapPin, X } from 'lucide-react';
import type { Airport } from '@/types/game';
import { AIRPORT_DATABASE } from '@/data/airports';

interface AirportPickerProps {
  label: string;
  value: string | null; // selected IATA code
  onChange: (iata: string) => void;
  /** Exclude this airport from the results (e.g. the origin when picking a destination) */
  excludeIata?: string;
  /** Exclude multiple airports from the results (e.g. hub + stops when picking a destination). */
  excludeIatas?: string[];
}

const MAX_RESULTS = 25;

/**
 * Searchable airport typeahead over the full ~4k-airport database.
 * Filters by IATA, city, name or country as you type.
 */
export function AirportPicker({ label, value, onChange, excludeIata, excludeIatas }: AirportPickerProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedAirport = useMemo(
    () => (value ? AIRPORT_DATABASE.find((a) => a.iata === value) ?? null : null),
    [value]
  );

  const excludedIatas = useMemo(
    () => new Set([excludeIata, ...(excludeIatas ?? [])].filter(Boolean)),
    [excludeIata, excludeIatas]
  );

  const results = useMemo(() => {
    if (!open || !query.trim()) return [];
    const q = query.trim().toUpperCase();
    const matches: Airport[] = [];
    for (const airport of AIRPORT_DATABASE) {
      if (excludedIatas.has(airport.iata)) continue;
      if (
        airport.iata.startsWith(q) ||
        airport.city.toUpperCase().includes(q) ||
        airport.name.toUpperCase().includes(q) ||
        airport.country.toUpperCase().includes(q)
      ) {
        matches.push(airport);
        if (matches.length >= MAX_RESULTS) break;
      }
    }
    return matches;
  }, [query, open, excludedIatas]);

  const handleSelect = (iata: string) => {
    onChange(iata);
    setQuery('');
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative">
      <label className="block text-sm font-medium text-runway-300 mb-2">{label}</label>

      {selectedAirport ? (
        <div className="flex items-center justify-between gap-2 p-3 rounded-lg bg-sky-500/10 border border-sky-500/30">
          <div className="min-w-0">
            <p className="text-sm font-bold text-white truncate">
              {selectedAirport.iata} — {selectedAirport.city}, {selectedAirport.country}
            </p>
            <p className="text-xs text-runway-400 truncate">{selectedAirport.name}</p>
          </div>
          <button
            type="button"
            onClick={() => onChange('')}
            className="shrink-0 text-runway-400 hover:text-white p-1"
            title="Clear selection"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-runway-500" />
            <input
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              onBlur={() => setTimeout(() => setOpen(false), 150)}
              placeholder={`Search ${AIRPORT_DATABASE.length.toLocaleString()} airports (IATA, city, country…)`}
              className="input-field input-icon-left"
            />
          </div>

          {open && query.trim() && (
            <ul className="absolute z-20 mt-1 w-full max-h-64 overflow-auto rounded-lg bg-runway-800 border border-white/10 shadow-xl">
              {results.length === 0 ? (
                <li className="px-3 py-2 text-sm text-runway-500">No airports found</li>
              ) : (
                results.map((airport) => (
                  <li key={airport.iata}>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handleSelect(airport.iata)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-sky-500/10 transition-colors"
                    >
                      <MapPin className="w-3.5 h-3.5 shrink-0 text-runway-500" />
                      <span className="text-sm font-bold text-white w-9">{airport.iata}</span>
                      <span className="text-sm text-runway-300 truncate">
                        {airport.city}, {airport.country}
                      </span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
