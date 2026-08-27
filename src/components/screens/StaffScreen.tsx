import { useState } from 'react';
import { useGameStore } from '@store/gameStore';
import { getAircraftById } from '@data/aircraft';
import { formatCurrency, formatNumber } from '@utils/helpers';
import type { StaffMember, StaffRole } from '@/types/game';
import {
  ROLE_LABELS,
  isPilotRole,
  generateHiringShortlist,
  getPromotionEligibility,
  describeTypeConversionCost,
  REDUCED_WAGE_OPTIONS,
  REDUCED_WAGE_MULTIPLIER,
  pilotMarketSalary,
  nonPilotMarketSalary,
} from '@/utils/staffEngine';
import { computeCrewPlan } from '@/utils/crewDispatcher';
import { MeterBar, StatusPill } from '@/components/icons/StatusIcons';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users,
  UserPlus,
  Plane,
  Shield,
  TrendingUp,
  X,
  RefreshCw,
  Wrench,
  Activity,
  DollarSign,
} from 'lucide-react';

// --- Static role metadata for the UI ----------------------------------------

const ROSTER_FILTERS: { id: StaffRole | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'captain', label: ROLE_LABELS.captain },
  { id: 'first-officer', label: ROLE_LABELS['first-officer'] },
  { id: 'purser', label: ROLE_LABELS.purser },
  { id: 'cabin-crew', label: ROLE_LABELS['cabin-crew'] },
  { id: 'engineer', label: ROLE_LABELS.engineer },
];

const HIRABLE_ROLES: StaffRole[] = ['captain', 'first-officer', 'purser', 'cabin-crew', 'engineer'];

/** Market salary preview for a candidate (used to label hiring cards). */
function candidateMarketSalary(m: StaffMember): number {
  return isPilotRole(m.role) ? pilotMarketSalary(m.role, m.flightHours) : nonPilotMarketSalary(m.role, m.experience);
}

/**
 * Square staff portrait. Renders the photo-bank image when available and the
 * file exists; otherwise (or on load failure) falls back to an initials
 * monogram so the roster still looks right before the photo bank is filled.
 */
function StaffAvatar({ member, className = 'w-9 h-9' }: { member: StaffMember; className?: string }) {
  const [imgFailed, setImgFailed] = useState(false);
  const initials = member.name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('');
  const showPhoto = member.photo != null && !imgFailed;
  return (
    <div
      className={`${className} shrink-0 rounded-lg overflow-hidden bg-white/5 border border-white/10 flex items-center justify-center`}
    >
      {showPhoto ? (
        <img
          src={member.photo!}
          alt={member.name}
          className="w-full h-full object-cover"
          onError={() => setImgFailed(true)}
        />
      ) : (
        <span className="text-[11px] font-semibold text-runway-300">{initials}</span>
      )}
    </div>
  );
}

