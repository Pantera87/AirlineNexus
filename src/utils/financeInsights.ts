// ============================================================
// Finance Insights — pure analysis for the Finances screen
// ------------------------------------------------------------
// Re-derives live route economics (via the same routeEngine preview
// functions the weekly settlement uses) to split expenses into
// categories, projects cash 1-3 months ahead, and emits rule-based
// finance tips. Everything here is a pure function of the current
// Airline + WorldState — no store state is read or mutated.
// ============================================================

import type { Airline, Airport, Route, WorldState } from '@/types/game';
import { AIRPORT_DATABASE } from '@/data/airports';
import {
  findAircraftById,
  getAircraftWeeklyFixedCosts,
  getRoutePath,
  previewLoopEconomics,
  previewRouteEconomics,
} from '@/utils/routeEngine';
import { computeCrewPlan } from '@/utils/crewDispatcher';
import { formatCurrency } from '@/utils/helpers';

export type Currency = 'USD' | 'EUR' | 'GBP';

/** Average number of weeks in a month (52 weeks / 12 months). */
export const WEEKS_PER_MONTH = 52 / 12;

/** Resolve a route's full loop path (HUB → stops… → DEST) to airport objects, or null if any IATA is unknown. */
function resolveRoutePathAirports(route: Route): Airport[] | null {
  const airports = getRoutePath(route).map((iata) => AIRPORT_DATABASE.find((a) => a.iata === iata));
  return airports.every((a) => !!a) ? (airports as Airport[]) : null;
}

// ============================================================
// Expense breakdown
// ============================================================

export interface ExpenseCategory {
  key: 'fuel' | 'crew' | 'airport-fees' | 'fleet-fixed' | 'payroll' | 'loans';
  label: string;
  weeklyAmount: number;
  monthlyAmount: number;
  color: string;
}

export interface ExpenseBreakdown {
  categories: ExpenseCategory[];
  totalWeekly: number;
  totalMonthly: number;
}

const CATEGORY_META: Record<ExpenseCategory['key'], { label: string; color: string }> = {
  fuel: { label: 'Fuel', color: '#f59e0b' },
  'airport-fees': { label: 'Airport & landing fees', color: '#a78bfa' },
  crew: { label: 'Crew & cabin ops', color: '#38bdf8' },
  'fleet-fixed': { label: 'Fleet fixed costs', color: '#f472b6' },
  payroll: { label: 'Staff payroll', color: '#2dd4bf' },
  loans: { label: 'Loan servicing', color: '#fb7185' },
};

/**
 * Splits the airline's running expenses into categories:
 * - Route operations (fuel / airport fees / crew-cabin) are re-derived per active route
 *   with the same preview functions the weekly plan uses, then scaled so the sum of
 *   the route-level categories matches the stored (utilization-adjusted) route.cost.
 * - Fleet fixed costs (maintenance + depreciation + insurance per owned aircraft, with
 *   the engineer-shortfall penalty) mirror the weekly settlement.
 * - Payroll and loan servicing are monthly outflows converted to weekly/monthly here
 *   so they can be compared with the operating costs.
 */
