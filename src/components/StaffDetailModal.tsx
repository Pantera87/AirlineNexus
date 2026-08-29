// ============================================================
// Staff Detail Modal — full profile for one crew member
// ------------------------------------------------------------
// Opened from the Staff screen by clicking a roster card header.
// Shows the portrait, career bio, age, languages, HR data (salary,
// flight hours, tenure, morale, duty-time windows) and the member's
// current weekly roster, derived from the existing assignments +
// route timetables (no new game state).
// ============================================================

import { useEffect } from 'react';
import { motion } from 'framer-motion';
import type { Aircraft, Route, StaffMember, TimetableLeg } from '@/types/game';
import { getAircraftById } from '@/data/aircraft';
import { formatCurrency, formatNumber, formatShortDate } from '@/utils/helpers';
import { getRoutePath } from '@/utils/routeEngine';
import {
  pilotDutyWindows,
  isOnMandatoryRest,
  isFlyingCrewRole,
  DUTY_7D_HOURS,
  DUTY_28D_HOURS,
  FLIGHT_TIME_28D_HOURS,
  FLIGHT_TIME_12MO_HOURS,
} from '@/utils/crewRegulations';
import { StatusPill } from './icons/StatusIcons';
import StaffAvatar from './StaffAvatar';

const ROLE_LABELS: Record<StaffMember['role'], string> = {
  captain: 'Captain',
  'first-officer': 'First Officer',
  purser: 'Purser',
  'cabin-crew': 'Cabin Crew',
  engineer: 'Maintenance Engineer',
};

const WEEKDAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Per-day status in the weekly roster grid. */
type DayStatus = 'operating' | 'resting' | 'day-off';

const DAY_CELL_STYLES: Record<DayStatus, string> = {
  operating: 'border-emerald-500/30 bg-emerald-500/10',
  resting: 'border-sky-500/30 bg-sky-500/10',
  'day-off': 'border-white/10 bg-white/5',
};

const DAY_STATUS_TEXT: Record<DayStatus, string> = {
  operating: 'text-emerald-300',
  resting: 'text-sky-300',
  'day-off': 'text-slate-500',
};

const DAY_STATUS_LABEL: Record<DayStatus, string> = {
  operating: 'Operating',
  resting: 'Resting',
  'day-off': 'Day off',
};

