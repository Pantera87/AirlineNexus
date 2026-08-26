// ============================================================
// Status UI primitives — dots, pills, meter bars
// ------------------------------------------------------------
// Small visual building blocks that replace plain text labels
// across screens (status dots, colored pills, gradient meters).
// ============================================================

import type { ReactNode } from 'react';

export type Tone = 'green' | 'amber' | 'red' | 'sky';

const DOT_COLORS: Record<Tone, string> = {
  green: 'bg-green-400',
  amber: 'bg-amber-400',
  red: 'bg-red-400',
  sky: 'bg-sky-400',
};

const PILL_TONES: Record<Tone, string> = {
  green: 'bg-green-500/10 text-green-400 border-green-500/20',
  amber: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  red: 'bg-red-500/10 text-red-400 border-red-500/20',
  sky: 'bg-sky-500/10 text-sky-400 border-sky-500/20',
};

const FILL_GRADIENTS: Record<Tone, string> = {
  green: 'bg-gradient-to-r from-emerald-500 to-green-400',
  amber: 'bg-gradient-to-r from-amber-500 to-amber-400',
  red: 'bg-gradient-to-r from-red-500 to-red-400',
  sky: 'bg-gradient-to-r from-sky-500 to-sky-400',
};

/** Glowing status dot. */
export function StatusDot({ tone, pulse = false, className = '' }: { tone: Tone; pulse?: boolean; className?: string }) {
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full ${DOT_COLORS[tone]} ${pulse ? 'animate-pulse' : ''} ${className}`}
    />
  );
}

/** Rounded pill badge with a dot (or custom icon) and label. */
export function StatusPill({
  tone,
  icon,
  title,
  children,
  className = '',
}: {
  tone: Tone;
  icon?: ReactNode;
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium border ${PILL_TONES[tone]} ${className}`}
    >
      {icon ?? <StatusDot tone={tone} pulse />}
      {children}
    </span>
  );
}

/**
 * Gradient meter bar.
 * @param value 0..1 fill ratio.
 * @param tone 'auto' resolves from the value: >=0.66 green, >=0.33 amber, else red.
 */
export function MeterBar({
  value,
  tone = 'auto',
  height = 'h-1.5',
  className = '',
}: {
  value: number;
  tone?: Tone | 'auto';
  height?: string;
  className?: string;
}) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  const resolved: Tone =
    tone === 'auto' ? (value >= 0.66 ? 'green' : value >= 0.33 ? 'amber' : 'red') : tone;
  return (
    <div className={`w-full rounded-full bg-white/10 overflow-hidden ${height} ${className}`}>
      <div
        className={`h-full rounded-full transition-all duration-500 ${FILL_GRADIENTS[resolved]}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/** Map a raw status string (fleet/status pills) to a tone. */
export function toneFromStatus(status: string): Tone {
  switch (status) {
    case 'available':
    case 'active':
      return 'green';
    case 'maintenance':
    case 'parked':
      return 'amber';
    case 'in-flight':
    case 'stored':
    case 'storage':
      return 'sky';
    default:
      return 'amber';
  }
}