export function computeExpenseBreakdown(airline: Airline, world: WorldState): ExpenseBreakdown {
  const fuelPrice = world.fuelPrice;
  const competitionShare = Math.min(
    1,
    (world.competitorAirlines ?? []).reduce((sum, c) => sum + (c.marketShare || 0), 0) / 100
  );
  const reputation = airline.reputation ?? 50;

  const weekly = { fuel: 0, 'airport-fees': 0, crew: 0, 'fleet-fixed': 0, payroll: 0, loans: 0 };

  // --- Route operations: re-derive the engine economics and split into categories ---
  for (const route of airline.routes ?? []) {
    if (!route.isActive || !route.aircraftId) continue;
    const type = findAircraftById(route.aircraftId);
    if (!type) continue;

    const origin = AIRPORT_DATABASE.find((a) => a.iata === route.origin);
    const dest = AIRPORT_DATABASE.find((a) => a.iata === route.destination);
    if (!origin || !dest) continue;

    const path = resolveRoutePathAirports(route);
    const options = { weeksActive: route.weeksActive ?? 0, competitionShare, reputation };
    const economics = path
      ? previewLoopEconomics(path, type, route.frequency, fuelPrice, options)
      : previewRouteEconomics(origin, dest, type, route.frequency, fuelPrice, options);

    // The stored route.cost already includes fleet-availability/crew-coverage scaling —
    // scale the raw category split by the same factor so it lines up with the plan.
    const scale = economics.weeklyCosts > 0 ? Math.max(0, route.cost / economics.weeklyCosts) : 0;
    if (scale === 0) continue;

    const fuel = economics.weeklyFuelCost * scale;
    // Loop model: blended landing/handling fees at every airport once per cycle (same formula as previewLoopEconomics).
    const fees = path ? path.reduce((sum, a) => sum + a.landingFee, 0) * route.frequency * 0.15 * scale : 0;
    const crewAndOther = Math.max(0, economics.weeklyCosts * scale - fuel - fees);

    weekly.fuel += fuel;
    weekly['airport-fees'] += fees;
    weekly.crew += crewAndOther;
  }

  // --- Fleet fixed costs: every owned aircraft, whether it flies or not ---
  const crewPlan = computeCrewPlan(airline.staff ?? [], airline.fleet ?? []);
  const engineerPenalty = 1 + Math.min(0.5, crewPlan.engineerShortfall * 0.1);
  for (const ac of airline.fleet ?? []) {
    const type = findAircraftById(ac.typeId);
    if (type) weekly['fleet-fixed'] += getAircraftWeeklyFixedCosts(type) * engineerPenalty;
  }

  // --- Payroll & loans: monthly outflows converted to weekly/monthly ---
  weekly.payroll = (airline.staff ?? []).reduce((sum, m) => sum + (m.salary || 0), 0) / WEEKS_PER_MONTH;
  weekly.loans = (airline.finances.loans ?? [])
    .filter((loan) => loan.remainingBalance > 0)
    .reduce((sum, loan) => sum + (loan.monthlyPayment || 0), 0) / WEEKS_PER_MONTH;

  const keys: ExpenseCategory['key'][] = ['fuel', 'airport-fees', 'crew', 'fleet-fixed', 'payroll', 'loans'];
  const categories = keys.map((key) => ({
    key,
    label: CATEGORY_META[key].label,
    color: CATEGORY_META[key].color,
    weeklyAmount: Math.round(weekly[key]),
    monthlyAmount: Math.round(weekly[key] * WEEKS_PER_MONTH),
  }));

  return {
    categories,
    totalWeekly: Math.round(categories.reduce((sum, c) => sum + c.weeklyAmount, 0)),
    totalMonthly: Math.round(categories.reduce((sum, c) => sum + c.monthlyAmount, 0)),
  };
}

// ============================================================
// Income breakdown
// ============================================================

export interface IncomeLine {
  routeId: string;
  label: string;
  weeklyAmount: number;
  monthlyAmount: number;
}

export interface IncomeBreakdown {
  lines: IncomeLine[];
  totalWeekly: number;
  totalMonthly: number;
}

/** Per-route ticket revenue (the airline's only income stream). */
export function computeIncomeBreakdown(airline: Airline): IncomeBreakdown {
  const lines: IncomeLine[] = [];
  for (const route of airline.routes ?? []) {
    if (!route.isActive) continue;
    lines.push({
      routeId: route.id,
      label: getRoutePath(route).join('–'),
      weeklyAmount: Math.round(route.revenue || 0),
      monthlyAmount: Math.round((route.revenue || 0) * WEEKS_PER_MONTH),
    });
  }
  lines.sort((a, b) => b.weeklyAmount - a.weeklyAmount);

  const totalWeekly = lines.reduce((sum, l) => sum + l.weeklyAmount, 0);
  return {
    lines,
    totalWeekly,
    totalMonthly: Math.round(totalWeekly * WEEKS_PER_MONTH),
  };
}

// ============================================================
// Economic outlook
// ============================================================

export type OutlookRisk = 'healthy' | 'stable' | 'at-risk' | 'critical';

export interface OutlookPoint {
  label: string;
  cash: number | null;
  forecast: number | null;
}

