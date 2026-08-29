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
import {
  computeCrewPlan,
  computeStaffingStatus,
  computeTypeCrewRequirements,
  isUsableAircraft,
  type AircraftCrewManning,
  type TypeCrewRequirement,
} from '@/utils/crewDispatcher';
import {
  isFlyingCrewRole,
  isOnMandatoryRest,
  sustainableWeeklyFlightHours,
} from '@/utils/crewRegulations';
import { MeterBar, StatusPill } from '@/components/icons/StatusIcons';
import { StaffAvatar } from '@/components/StaffAvatar';
import StaffDetailModal from '@/components/StaffDetailModal';
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
  Moon,
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

/**
 * Pilot roles shown on the per-type manning cards. Pilots are the only
 * type-specific crew — pursers and cabin crew are pooled fleet-wide (they can
 * fly any type) and are shown on the shared "Cabin crew" card instead.
 */
const MANNING_ROLES: Array<{
  key: 'captain' | 'firstOfficer';
  short: string;
  full: string;
}> = [
  { key: 'captain', short: 'Capt', full: 'Captain' },
  { key: 'firstOfficer', short: 'FO', full: 'First Officer' },
];

/**
 * Per-pilot-role manning rows for a type card: route-workload-sized needed
 * (rotating crew sets × per-airframe minimum) vs actually assigned. Returns
 * [] when the type has no active routes — no crew required yet.
 */
function manningRoleRows(m: AircraftCrewManning, routeReq?: TypeCrewRequirement) {
  if (!routeReq) return [];
  return MANNING_ROLES.map((r) => ({
    ...r,
    needed: routeReq[r.key],
    have: m.maned[r.key],
  })).filter((r) => r.needed > 0 || r.have > 0);
}

