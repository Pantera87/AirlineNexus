// ============================================================
// ChartPanel — shared chart chrome for recharts panels
// ============================================================

import type { ReactNode } from 'react';
import { BarChart3 } from 'lucide-react';

/** Glass-panel wrapper with a themed header for chart sections. */
export function ChartPanel({
  title,
  subtitle,
  icon,
  className = '',
  children,
}: {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`glass-panel p-5 ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          {icon ?? <BarChart3 className="w-4 h-4 text-sky-400" />}
          <h3 className="text-sm font-semibold text-white">{title}</h3>
        </div>
        {subtitle && <span className="text-xs text-runway-500">{subtitle}</span>}
      </div>
      {children}
    </div>
  );
}

/** Dark glass-themed tooltip shared by all recharts charts. */
export function ChartTooltip({
  active,
  payload,
  label,
  valueFormatter,
}: {
  active?: boolean;
  payload?: any[];
  label?: string | number;
  valueFormatter?: (value: number) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass-panel px-3 py-2 text-xs">
      {label !== undefined && <p className="text-runway-400 mb-1">{label}</p>}
      {payload.map((entry, i) => (
        <p key={`${String(entry.dataKey ?? i)}-${i}`} className="font-medium flex items-center gap-2" style={{ color: entry.color || entry.stroke || '#e2e8f0' }}>
          <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: entry.color || entry.stroke || '#e2e8f0' }} />
          <span className="text-runway-300">{entry.name}:</span>
          {valueFormatter ? valueFormatter(Number(entry.value)) : entry.value}
        </p>
      ))}
    </div>
  );
}

/** Compact currency formatter for chart axes/tooltips ($4.2M style). */
export function compactMoney(value: number): string {
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(0)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}
