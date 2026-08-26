// ============================================================
// Aircraft Silhouettes — vector game art
// ------------------------------------------------------------
// Flat side-view silhouettes, one per aircraft category, drawn
// as inline SVG (viewBox 0 0 200 100, nose pointing right).
// No external image files required; scales crisply at any size.
// ============================================================

import { useId } from 'react';
import type { ReactNode } from 'react';
import type { AircraftCategory } from '@/types/game';
import { AIRCRAFT_DATABASE } from '@/data/aircraft';

export interface SilhouetteProps {
  className?: string;
}

/** Shared SVG frame: defines the hull gradient once per instance and scales content. */
type Paint = (gradId: string) => ReactNode;

function Frame({ className = '', children }: { className?: string; children: ReactNode | Paint }) {
  const gradId = useId();
  const content = typeof children === 'function' ? children(gradId) : children;
  return (
    <svg viewBox="0 0 200 100" className={className} fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#7dd3fc" />
          <stop offset="55%" stopColor="#38bdf8" />
          <stop offset="100%" stopColor="#0369a1" />
        </linearGradient>
      </defs>
      {content}
    </svg>
  );
}

/* ---------------------------------------------- */
/* Narrow-body (e.g. A320 / B737)                 */
/* ---------------------------------------------- */
const narrowBody: Paint = (g) => (
  <g>
    {/* Far wing */}
    <polygon points="100,44 132,29 148,29 122,44" fill={`url(#${g})`} opacity="0.75" />
    {/* Fuselage */}
    <path
      d="M12 52 C12 46 26 44 46 44 L148 44 C168 44 184 47 189 52 C184 57 168 60 148 60 L46 60 C26 60 12 58 12 52 Z"
      fill={`url(#${g})`}
    />
    {/* Vertical stabilizer */}
    <polygon points="28,45 44,16 58,16 47,45" fill={`url(#${g})`} />
    {/* Horizontal stabilizer */}
    <polygon points="16,49 38,43 44,47 24,54" fill={`url(#${g})`} opacity="0.85" />
    {/* Main wing */}
    <polygon points="92,58 136,84 154,84 114,58" fill={`url(#${g})`} />
    {/* Engine */}
    <ellipse cx="120" cy="70" rx="15" ry="8" fill={`url(#${g})`} />
    <circle cx="107" cy="70" r="3.5" fill="#0c4a6e" />
    {/* Cockpit window */}
    <polygon points="172,47 184,49 182,53 170,52" fill="#0c4a6e" />
    {/* Window strip */}
    <line x1="54" y1="49" x2="166" y2="49" stroke="#e0f2fe" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="3 5" opacity="0.55" />
  </g>
);

/* ---------------------------------------------- */
/* Regional jet (T-tail, shorter fuselage)        */
/* ---------------------------------------------- */
const regionalJet: Paint = (g) => (
  <g>
    {/* Far wing */}
    <polygon points="104,44 132,31 146,31 124,44" fill={`url(#${g})`} opacity="0.75" />
    {/* Fuselage */}
    <path
      d="M26 52 C26 46 38 44 52 44 L140 44 C158 44 172 47 177 52 C172 57 158 60 140 60 L52 60 C38 60 26 58 26 52 Z"
      fill={`url(#${g})`}
    />
    {/* T-tail fin */}
    <polygon points="38,45 52,13 65,13 55,45" fill={`url(#${g})`} />
    {/* T-tail top bar */}
    <polygon points="34,15 76,13 80,18 38,21" fill={`url(#${g})`} />
    {/* Horizontal stabilizer (under the T) */}
    <polygon points="28,50 48,45 54,49 34,54" fill={`url(#${g})`} opacity="0.85" />
    {/* Main wing */}
    <polygon points="98,58 136,80 152,80 116,58" fill={`url(#${g})`} />
    {/* Engine */}
    <ellipse cx="124" cy="66" rx="13" ry="7" fill={`url(#${g})`} />
    <circle cx="113" cy="66" r="3" fill="#0c4a6e" />
    {/* Cockpit window */}
    <polygon points="162,47 174,49 172,53 160,52" fill="#0c4a6e" />
    {/* Window strip */}
    <line x1="60" y1="49" x2="154" y2="49" stroke="#e0f2fe" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="3 5" opacity="0.55" />
  </g>
);

/* ---------------------------------------------- */
/* Turboprop (high wing + propeller)              */
/* ---------------------------------------------- */
const turboprop: Paint = (g) => (
  <g>
    {/* Fuselage */}
    <path
      d="M20 52 C20 47 32 45 46 45 L146 45 C164 45 178 48 182 52 C178 56 164 59 146 59 L46 59 C32 59 20 57 20 52 Z"
      fill={`url(#${g})`}
    />
    {/* Vertical stabilizer */}
    <polygon points="32,46 48,20 60,20 50,46" fill={`url(#${g})`} />
    {/* Horizontal stabilizer */}
    <polygon points="22,50 42,45 48,49 28,55" fill={`url(#${g})`} opacity="0.85" />
    {/* High wing */}
    <polygon points="88,49 138,22 156,22 118,49" fill={`url(#${g})`} />
    {/* Engine nacelle */}
    <ellipse cx="112" cy="31" rx="12" ry="7" fill={`url(#${g})`} />
    {/* Propeller */}
    <ellipse cx="97" cy="31" rx="2.5" ry="14" fill="#e0f2fe" opacity="0.9" />
    <circle cx="97" cy="31" r="2.5" fill="#0c4a6e" />
    {/* Cockpit window */}
    <polygon points="170,48 180,50 178,53 168,52" fill="#0c4a6e" />
    {/* Window strip */}
    <line x1="56" y1="50" x2="160" y2="50" stroke="#e0f2fe" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="3 5" opacity="0.55" />
  </g>
);