export interface FinanceOutlook {
  weeklyNet: number; // operating (routes + fleet fixed) weekly net from the plan
  monthlyNet: number; // weekly run-rate × weeks/month − payroll − loan payments
  runwayWeeks: number | null; // weeks of cash left if the current burn continues (null when not burning)
  risk: OutlookRisk;
  projections: { monthsAhead: number; cash: number }[]; // 1/2/3-month linear projections
  fuelTrendPct: number; // % change in fuel price over the last ~4 weeks
  economicIndex: number;
  travelDemand: number;
  series: OutlookPoint[]; // history (cash) + dashed forecast tail for the projection chart
}

/**
 * Linear run-rate projection: the current weekly plan's operating net is scaled to a
 * month, payroll and loan servicing are subtracted, and the result is extrapolated 1-3
 * months ahead. Risk tiers combine cash level, cash runway and the monthly net flow.
 */
export function computeOutlook(airline: Airline, world: WorldState): FinanceOutlook {
  const plan = airline.finances.weeklyPlan ?? { revenue: 0, costs: 0 };
  const weeklyNet = plan.revenue - plan.costs;
  const monthlyPayroll = (airline.staff ?? []).reduce((sum, m) => sum + (m.salary || 0), 0);
  const monthlyLoans = (airline.finances.loans ?? [])
    .filter((loan) => loan.remainingBalance > 0)
    .reduce((sum, loan) => sum + (loan.monthlyPayment || 0), 0);
  const monthlyNet = weeklyNet * WEEKS_PER_MONTH - monthlyPayroll - monthlyLoans;

  const cash = airline.finances.cash;
  const weeklyBurn = -monthlyNet / WEEKS_PER_MONTH;
  const runwayWeeks = weeklyBurn > 0 ? Math.max(0, Math.floor(cash / weeklyBurn)) : null;

  let risk: OutlookRisk;
  if (cash < 0 || (runwayWeeks !== null && runwayWeeks < 4)) risk = 'critical';
  else if (runwayWeeks !== null && runwayWeeks < 12) risk = 'at-risk';
  else if (monthlyNet > 0) risk = 'healthy';
  else risk = 'stable';

  const projections = [1, 2, 3].map((monthsAhead) => ({
    monthsAhead,
    cash: Math.round(cash + monthlyNet * monthsAhead),
  }));

  // Fuel trend over the last ~4 weekly points (5 points spanning the window).
  const fuelHistory = world.fuelPriceHistory ?? [];
  let fuelTrendPct = 0;
  if (fuelHistory.length >= 2) {
    const base = fuelHistory[Math.max(0, fuelHistory.length - 5)].price;
    if (base > 0) fuelTrendPct = ((fuelHistory[fuelHistory.length - 1].price - base) / base) * 100;
  }

  // Chart series: weekly finance history followed by the dashed forecast tail. The
  // last actual point carries its cash in BOTH fields so the forecast line connects.
  const series: OutlookPoint[] = (airline.finances.history ?? []).map((p) => ({
    label: new Date(p.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    cash: Math.round(p.cash),
    forecast: null,
  }));
  if (series.length > 0) {
    series[series.length - 1] = { ...series[series.length - 1], forecast: series[series.length - 1].cash! };
  } else {
    series.push({ label: 'Now', cash: Math.round(cash), forecast: Math.round(cash) });
  }
  for (const p of projections) {
    series.push({ label: `+${p.monthsAhead}mo`, cash: null, forecast: p.cash });
  }

  return {
    weeklyNet,
    monthlyNet: Math.round(monthlyNet),
    runwayWeeks,
    risk,
    projections,
    fuelTrendPct,
    economicIndex: world.economicIndex,
    travelDemand: world.travelDemand,
    series,
  };
}

// ============================================================
// Rule-based finance tips
// ============================================================

export type TipSeverity = 'critical' | 'warning' | 'info' | 'positive';

export interface FinanceTip {
  severity: TipSeverity;
  title: string;
  detail: string;
}

const SEVERITY_ORDER: Record<TipSeverity, number> = { critical: 0, warning: 1, info: 2, positive: 3 };

/**
 * Evaluates the airline against a set of finance health rules and returns the
 * most relevant tips, most severe first (capped at 8). Pure — formatting aside,
 * no side effects.
 */
export function computeFinanceTips(
  airline: Airline,
  world: WorldState,
  breakdown: ExpenseBreakdown,
  outlook: FinanceOutlook,
  currency: Currency = 'USD'
): FinanceTip[] {
  const tips: FinanceTip[] = [];
  const fmt = (v: number) => formatCurrency(v, currency, true);
  const cash = airline.finances.cash;

  // --- Cash position ---
  if (cash < 0) {
    tips.push({
      severity: 'critical',
      title: 'Cash balance is negative',
      detail: `You are ${fmt(-cash)} in the red. Sell aircraft, cancel losing routes or take out a loan to avoid insolvency.`,
    });
  } else if (outlook.runwayWeeks !== null && outlook.runwayWeeks < 8) {
    tips.push({
      severity: 'critical',
      title: `Cash runway: about ${outlook.runwayWeeks} week${outlook.runwayWeeks === 1 ? '' : 's'}`,
      detail: `At the current burn of ${fmt(-outlook.monthlyNet / WEEKS_PER_MONTH)}/week you will run out of cash in under two months. Cut costs or raise cash now.`,
    });
  }

  // --- Losing routes ---
  const losingRoutes = (airline.routes ?? []).filter(
    (r) => r.isActive && r.revenue > 0 && r.profitability < 0
  );
  if (losingRoutes.length > 0) {
    const weeklyLoss = losingRoutes.reduce((sum, r) => sum + (-r.profitability), 0);
    const revenue = (airline.finances.weeklyPlan ?? { revenue: 0 }).revenue;
    tips.push({
      severity: revenue > 0 && weeklyLoss / revenue > 0.3 ? 'critical' : 'warning',
      title: `${losingRoutes.length} route${losingRoutes.length === 1 ? '' : 's'} losing money`,
      detail: `${losingRoutes
        .slice(0, 3)
        .map((r) => `${getRoutePath(r).join('–')} (${fmt(-r.profitability)}/wk)`)
        .join(', ')} — consider lowering frequency or cancelling the weakest links (total loss ${fmt(weeklyLoss)}/week).`,
    });
  }

  // --- Underfilled seats ---
  const underfilled = (airline.routes ?? []).filter(
    (r) => r.isActive && (r.weeksActive ?? 0) >= 4 && r.avgLoadFactor > 0 && r.avgLoadFactor < 0.35
  );
  if (underfilled.length > 0) {
    tips.push({
      severity: 'warning',
      title: 'Underfilled seats',
      detail: `${underfilled
        .slice(0, 3)
        .map((r) => `${getRoutePath(r).join('–')} at ${Math.round(r.avgLoadFactor * 100)}%`)
        .join(', ')} — mature routes below 35% load factor rarely turn a profit; reduce frequency or serve them with a smaller aircraft.`,
    });
  }

  // --- Idle aircraft ---
  const idle = (airline.fleet ?? []).filter((a) => a.status !== 'available' && a.status !== 'in-flight');
  if (idle.length > 0) {
    tips.push({
      severity: idle.length >= 2 ? 'warning' : 'info',
      title: `${idle.length} aircraft not flying`,
      detail: `${idle.map((a) => a.registration).join(', ')} sit in ${idle[0].status} while maintenance, depreciation and insurance keep accruing. Sell what you don't need.`,
    });
  }

  // --- Crew coverage ---
  const crewPlan = computeCrewPlan(airline.staff ?? [], airline.fleet ?? []);
  const shortTypes = Object.values(crewPlan.manningByType).filter(
    (m) => m.usableAircraft > 0 && m.coverageFactor < 1
  );
  if (shortTypes.length > 0) {
    tips.push({
      severity: 'warning',
      title: 'Crew shortfall limits operations',
      detail: `${shortTypes
        .map((m) => `${m.typeId} flies at ${Math.round(m.coverageFactor * 100)}% of capacity`)
        .join(', ')}. Hire more pilots/crew on the Staff screen.`,
    });
  }
  if (crewPlan.engineerShortfall > 0) {
    tips.push({
      severity: 'warning',
      title: 'Maintenance costs inflated by engineer shortfall',
      detail: `You employ ${crewPlan.engineerHired} of ${crewPlan.engineerRequired} required engineer${crewPlan.engineerRequired === 1 ? '' : 's'} — fleet fixed costs are up ${Math.round(
        crewPlan.engineerShortfall * 10
      )}%.`,
    });
  }

  // --- Fuel market ---
  if (outlook.fuelTrendPct > 5) {
    tips.push({
      severity: 'warning',
      title: 'Fuel costs are rising',
      detail: `Jet fuel is up ${outlook.fuelTrendPct.toFixed(1)}% over the last ~4 weeks. Shorter routes and lower frequencies cut exposure the most.`,
    });
  } else if (outlook.fuelTrendPct < -5) {
    tips.push({
      severity: 'info',
      title: 'Fuel costs are falling',
      detail: `Jet fuel is down ${Math.abs(outlook.fuelTrendPct).toFixed(1)}% over the last ~4 weeks — a good window to add frequency before prices recover.`,
    });
  }

  // --- Fuel concentration ---
  const fuelCategory = breakdown.categories.find((c) => c.key === 'fuel');
  if (
    fuelCategory &&
    breakdown.totalMonthly > 0 &&
    fuelCategory.monthlyAmount / breakdown.totalMonthly > 0.35
  ) {
    tips.push({
      severity: 'info',
      title: 'Fuel dominates your cost base',
      detail: `Fuel is ${Math.round((fuelCategory.monthlyAmount / breakdown.totalMonthly) * 100)}% of monthly expenses (${fmt(fuelCategory.monthlyAmount)}/month). Watch the fuel market — or shift your mix toward shorter hops.`,
    });
  }

  // --- Debt ---
  const monthlyLoans = (airline.finances.loans ?? [])
    .filter((loan) => loan.remainingBalance > 0)
    .reduce((sum, loan) => sum + (loan.monthlyPayment || 0), 0);
  const monthlyRevenue = (airline.finances.weeklyPlan ?? { revenue: 0 }).revenue * WEEKS_PER_MONTH;
  if (monthlyLoans > 0 && outlook.monthlyNet <= 0) {
    tips.push({
      severity: 'warning',
      title: 'Debt servicing drains your profits',
      detail: `Loan payments of ${fmt(monthlyLoans)}/month exceed your net monthly flow of ${fmt(outlook.monthlyNet)}. Grow revenue or refinance to stay afloat.`,
    });
  } else if (monthlyLoans > 0 && monthlyRevenue > 0 && monthlyLoans / monthlyRevenue > 0.15) {
    tips.push({
      severity: 'info',
      title: 'Heavy debt load',
      detail: `Loan payments eat ${Math.round((monthlyLoans / monthlyRevenue) * 100)}% of monthly revenue — keep an eye on this as fares and costs move.`,
    });
  }

  // --- Payroll ratio ---
  const monthlyPayroll = (airline.staff ?? []).reduce((sum, m) => sum + (m.salary || 0), 0);
  if (monthlyPayroll > 0 && monthlyRevenue > 0 && monthlyPayroll / monthlyRevenue > 0.25) {
    tips.push({
      severity: 'info',
      title: 'Payroll is a large share of revenue',
      detail: `Staff salaries cost ${fmt(monthlyPayroll)}/month, ${Math.round((monthlyPayroll / monthlyRevenue) * 100)}% of monthly revenue. High fixed wages amplify any dip in load factor.`,
    });
  }

  // --- Environment ---
  if (world.travelDemand < 45) {
    tips.push({
      severity: 'info',
      title: 'Travel demand is weak',
      detail: `Global travel demand is at ${world.travelDemand}/100. Expect lower load factors; lean expansion until it recovers.`,
    });
  }
  if (world.economicIndex < 45) {
    tips.push({
      severity: 'info',
      title: 'The economy is sluggish',
      detail: `Economic index at ${world.economicIndex}/100 — demand and fares are likely under pressure.`,
    });
  }
  if ((airline.reputation ?? 50) < 50) {
    tips.push({
      severity: 'info',
      title: 'Low reputation caps your fares',
      detail: `Reputation ${airline.reputation ?? 50}/100 nudges load factors down by up to 10%. Consistent operations and high crew performance rebuild it.`,
    });
  }

  // --- All clear ---
  if (!tips.some((t) => t.severity === 'critical' || t.severity === 'warning')) {
    tips.push({
      severity: 'positive',
      title: 'Finances are in good shape',
      detail: `Net flow of ${fmt(outlook.monthlyNet)}/month with ${fmt(cash)} in the bank. Consider reinvesting in fleet or expanding into promising routes.`,
    });
  }

  tips.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
  return tips.slice(0, 8);
}