/** Market salary preview for a candidate (used to label hiring cards). */
function candidateMarketSalary(m: StaffMember): number {
  return isPilotRole(m.role) ? pilotMarketSalary(m.role, m.flightHours) : nonPilotMarketSalary(m.role, m.experience);
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

  // --- Detail modal state (set by clicking a roster card header) ---
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);

  if (!airline) return null;

  const staff = airline.staff ?? [];
  const fleet = airline.fleet ?? [];
  const currency = settings.currencyFormat;
  const monthlyPayroll = staff.reduce((sum, m) => sum + m.salary, 0);
  const selectedMember = staff.find((m) => m.id === selectedMemberId) ?? null;

  // Live crew plan: who is assigned where + manning per type + engineer shortfall.
  const crewPlan = computeCrewPlan(staff, fleet, airline.routes ?? []);

  // Workload-sized crew requirements per type (EU-OSL rotation sets) + how
  // under/over-staffed each department is vs that workload.
  const typeReqs = computeTypeCrewRequirements(airline.routes);
  const staffingStatus = computeStaffingStatus(airline.routes, staff, fleet);
  const pilotBreakdown = staffingStatus.find((d) => d.key === 'pilots')?.pilotBreakdown ?? [];
  const cabinDetail = staffingStatus.find((d) => d.key === 'cabin')?.cabinDetail;
  const engineersRow = staffingStatus.find((d) => d.key === 'engineers');
  const unratedPilots = staff.filter(
    (m) => (m.role === 'captain' || m.role === 'first-officer') && m.typeRating === null
  ).length;
  // Analytical hiring requirement: exactly how many are still missing, per type
  // rating (pilots) and per role (pursers, cabin crew, engineers).
  const requiredList: string[] = [];
  for (const b of pilotBreakdown) {
    const typeName = getAircraftById(b.typeId)?.name ?? b.typeId;
    if (b.missingCaptains > 0) requiredList.push(`${b.missingCaptains} ${typeName}-rated captains`);
    if (b.missingFirstOfficers > 0)
      requiredList.push(`${b.missingFirstOfficers} ${typeName}-rated first officers`);
  }
  if (cabinDetail) {
    if (cabinDetail.purser.missing > 0) requiredList.push(`${cabinDetail.purser.missing} pursers`);
    if (cabinDetail.cabinCrew.missing > 0)
      requiredList.push(`${cabinDetail.cabinCrew.missing} cabin crew`);
  }
  if (engineersRow && engineersRow.missing > 0)
    requiredList.push(`${engineersRow.missing} engineer${engineersRow.missing === 1 ? '' : 's'}`);

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
      age: candidate.age,
      bio: candidate.bio,
      languages: candidate.languages,
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

      {/* Staffing status: how under/over-staffed each department is vs the route workload */}
      <div className="glass-panel p-4">
        <div className="flex items-center justify-between gap-2 mb-3">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <Users className="w-4 h-4 text-runway-400" />
            Staffing status
          </h2>
          <p className="text-[10px] text-runway-500 text-right">
            Required = route workload ÷ {sustainableWeeklyFlightHours().toFixed(1)} sustainable flight h per person
            per week (EU-OSL), capped by your usable airframes — grounded types need no crew
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {staffingStatus.map((d) => (
            <div key={d.key} className="rounded-lg border border-white/10 bg-white/5 p-3">
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <span className="text-xs font-medium text-white">{d.label}</span>
                {d.delta < 0 ? (
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded border bg-red-500/10 border-red-500/30 text-red-300">
                    Understaffed by {Math.abs(d.delta)}
                  </span>
                ) : d.delta > 0 ? (
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded border bg-amber-500/10 border-amber-500/30 text-amber-300">
                    Overstaffed by {d.delta}
                  </span>
                ) : (
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded border bg-green-500/10 border-green-500/20 text-green-300">
                    Fully staffed
                  </span>
                )}
              </div>
              <MeterBar value={d.required === 0 ? 1 : Math.min(1, d.available / d.required)} />
              <p className="text-[11px] text-runway-500 mt-1">{d.available}/{d.required} required</p>
            </div>
          ))}
        </div>
        {/* Analytical requirement: exactly how many are still missing per type rating / role */}
        <div className="mt-3 pt-3 border-t border-white/10">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-runway-500 mb-1.5">
            Required (still missing)
          </p>
          {requiredList.length > 0 ? (
            <ul className="flex flex-col gap-0.5">
              {requiredList.map((item) => (
                <li key={item} className="text-[11px] font-semibold text-red-300">
                  ▸ {item} needed
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[11px] text-green-300">
              No hiring shortages — all departments are fully staffed.
            </p>
          )}
        </div>
        {pilotBreakdown.length > 0 && (
          <div className="mt-3 pt-3 border-t border-white/10">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-runway-500 mb-1.5">
              Pilot requirement by type rating
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
              {pilotBreakdown.map((b) => {
                const typeName = getAircraftById(b.typeId)?.name ?? b.typeId;
                const rated = b.ratedCaptains + b.ratedFirstOfficers;
                const need = b.captain + b.firstOfficer;
                const ok = rated >= need;
                return (
                  <div
                    key={b.typeId}
                    title={`${b.sets} rotating crew set${b.sets === 1 ? '' : 's'}: ${b.captain} captains + ${b.firstOfficer} first officers rated for ${typeName} · ${b.ratedCaptains} captains + ${b.ratedFirstOfficers} first officers currently hold the rating (unrated pilots can be converted)`}
                    className={`flex items-center justify-between gap-2 text-[11px] rounded px-2 py-1.5 ${
                      ok ? 'bg-white/5' : 'bg-amber-500/10 border border-amber-500/20'
                    }`}
                  >
                    <span className="text-white font-medium">{typeName}</span>
                    <span className={`tabular-nums whitespace-nowrap ${ok ? 'text-runway-400' : 'text-amber-300 font-semibold'}`}>
                      {b.captain}× Capt + {b.firstOfficer}× FO · {rated}/{need} rated
                    </span>
                  </div>
                );
              })}
            </div>
            {unratedPilots > 0 && (
              <p className="text-[10px] text-runway-500 mt-1.5">
                {unratedPilots} unrated pilot{unratedPilots === 1 ? '' : 's'} on payroll — can be rated for any
                type via a paid type conversion.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Crew manning summary: per-type manning + engineers */}
      {Object.keys(crewPlan.manningByType).length > 0 && (
        <div className="flex flex-wrap gap-2">
          {Object.values(crewPlan.manningByType).map((m) => {
            const type = getAircraftById(m.typeId);
            const typeReq = typeReqs[m.typeId];
            const rows = manningRoleRows(m, typeReq);
            return (
              <div
                key={m.typeId}
                title={`${m.fullyMannedAircraft} of ${m.usableAircraft} usable ${
                  type?.name ?? m.typeId
                } airframe${m.usableAircraft === 1 ? '' : 's'} with a complete pilot crew · pilots are
                  type-specific; pursers and cabin crew are shared fleet-wide and can fly any type${
                  typeReq
                    ? ` · needed is workload-sized: ${typeReq.weeklyHours.toFixed(0)} cycle-h/week ÷ ${sustainableWeeklyFlightHours().toFixed(1)} h per person → ${typeReq.sets} rotating crew set${typeReq.sets === 1 ? '' : 's'}`
                    : ''
                }`}
                className={`glass-panel px-3 py-2 min-w-[230px] ${
                  m.coverageFactor < 1 ? 'border border-amber-500/30' : ''
                }`}
              >
                <div className="flex items-center gap-1.5 text-xs font-medium text-white mb-1">
                  <Plane className="w-3.5 h-3.5 text-runway-400" />
                  {type?.name ?? m.typeId}
                  <span className="text-[10px] font-normal text-runway-500">
                    × {m.usableAircraft} airframe{m.usableAircraft === 1 ? '' : 's'}
                  </span>
                </div>
                <MeterBar value={m.coverageFactor} />
                {rows.length > 0 ? (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {rows.map((r) => (
                      <span
                        key={r.key}
                        title={`${r.full}s: ${r.have} assigned of ${r.needed} needed`}
                        className={`text-[10px] px-1.5 py-0.5 rounded border ${
                          r.have >= r.needed
                            ? 'bg-green-500/10 border-green-500/20 text-green-300'
                            : 'bg-amber-500/10 border-amber-500/30 text-amber-300 font-semibold'
                        }`}
                      >
                        {r.short} {r.have}/{r.needed}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-runway-500 mt-1.5">No active routes for this type yet</p>
                )}
                <p className="text-[11px] text-runway-500 mt-1">
                  {m.fullyMannedAircraft}/{m.usableAircraft} with complete pilot crews
                </p>
              </div>
            );
          })}
          <div
            title={`Pursers and cabin crew are not type-specific — one shared pool covers every usable
              airframe. ${crewPlan.cabinPool.available} of ${crewPlan.cabinPool.required} required seats
              are filled; a shortfall scales all passenger types down proportionally.`}
            className={`glass-panel px-3 py-2 min-w-[150px] ${
              crewPlan.cabinPool.coverageFactor < 1 ? 'border border-amber-500/30' : ''
            }`}
          >
            <div className="flex items-center gap-1.5 text-xs font-medium text-white mb-1">
              <Users className="w-3.5 h-3.5 text-runway-400" />
              Cabin crew
              <span className="text-[10px] font-normal text-runway-500">· any type</span>
            </div>
            <MeterBar value={crewPlan.cabinPool.coverageFactor} />
            <div className="flex flex-wrap gap-1 mt-1.5">
              <span
                title={`Pursers: ${crewPlan.cabinPool.purserAvailable} assigned of ${crewPlan.cabinPool.purserRequired} needed`}
                className={`text-[10px] px-1.5 py-0.5 rounded border ${
                  crewPlan.cabinPool.purserAvailable >= crewPlan.cabinPool.purserRequired
                    ? 'bg-green-500/10 border-green-500/20 text-green-300'
                    : 'bg-amber-500/10 border-amber-500/30 text-amber-300 font-semibold'
                }`}
              >
                Purser {crewPlan.cabinPool.purserAvailable}/{crewPlan.cabinPool.purserRequired}
              </span>
              <span
                title={`Cabin crew: ${crewPlan.cabinPool.cabinCrewAvailable} assigned of ${crewPlan.cabinPool.cabinCrewRequired} needed`}
                className={`text-[10px] px-1.5 py-0.5 rounded border ${
                  crewPlan.cabinPool.cabinCrewAvailable >= crewPlan.cabinPool.cabinCrewRequired
                    ? 'bg-green-500/10 border-green-500/20 text-green-300'
                    : 'bg-amber-500/10 border-amber-500/30 text-amber-300 font-semibold'
                }`}
              >
                Cabin {crewPlan.cabinPool.cabinCrewAvailable}/{crewPlan.cabinPool.cabinCrewRequired}
              </span>
            </div>
          </div>
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3">
              {visibleStaff.map((m) => {
                const assigned = fleet.find((a) => a.id === m.assignedAircraft) ?? null;
                const assignedType = assigned ? getAircraftById(assigned.typeId) ?? null : null;
                const poolSize = assigned
                  ? fleet.filter((a) => a.typeId === assigned.typeId && isUsableAircraft(a)).length
                  : 0;
                const onMandatoryRest = isFlyingCrewRole(m.role) && isOnMandatoryRest(m);
                const poolTitle = assigned
                  ? `${assignedType?.manufacturer ?? ''} ${assignedType?.name ?? assigned.typeId} crew pool — ${
                      poolSize
                    } usable airframe${poolSize === 1 ? '' : 's'}. ${
                      isPilotRole(m.role)
                        ? 'Pilots interchange freely between same-type aircraft; the dispatcher picks the exact tail.'
                        : 'Cabin crew are not type-specific — rostered to this pool this week, but they can fly any type.'
                    }${
                      isPilotRole(m.role)
                        ? m.typeRating === assigned.typeId
                          ? ` ${m.name.split(' ')[0]} is type rated for ${
                              assignedType?.name ?? assigned.typeId
                            } and can fly any airframe in the pool.`
                          : m.typeRating === null
                            ? ` ${m.name.split(' ')[0]} has no type rating for ${
                                assignedType?.name ?? assigned.typeId
                              } yet — unrated pilots still fly, at reduced wage until re-rated.`
                            : ''
                        : ''
                    }`
                  : onMandatoryRest
                    ? 'On mandatory rest — a rolling EU-OSL flight/duty limit is exhausted, so this member cannot be assigned to flights until enough weeks pass.'
                    : isPilotRole(m.role)
                      ? 'Unassigned — no slot on a fleet they can fly right now.'
                      : 'Unassigned — surplus for now: every needed cabin-crew seat is filled. Cabin crew can fly any type, so the dispatcher seats them as soon as a slot opens.';
                const ratingType = m.typeRating ? getAircraftById(m.typeRating) : null;
                const eligibility = getPromotionEligibility(m);
                const market = candidateMarketSalary(m);
                const underpaid = m.salary < market * 0.95;
                const conversionOptions = isPilotRole(m.role) ? fleetTypeIds.filter((t) => t !== m.typeRating) : [];
                const restBadge = onMandatoryRest ? (
                  <span
                    className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-red-500/15 border border-red-500/30 text-red-300"
                    title="A rolling flight/duty-time limit is exhausted. This crew member is on mandatory rest and cannot be assigned to flights until enough weeks pass."
                  >
                    <Moon className="w-3 h-3" />
                    Mandatory rest
                  </span>
                ) : null;

                return (
                  <div key={m.id} className="glass-panel p-3 space-y-2">
                    {/* Name + role */}
                    <div className="flex items-center justify-between gap-2">
                      <div
                        className="flex items-center gap-2 min-w-0 cursor-pointer select-none"
                        onClick={() => setSelectedMemberId(m.id)}
                        title="View profile (details, HR data & weekly roster)"
                      >
                        <StaffAvatar member={m} className="w-8 h-8" />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-white truncate hover:underline">{m.name}</p>
                          <p className="text-xs text-runway-400">
                            {ROLE_LABELS[m.role]}
                            {isFlyingCrewRole(m.role) && ` · ${formatNumber(m.flightHours)} hrs`}
                            {m.role === 'engineer' && ` · ${m.experience} yrs exp`}
                          </p>
                        </div>
                      </div>
                      <StatusPill
                        tone={assigned ? 'green' : 'amber'}
                        title={poolTitle}
                      >
                        <Plane className="w-3 h-3" />
                        {assigned ? `${assignedType?.name ?? assigned.typeId} pool` : 'Unassigned'}
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
                        {restBadge}
                      </div>
                    )}

                    {/* Mandatory rest applies to cabin crew and pursers too — the badge row above only renders for pilots */}
                    {!isPilotRole(m.role) && restBadge && (
                      <div className="flex flex-wrap items-center gap-1.5">{restBadge}</div>
                    )}

                    {/* Metrics — crew-time limit bars live in the detail modal only */}
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
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
                      <p className="text-[11px] text-runway-400 col-span-2">
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
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
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

      {/* ================= STAFF DETAIL MODAL ================= */}
      <AnimatePresence>
        {selectedMember && (
          <StaffDetailModal
            member={selectedMember}
            fleet={fleet}
            routes={airline.routes ?? []}
            currentDate={currentDate}
            currency={currency}
            onClose={() => setSelectedMemberId(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

export default StaffScreen;