export function StaffScreen() {
  const airline = useGameStore((state) => state.airline);
  const currentDate = useGameStore((state) => state.currentDate);
  const settings = useGameStore((state) => state.settings);
  const addNotification = useGameStore((state) => state.addNotification);
  const hireStaff = useGameStore((state) => state.hireStaff);
  const fireStaff = useGameStore((state) => state.fireStaff);
  const promoteStaff = useGameStore((state) => state.promoteStaff);
  const convertTypeRating = useGameStore((state) => state.convertTypeRating);

  const [tab, setTab] = useState<'roster' | 'hiring'>('roster');
  const [roleFilter, setRoleFilter] = useState<StaffRole | 'all'>('all');

  // --- Hiring panel state ---
  const [hireRole, setHireRole] = useState<StaffRole>('first-officer');
  const [hireRating, setHireRating] = useState<string>('unrated'); // 'unrated' or a fleet aircraft type id
  const [reducedWageMonths, setReducedWageMonths] = useState<number>(6);
  const [candidates, setCandidates] = useState<StaffMember[] | null>(null);

  // --- Confirmation modal state ---
  const [memberToFire, setMemberToFire] = useState<StaffMember | null>(null);
  const [fireResult, setFireResult] = useState<{ success: boolean; message: string } | null>(null);

  if (!airline) return null;

  const staff = airline.staff ?? [];
  const fleet = airline.fleet ?? [];
  const currency = settings.currencyFormat;
  const monthlyPayroll = staff.reduce((sum, m) => sum + m.salary, 0);

  // Live crew plan: who is assigned where + manning per type + engineer shortfall.
  const crewPlan = computeCrewPlan(staff, fleet);

  // Distinct aircraft types in the fleet — the only sensible type-rating targets.
  const fleetTypeIds = [...new Set(fleet.map((a) => a.typeId))];

  const visibleStaff = roleFilter === 'all' ? staff : staff.filter((m) => m.role === roleFilter);

  const run = (result: { success: boolean; message: string }, title: string) => {
    addNotification({
      type: result.success ? 'success' : 'error',
      title,
      message: result.message,
    });
    return result;
  };

  const generateCandidates = () => {
    const opts =
      isPilotRole(hireRole)
        ? {
            typeRating: hireRating === 'unrated' ? null : hireRating,
            reducedWageMonths: hireRating === 'unrated' ? reducedWageMonths : 0,
          }
        : {};
    setCandidates(generateHiringShortlist(hireRole, 3, opts, new Date(currentDate)));
  };

  const handleHire = (candidate: StaffMember) => {
    const result = hireStaff({
      name: candidate.name,
      gender: candidate.gender,
      photo: candidate.photo,
      role: candidate.role,
      experience: candidate.experience,
      salary: candidate.salary,
      performance: candidate.performance,
      assignedAircraft: null,
      assignedRoute: null,
      morale: candidate.morale,
      flightHours: candidate.flightHours,
      typeRating: candidate.typeRating,
      reducedWageUntil: candidate.reducedWageUntil,
    });
    if (result.success) {
      const idx = candidates?.findIndex((c) => c.id === candidate.id);
      if (candidates && idx !== undefined && idx >= 0) {
        setCandidates(candidates.filter((_, i) => i !== idx));
      }
    }
    run(result, result.success ? 'Hired' : 'Hiring Failed');
  };

  const handlePromote = (member: StaffMember) => {
    const result = promoteStaff(member.id);
    run(result, result.success ? 'Promotion' : 'Promotion Failed');
  };

  const handleConvert = (member: StaffMember, typeId: string) => {
    const result = convertTypeRating(member.id, typeId);
    run(result, result.success ? 'Type rating acquired' : 'Type rating failed');
  };

  const confirmFire = () => {
    if (!memberToFire) return;
    const result = fireStaff(memberToFire.id);
    setFireResult(result);
  };

  const closeFireModal = () => {
    setMemberToFire(null);
    setFireResult(null);
  };

  return (
    <div className="h-full overflow-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Staff</h1>
          <p className="text-sm text-runway-400">
            {formatNumber(staff.length)} on payroll · {formatCurrency(monthlyPayroll, currency)} / month
          </p>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {(['roster', 'hiring'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all capitalize ${
                tab === t ? 'bg-sky-500/20 text-sky-400' : 'text-runway-400 hover:text-white hover:bg-white/5'
              }`}
            >
              {t === 'roster' ? 'Roster' : 'Hiring'}
            </button>
          ))}
        </div>
      </div>

      {/* Crew manning summary: per-type manning + engineers */}
      {Object.keys(crewPlan.manningByType).length > 0 && (
        <div className="flex flex-wrap gap-2">
          {Object.values(crewPlan.manningByType).map((m) => {
            const type = getAircraftById(m.typeId);
            return (
              <div
                key={m.typeId}
                title={`${m.fullyMannedAircraft} of ${m.usableAircraft} usable ${
                  type?.name ?? m.typeId
                } airframe${m.usableAircraft === 1 ? '' : 's'} with a complete crew · ${m.maned.captain}/
                  ${m.required.captain} captains, ${m.maned.firstOfficer}/${m.required.firstOfficer} FOs, ${
                  m.maned.purser
                }/${m.required.purser} pursers, ${m.maned.cabinCrew}/${m.required.cabinCrew} cabin crew`}
                className={`glass-panel px-3 py-2 min-w-[180px] ${
                  m.coverageFactor < 1 ? 'border border-amber-500/30' : ''
                }`}
              >
                <div className="flex items-center gap-1.5 text-xs font-medium text-white mb-1">
                  <Plane className="w-3.5 h-3.5 text-runway-400" />
                  {type?.name ?? m.typeId}
                </div>
                <MeterBar value={m.coverageFactor} />
                <p className="text-[11px] text-runway-500 mt-1">
                  {m.fullyMannedAircraft}/{m.usableAircraft} fully crewed
                </p>
              </div>
            );
          })}
          <div
            title={`Fleet-wide you need ${crewPlan.engineerRequired} engineer${
              crewPlan.engineerRequired === 1 ? '' : 's'
            } (1 per 5 aircraft); a shortfall raises maintenance costs by up to 50%.`}
            className={`glass-panel px-3 py-2 min-w-[150px] ${
              crewPlan.engineerShortfall > 0 ? 'border border-amber-500/30' : ''
            }`}
          >
            <div className="flex items-center gap-1.5 text-xs font-medium text-white mb-1">
              <Wrench className="w-3.5 h-3.5 text-runway-400" />
              Engineers
            </div>
            <MeterBar value={crewPlan.engineerRequired === 0 ? 1 : crewPlan.engineerHired / crewPlan.engineerRequired} />
            <p className="text-[11px] text-runway-500 mt-1">
              {crewPlan.engineerHired}/{crewPlan.engineerRequired} required
              {crewPlan.engineerShortfall > 0 && (
                <span className="text-amber-300">
                  {' '}
                  · {crewPlan.engineerShortfall} short → +{Math.min(50, crewPlan.engineerShortfall * 10)}% maintenance
                </span>
              )}
            </p>
          </div>
        </div>
      )}

      {/* ================= ROSTER TAB ================= */}
      {tab === 'roster' && (
        <>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {ROSTER_FILTERS.map((r) => (
              <button
                key={r.id}
                onClick={() => setRoleFilter(r.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                  roleFilter === r.id ? 'bg-sky-500/20 text-sky-400' : 'text-runway-400 hover:text-white hover:bg-white/5'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>

          {visibleStaff.length === 0 ? (
            <div className="glass-panel p-12 flex flex-col items-center justify-center text-center">
              <Users className="w-10 h-10 text-runway-500 mb-3" />
              <p className="text-white font-medium mb-1">
                {roleFilter === 'all' ? 'No staff yet' : `No ${ROSTER_FILTERS.find((f) => f.id === roleFilter)?.label.toLowerCase()}s yet`}
              </p>
              <p className="text-sm text-runway-400 mb-4">Head to the Hiring tab to recruit your first crew.</p>
              <button onClick={() => setTab('hiring')} className="btn-primary flex items-center gap-2">
                <UserPlus className="w-4 h-4" />
                Open Hiring
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
              {visibleStaff.map((m) => {
                const assigned = fleet.find((a) => a.id === m.assignedAircraft) ?? null;
                const ratingType = m.typeRating ? getAircraftById(m.typeRating) : null;
                const eligibility = getPromotionEligibility(m);
                const market = candidateMarketSalary(m);
                const underpaid = m.salary < market * 0.95;
                const conversionOptions = isPilotRole(m.role) ? fleetTypeIds.filter((t) => t !== m.typeRating) : [];

                return (
                  <div key={m.id} className="glass-panel p-4 space-y-2.5">
                    {/* Name + role */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <StaffAvatar member={m} />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-white truncate">{m.name}</p>
                          <p className="text-xs text-runway-400">
                            {ROLE_LABELS[m.role]}
                            {isPilotRole(m.role) && ` · ${formatNumber(m.flightHours)} hrs`}
                            {!isPilotRole(m.role) && ` · ${m.experience} yrs exp`}
                          </p>
                        </div>
                      </div>
                      <StatusPill
                        tone={assigned ? 'green' : 'amber'}
                        title={assigned ? `Assigned to ${assigned.registration}` : 'Unassigned — no slot for this member right now'}
                      >
                        <Plane className="w-3 h-3" />
                        {assigned ? assigned.registration : 'Unassigned'}
                      </StatusPill>
                    </div>

                    {/* Rating + reduced wage */}
                    {isPilotRole(m.role) && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        {ratingType ? (
                          <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-sky-500/10 border border-sky-500/20 text-sky-300">
                            <Shield className="w-3 h-3" />
                            {ratingType.name}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-300">
                            <Shield className="w-3 h-3" />
                            Unrated
                          </span>
                        )}
                        {m.reducedWageUntil !== null && m.reducedWageUntil > currentDate.getTime() && (
                          <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-red-500/10 border border-red-500/20 text-red-300">
                            <DollarSign className="w-3 h-3" />
                            Reduced wage · {Math.round(REDUCED_WAGE_MULTIPLIER * 100)}% market
                          </span>
                        )}
                      </div>
                    )}

                    {/* Metrics */}
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                      <div>
                        <div className="flex justify-between text-[11px] text-runway-500 mb-0.5">
                          <span>Morale</span>
                          <span>{Math.round(m.morale)}</span>
                        </div>
                        <MeterBar value={m.morale / 100} height="h-1" />
                      </div>
                      <div>
                        <div className="flex justify-between text-[11px] text-runway-500 mb-0.5">
                          <span>Performance</span>
                          <span>{m.performance}</span>
                        </div>
                        <MeterBar value={m.performance / 100} height="h-1" />
                      </div>
                      <p className="text-runway-400 col-span-2">
                        <span className="inline-flex items-center gap-1">
                          <DollarSign className="w-3 h-3" />
                          {formatCurrency(m.salary, currency)}/mo
                          {underpaid && m.reducedWageUntil === null && (
                            <span className="text-amber-300" title={`Market wage: ${formatCurrency(market, currency)}/mo`}>
                              (below market: {formatCurrency(market, currency)})
                            </span>
                          )}
                        </span>
                      </p>
                    </div>

                    {/* Actions */}
                    <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-white/5">
                      {eligibility && (
                        <button
                          onClick={() => handlePromote(m)}
                          disabled={!eligibility.eligible}
                          title={
                            eligibility.eligible
                              ? `Promote to ${ROLE_LABELS[eligibility.newRole]} for ${formatCurrency(eligibility.cost, currency)}`
                              : `Not eligible: ${eligibility.reasons.join('; ')}`
                          }
                          className="btn-secondary flex items-center gap-1.5 text-xs px-2.5 py-1 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <TrendingUp className="w-3 h-3" />
                          Promote
                        </button>
                      )}
                      {conversionOptions.length > 0 && (
                        <select
                          className="text-[11px] bg-runway-800/60 text-runway-300 rounded-md px-2 py-1 border border-white/10 max-w-[180px]"
                          value=""
                          onChange={(e) => {
                            if (e.target.value) handleConvert(m, e.target.value);
                          }}
                          title="Re-rate this pilot on another fleet type (one-time fee, replaces the current rating)"
                        >
                          <option value="">Convert type rating…</option>
                          {conversionOptions.map((t) => (
                            <option key={t} value={t}>
                              {describeTypeConversionCost(t)}
                            </option>
                          ))}
                        </select>
                      )}
                      <button
                        onClick={() => {
                          setFireResult(null);
                          setMemberToFire(m);
                        }}
                        className="btn-danger flex items-center gap-1.5 text-xs px-2.5 py-1 ml-auto"
                        title={`Severance: one month's salary (${formatCurrency(m.salary, currency)})`}
                      >
                        <X className="w-3 h-3" />
                        Let go
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
      {/* ================= HIRING TAB ================= */}
      {tab === 'hiring' && (
        <div className="space-y-5">
          {/* Role + rating options */}
          <div className="glass-panel p-4 space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <label className="text-xs text-runway-400">Role</label>
              <select
                value={hireRole}
                onChange={(e) => setHireRole(e.target.value as StaffRole)}
                className="text-sm bg-runway-800/60 text-white rounded-md px-3 py-1.5 border border-white/10"
              >
                {HIRABLE_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </select>

              {isPilotRole(hireRole) && (
                <>
                  <label className="text-xs text-runway-400 ml-4">Type rating</label>
                  <select
                    value={hireRating}
                    onChange={(e) => setHireRating(e.target.value)}
                    className="text-sm bg-runway-800/60 text-white rounded-md px-3 py-1.5 border border-white/10"
                  >
                    <option value="unrated">Unrated (reduced wage)</option>
                    {fleetTypeIds.map((t) => (
                      <option key={t} value={t}>
                        Rated: {getAircraftById(t)?.name ?? t}
                      </option>
                    ))}
                  </select>

                  {hireRating === 'unrated' && (
                    <>
                      <label className="text-xs text-runway-400 ml-4">Reduced-wage period</label>
                      <select
                        value={reducedWageMonths}
                        onChange={(e) => setReducedWageMonths(Number(e.target.value))}
                        className="text-sm bg-runway-800/60 text-white rounded-md px-3 py-1.5 border border-white/10"
                      >
                        {REDUCED_WAGE_OPTIONS.map((mo) => (
                          <option key={mo} value={mo}>
                            {mo} months at {Math.round(REDUCED_WAGE_MULTIPLIER * 100)}% market
                          </option>
                        ))}
                      </select>
                    </>
                  )}
                </>
              )}

              <button onClick={generateCandidates} className="btn-primary flex items-center gap-2 ml-auto">
                <RefreshCw className="w-4 h-4" />
                {candidates ? 'New Candidates' : 'Generate Candidates'}
              </button>
            </div>
            {isPilotRole(hireRole) && hireRating === 'unrated' && (
              <p className="text-[11px] text-runway-500">
                Unrated pilots still fly, but at {Math.round(REDUCED_WAGE_MULTIPLIER * 100)}% market wage for the chosen
                period — you save money now and pay the one-time conversion fee later when you re-rate them.
              </p>
            )}
            {fleetTypeIds.length === 0 && isPilotRole(hireRole) && (
              <p className="text-[11px] text-amber-300">
                You don't own any aircraft — rated candidates aren't available until your fleet has a type to rate on.
              </p>
            )}
          </div>

          {/* Candidates */}
          {candidates === null ? (
            <div className="glass-panel p-12 flex flex-col items-center justify-center text-center">
              <UserPlus className="w-10 h-10 text-runway-500 mb-3" />
              <p className="text-white font-medium mb-1">No candidates yet</p>
              <p className="text-sm text-runway-400">Pick a role and generate a shortlist of three candidates.</p>
            </div>
          ) : candidates.length === 0 ? (
            <div className="glass-panel p-8 text-center">
              <p className="text-sm text-runway-400">Shortlist exhausted — generate more candidates.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
              {candidates.map((c) => {
                const market = candidateMarketSalary(c);
                return (
                  <div key={c.id} className="glass-panel p-4 space-y-2.5">
                    <div className="flex items-center gap-2.5">
                      <StaffAvatar member={c} />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-white truncate">{c.name}</p>
                        <p className="text-xs text-runway-400">
                          {ROLE_LABELS[c.role]}
                          {isPilotRole(c.role) && ` · ${formatNumber(c.flightHours)} flight hours`}
                          {!isPilotRole(c.role) && ` · ${c.experience} years experience`}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {isPilotRole(c.role) &&
                        (c.typeRating ? (
                          <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-sky-500/10 border border-sky-500/20 text-sky-300">
                            <Shield className="w-3 h-3" />
                            {getAircraftById(c.typeRating)?.name ?? c.typeRating}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-300">
                            <Shield className="w-3 h-3" />
                            Unrated
                          </span>
                        ))}
                      <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-runway-300">
                        <Activity className="w-3 h-3" />
                        {c.performance} perf
                      </span>
                    </div>
                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between text-runway-400">
                        <span>Morale</span>
                        <span>{c.morale}</span>
                      </div>
                      <MeterBar value={c.morale / 100} height="h-1" />
                      <div className="flex justify-between pt-1">
                        <span className="text-runway-400">Monthly salary</span>
                        <span className="text-white font-medium">
                          {formatCurrency(c.salary, currency)}
                          {c.salary < market && (
                            <span className="text-[10px] text-runway-500 ml-1">
                              (market: {formatCurrency(market, currency)})
                            </span>
                          )}
                        </span>
                      </div>
                    </div>
                    <button onClick={() => handleHire(c)} className="btn-primary w-full flex items-center justify-center gap-2 text-xs">
                      <UserPlus className="w-3.5 h-3.5" />
                      Hire
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ================= FIRE CONFIRMATION MODAL ================= */}
      <AnimatePresence>
        {memberToFire && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm"
            onClick={fireResult ? closeFireModal : undefined}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="glass-panel w-full max-w-md p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-lg bg-red-500/10 flex items-center justify-center">
                  <X className="w-5 h-5 text-red-400" />
                </div>
                <h2 className="text-lg font-bold text-white">
                  {fireResult ? 'Action Complete' : `Let ${memberToFire.name.split(' ')[0]} go?`}
                </h2>
              </div>

              {fireResult && (
                <div
                  className={`rounded-lg p-4 mb-6 text-sm ${
                    fireResult.success
                      ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300'
                      : 'bg-red-500/10 border border-red-500/30 text-red-300'
                  }`}
                >
                  <p>{fireResult.message}</p>
                </div>
              )}

              {!fireResult && (
                <>
                  <p className="text-sm text-runway-400 mb-4">
                    {memberToFire.name} ({ROLE_LABELS[memberToFire.role]}) will be let go immediately. Severance of one
                    month's salary ({formatCurrency(memberToFire.salary, currency)}) is deducted from your cash.
                  </p>
                  <div className="flex justify-end gap-2 mt-6">
                    <button onClick={closeFireModal} className="btn-secondary text-xs">
                      Cancel
                    </button>
                    <button onClick={confirmFire} className="btn-danger text-xs">
                      Confirm
                    </button>
                  </div>
                </>
              )}

              {fireResult && (
                <div className="flex justify-end mt-6">
                  <button onClick={closeFireModal} className="btn-secondary text-xs">
                    Close
                  </button>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default StaffScreen;