/* ---------------------------------------------- */
/* Wide-body (long, tall fuselage, 2 visible engines) */
/* ---------------------------------------------- */
const wideBody: Paint = (g) => (
  <g>
    {/* Far wing */}
    <polygon points="94,43 130,26 148,26 122,43" fill={`url(#${g})`} opacity="0.75" />
    {/* Fuselage */}
    <path
      d="M8 52 C8 45 22 43 42 43 L152 43 C172 43 187 47 191 52 C187 57 172 61 152 61 L42 61 C22 61 8 59 8 52 Z"
      fill={`url(#${g})`}
    />
    {/* Vertical stabilizer */}
    <polygon points="24,44 42,13 58,13 46,44" fill={`url(#${g})`} />
    {/* Horizontal stabilizer */}
    <polygon points="14,49 36,43 42,47 22,54" fill={`url(#${g})`} opacity="0.85" />
    {/* Main wing */}
    <polygon points="84,59 136,87 158,87 112,59" fill={`url(#${g})`} />
    {/* Engines (twin on visible wing) */}
    <ellipse cx="108" cy="72" rx="14" ry="8" fill={`url(#${g})`} />
    <circle cx="96" cy="72" r="3.5" fill="#0c4a6e" />
    <ellipse cx="140" cy="79" rx="14" ry="8" fill={`url(#${g})`} />
    <circle cx="128" cy="79" r="3.5" fill="#0c4a6e" />
    {/* Cockpit window */}
    <polygon points="176,46 188,48 186,52 174,51" fill="#0c4a6e" />
    {/* Window strip */}
    <line x1="50" y1="48" x2="170" y2="48" stroke="#e0f2fe" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="3 5" opacity="0.55" />
  </g>
);

/* ---------------------------------------------- */
/* Cargo (wide-body airframe, freight stripe)     */
/* ---------------------------------------------- */
const cargoPlane: Paint = (g) => (
  <g>
    {/* Far wing */}
    <polygon points="94,43 130,26 148,26 122,43" fill={`url(#${g})`} opacity="0.75" />
    {/* Fuselage */}
    <path
      d="M8 52 C8 45 22 43 42 43 L152 43 C172 43 187 47 191 52 C187 57 172 61 152 61 L42 61 C22 61 8 59 8 52 Z"
      fill={`url(#${g})`}
    />
    {/* Freight stripe (replaces window strip) */}
    <rect x="46" y="46" width="122" height="5" rx="2.5" fill="#f59e0b" opacity="0.75" />
    {/* Vertical stabilizer */}
    <polygon points="24,44 42,13 58,13 46,44" fill={`url(#${g})`} />
    {/* Horizontal stabilizer */}
    <polygon points="14,49 36,43 42,47 22,54" fill={`url(#${g})`} opacity="0.85" />
    {/* Main wing */}
    <polygon points="84,59 136,87 158,87 112,59" fill={`url(#${g})`} />
    {/* Engine */}
    <ellipse cx="112" cy="74" rx="14" ry="8" fill={`url(#${g})`} />
    <circle cx="100" cy="74" r="3.5" fill="#0c4a6e" />
    {/* Cockpit window */}
    <polygon points="176,46 188,48 186,52 174,51" fill="#0c4a6e" />
  </g>
);


/* ---------------------------------------------- */
/* Public components                               */
/* ---------------------------------------------- */

export function NarrowBodySilhouette({ className }: SilhouetteProps) {
  return <Frame className={className}>{narrowBody}</Frame>;
}

export function RegionalJetSilhouette({ className }: SilhouetteProps) {
  return <Frame className={className}>{regionalJet}</Frame>;
}

export function TurbopropSilhouette({ className }: SilhouetteProps) {
  return <Frame className={className}>{turboprop}</Frame>;
}

export function WideBodySilhouette({ className }: SilhouetteProps) {
  return <Frame className={className}>{wideBody}</Frame>;
}

export function CargoPlaneSilhouette({ className }: SilhouetteProps) {
  return <Frame className={className}>{cargoPlane}</Frame>;
}

/** Silhouette lookup per aircraft category (business jets render as a regional jet). */
const CATEGORY_SILHOUETTES: Record<AircraftCategory, (p: SilhouetteProps) => ReactNode> = {
  regional: RegionalJetSilhouette,
  turboprop: TurbopropSilhouette,
  'narrow-body': NarrowBodySilhouette,
  'wide-body': WideBodySilhouette,
  cargo: CargoPlaneSilhouette,
  'business-jet': RegionalJetSilhouette,
};

/** Renders the silhouette matching an aircraft category. */
export function AircraftSilhouette({ category, className }: { category?: AircraftCategory | null; className?: string }) {
  const Cmp = (category && CATEGORY_SILHOUETTES[category]) || NarrowBodySilhouette;
  return <Cmp className={className} />;
}

/** Resolves an aircraft database id to its category silhouette. */
export function SilhouetteForType({ typeId, className }: { typeId: string; className?: string }) {
  const type = AIRCRAFT_DATABASE.find((a) => a.id === typeId);
  return <AircraftSilhouette category={type?.category} className={className} />;
}

/** Silhouette on a themed gradient backdrop — used as artwork where no photo exists. */
export function AircraftArtwork({
  category,
  className = '',
  artClassName = 'w-3/4 h-3/4',
}: {
  category?: AircraftCategory | null;
  className?: string;
  artClassName?: string;
}) {
  return (
    <div
      className={`flex items-center justify-center bg-gradient-to-br from-sky-900/40 via-runway-800/60 to-blue-900/40 ${className}`}
    >
      <AircraftSilhouette category={category} className={artClassName} />
    </div>
  );
}