/** Mon–Sun weekly roster grid: each day cell shows its status + scheduled legs. */
function RosterDayGrid({ days }: { days: Array<{ name: string; legs: TimetableLeg[]; status: DayStatus }> }) {
  return (
    <div className="grid grid-cols-7 gap-1.5">
      {days.map((d) => (
        <div key={d.name} className={`rounded-md border p-1.5 min-h-19.5 flex flex-col gap-1 ${DAY_CELL_STYLES[d.status]}`}>
          <span className="text-[10px] font-semibold text-slate-300">{d.name}</span>
          <span className={`text-[9px] uppercase tracking-wide font-semibold ${DAY_STATUS_TEXT[d.status]}`}>
            {DAY_STATUS_LABEL[d.status]}
          </span>
          <div className="space-y-0.5">
            {d.legs.slice(0, 3).map((leg, i) => (
              <p key={i} className="text-[10px] leading-tight font-mono text-slate-300">
                {formatTime(leg.departureMin)} {leg.fromIata}→{leg.toIata}
              </p>
            ))}
            {d.legs.length > 3 && <p className="text-[10px] text-slate-500">+{d.legs.length - 3} more</p>}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Minutes since midnight → "HH:MM". */
function formatTime(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(Math.round(min % 60)).padStart(2, '0')}`;
}

/** Tenure in years/months between two dates. */
function formatTenure(from: Date, to: Date): string {
  const months = Math.max(0, (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth()));
  if (months < 1) return 'less than a month';
  const years = Math.floor(months / 12);
  const rest = months % 12;
  return rest === 0 ? `${years} yr${years === 1 ? '' : 's'}` : `${years} yr${years === 1 ? '' : 's'} ${rest} mo`;
}

function SpecRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-gray-300">{label}</span>
      <span className="text-white font-medium text-right">{value}</span>
    </div>
  );
}

interface StaffDetailModalProps {
  member: StaffMember;
  fleet: Aircraft[];
  routes: Route[];
  currentDate: Date;
  currency: 'USD' | 'EUR' | 'GBP';
  onClose: () => void;
}

export default function StaffDetailModal({
  member,
  fleet,
  routes,
  currentDate,
  currency,
  onClose,
}: StaffDetailModalProps) {
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  const onRest = isOnMandatoryRest(member);
  const isFlyingCrew = isFlyingCrewRole(member.role);

  const aircraft = member.assignedAircraft ? fleet.find((a) => a.id === member.assignedAircraft) ?? null : null;
  const aircraftType = aircraft ? getAircraftById(aircraft.typeId) ?? null : null;

  // The member's own deployment: the crew dispatcher rosters each member to a
  // specific airframe (assignedAircraft), and the fleet dispatcher assigns
  // each deployed airframe the route it operates this week
  // (aircraft.assignedRoute — set in gameStore dispatch).
  const homeRoute = aircraft?.assignedRoute
    ? routes.find((r) => r.id === aircraft.assignedRoute && r.isActive) ?? null
    : null;

  // This member's Mon–Sun roster from their deployed route's timetable
  // (dayIndex: Mon=0 … Sun=6). A day without legs is 'resting' when it
  // follows a duty day, otherwise 'day off'; without a deployment the whole
  // week is off, and on mandatory rest the whole week is shown as resting.
  const memberDayLegs: TimetableLeg[][] = WEEKDAY_NAMES.map(() => []);
  for (const leg of homeRoute?.timetable?.legs ?? []) memberDayLegs[leg.dayIndex]?.push(leg);
  memberDayLegs.forEach((legs) => legs.sort((a, b) => a.departureMin - b.departureMin));
  const rosterDays: Array<{ name: string; legs: TimetableLeg[]; status: DayStatus }> = WEEKDAY_NAMES.map(
    (name, i) => ({
      name,
      legs: memberDayLegs[i] ?? [],
      status: onRest
        ? 'resting'
        : (memberDayLegs[i]?.length ?? 0) > 0
          ? 'operating'
          : i > 0 && (memberDayLegs[i - 1]?.length ?? 0) > 0
            ? 'resting'
            : 'day-off',
    }),
  );

  const duty = pilotDutyWindows(member);
  const windows = isFlyingCrew
    ? [
        { label: 'Duty — 7-day window', used: duty.duty7d, cap: DUTY_7D_HOURS },
        { label: 'Duty — 28-day window', used: duty.duty28d, cap: DUTY_28D_HOURS },
        { label: 'Flight — 28-day window', used: duty.flight28d, cap: FLIGHT_TIME_28D_HOURS },
        { label: 'Flight — 12-month window', used: duty.flight12mo, cap: FLIGHT_TIME_12MO_HOURS },
      ]
    : [];

  const recentWeeks = isFlyingCrew ? [...(member.dutyHistory ?? [])].slice(-8).reverse() : [];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 glass-modal-backdrop z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.96, y: 12 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.96, y: 12 }}
        transition={{ type: 'spring', damping: 26, stiffness: 320 }}
        className="glass-modal max-w-2xl w-full max-h-[90vh] overflow-y-auto relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-white text-2xl z-10"
          title="Close (Esc)"
        >
          ✕
        </button>

        <div className="p-6">
          {/* Header: portrait + identity */}
          <div className="flex items-start gap-4 mb-5">
            <StaffAvatar member={member} className="w-24 h-24" />
            <div className="min-w-0 flex-1">
              <h2 className="text-2xl font-bold text-white truncate">{member.name}</h2>
              <p className="text-slate-300 mt-0.5">
                {ROLE_LABELS[member.role]}
                {member.age != null ? ` · ${member.age} yrs old` : ''} · {member.gender === 'female' ? 'Female' : 'Male'}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {onRest ? (
                  <StatusPill tone="red" title="A crew-time window is exhausted — not flying this week">
                    Mandatory rest
                  </StatusPill>
                ) : aircraft ? (
                  <StatusPill tone="green" title={`${aircraftType?.name ?? aircraft.typeId} ${aircraft.registration}`}>
                    {aircraftType?.name ?? aircraft.typeId} pool
                  </StatusPill>
                ) : (
                  <StatusPill tone="amber" title="Waiting for the crew dispatcher to roster a slot">
                    Unassigned
                  </StatusPill>
                )}
                {member.typeRating && (
                  <span
                    className="inline-flex px-2 py-1 rounded-full text-xs font-medium border bg-slate-700/40 border-slate-600/40 text-slate-200"
                    title="Type rating (qualifies the pilot to fly this aircraft type)"
                  >
                    {member.typeRating}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Bio */}
          {member.bio && (
            <p className="text-sm text-slate-300 leading-relaxed mb-4 border-l-2 border-slate-600/60 pl-3">
              {member.bio}
            </p>
          )}

          {/* Languages */}
          {member.languages && member.languages.length > 0 && (
            <div className="mb-5">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Languages</h3>
              <div className="flex flex-wrap gap-1.5">
                {member.languages.map((lang) => (
                  <span
                    key={lang}
                    className="px-2 py-0.5 rounded-full text-xs bg-sky-500/10 text-sky-300 border border-sky-500/20"
                  >
                    {lang}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* HR details */}
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">HR details</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2 text-sm mb-4">
            <div>
              <SpecRow label="Monthly salary" value={formatCurrency(member.salary, currency)} />
              {member.flightHours > 0 && <SpecRow label="Flight hours" value={`${formatNumber(member.flightHours)} h`} />}
              <SpecRow label="Experience" value={`${member.experience} yr${member.experience === 1 ? '' : 's'}`} />
              <SpecRow
                label="Hired"
                value={`${formatShortDate(member.startDate)} (${formatTenure(member.startDate, currentDate)})`}
              />
            </div>
            <div>
              <SpecRow label="Performance" value={`${member.performance}/100`} />
              {member.typeRating && <SpecRow label="Type rating" value={member.typeRating} />}
            </div>
          </div>

          {/* Morale bar */}
          <div className="mb-5">
            <div className="flex justify-between text-xs text-slate-400 mb-1">
              <span>Morale</span>
              <span>{member.morale}/100</span>
            </div>
            <div className="w-full rounded-full bg-white/10 overflow-hidden h-2">
              <div
                className={`h-full rounded-full ${member.morale >= 70 ? 'bg-emerald-500' : member.morale >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                style={{ width: `${member.morale}%` }}
              />
            </div>
          </div>

          {/* Duty-time windows (flying crew only) */}
          {windows.length > 0 && (
            <div className="mb-5">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                Crew-time limits (EU-OSL)
              </h3>
              <div className="space-y-2.5">
                {windows.map((w) => {
                  const usedPct = Math.min(1, w.used / w.cap);
                  return (
                    <div key={w.label}>
                      <div className="flex justify-between text-xs text-slate-400 mb-0.5">
                        <span>{w.label}</span>
                        <span>
                          {w.used.toFixed(1)} / {w.cap} h
                        </span>
                      </div>
                      <div className="w-full rounded-full bg-white/10 overflow-hidden h-1.5">
                        <div
                          className={`h-full rounded-full ${usedPct >= 0.85 ? 'bg-red-500' : usedPct >= 0.6 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                          style={{ width: `${usedPct * 100}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {recentWeeks.length > 0 && (
                <div className="mt-3">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                    Recent weeks
                  </h4>
                  <div className="flex flex-wrap gap-1.5">
                    {recentWeeks.map((w) => (
                      <span
                        key={w.weekStart}
                        className="px-2 py-0.5 rounded bg-slate-700/40 border border-slate-600/40 text-[11px] text-slate-300"
                        title={`Week of ${formatShortDate(new Date(w.weekStart + 'T00:00:00'))}`}
                      >
                        {formatShortDate(new Date(w.weekStart + 'T00:00:00'))}: {w.flightHours.toFixed(1)} h
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* This week's roster */}
          <div className="border-t border-slate-700 pt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">This week's roster</h3>

            {member.role === 'engineer' ? (
              <p className="text-sm text-slate-300">
                Ground support — works across the whole fleet at the maintenance shop, not tied to a single airframe
                this week.
              </p>
            ) : onRest ? (
              <div className="space-y-3">
                <div className="rounded-lg bg-red-500/10 border border-red-500/30 p-3 text-sm text-red-300">
                  Mandatory rest — a crew-time window is exhausted, so this member is not rostered on any flight this
                  week. Capacity returns as the rolling windows slide forward.
                </div>
                <RosterDayGrid days={rosterDays} />
              </div>
            ) : aircraft ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm text-white font-medium">
                    {aircraftType?.name ?? aircraft.typeId} {aircraft.registration}
                  </span>
                  {homeRoute && (
                    <span className="px-2 py-0.5 rounded bg-sky-500/10 text-sky-300 border border-sky-500/20 text-xs">
                      {getRoutePath(homeRoute).join(' → ')} · {homeRoute.frequency}×/wk
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400">
                  {homeRoute
                    ? `Rostered on ${aircraft.registration}, operating ${getRoutePath(homeRoute).join(' → ')} ${homeRoute.frequency}× a week.`
                    : `${aircraft.registration} has no route deployed this week, so this member is off duty all week.`}
                </p>
                <RosterDayGrid days={rosterDays} />
                {homeRoute && (homeRoute.timetable?.legs?.length ?? 0) === 0 && (
                  <p className="text-xs text-slate-500">
                    No timetable published yet — legs appear once the weekly schedule is generated.
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-3 text-sm text-amber-300">
                  No airframe assigned this week — the whole week is off duty. The crew dispatcher will roster this
                  member as soon as a slot opens up.
                </div>
                <RosterDayGrid days={rosterDays} />
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}