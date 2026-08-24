import { useMemo } from 'react';
import { useGameStore } from '@store/gameStore';
import { formatCurrency } from '@utils/helpers';
import { AIRPORT_DATABASE } from '@/data/airports';
import { findAircraftById, previewLoopEconomics, getRoutePath } from '@/utils/routeEngine';
import type { Airport } from '@/types/game';
import { Fuel, TrendingUp, TrendingDown, Gauge, Flame } from 'lucide-react';
import { motion } from 'framer-motion';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

function formatPriceDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** Dark glass-panel themed tooltip for the fuel price chart */
function FuelChartTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload as { date: string; price: number };
  return (
    <div className="glass-panel px-3 py-2 text-xs">
      <p className="text-runway-400 mb-1">{new Date(point.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
      <p className="font-semibold text-white">${point.price.toFixed(2)} / kg</p>
    </div>
  );
}

export function FuelScreen() {
  const world = useGameStore((state) => state.world);
  const airline = useGameStore((state) => state.airline);
  const currencyFormat = useGameStore((state) => state.settings.currencyFormat);

  const history = useMemo(() => world.fuelPriceHistory ?? [], [world.fuelPriceHistory]);
  const currentPrice = world.fuelPrice;
  const prevPoint = history.length >= 2 ? history[history.length - 2] : null;
  const changePct = prevPoint && prevPoint.price > 0 ? ((currentPrice - prevPoint.price) / prevPoint.price) * 100 : null;

  // High/low over the last 26 weeks (including the current price)
  const { high, low } = useMemo(() => {
    const prices = [...history.map((p) => p.price), currentPrice].slice(-26);
    return { high: Math.max(...prices), low: Math.min(...prices) };
  }, [history, currentPrice]);

  // Estimated weekly fuel spend across all active routes at the live market price.
  const weeklyFuelSpend = useMemo(() => {
    if (!airline || airline.routes.length === 0) return null;
    let total = 0;
    for (const route of airline.routes) {
      if (!route.isActive) continue;
      // Full closed-loop path: hub → stops… → destination (loop closes back to hub).
      const pathAirports = getRoutePath(route)
        .map((iata) => AIRPORT_DATABASE.find((a) => a.iata === iata))
        .filter((a): a is Airport => Boolean(a));
      if (pathAirports.length < 2) continue;
      const aircraftType = findAircraftById(route.aircraftId);
      if (!aircraftType) continue;
      total += previewLoopEconomics(pathAirports, aircraftType, route.frequency, currentPrice).weeklyFuelCost;
    }
    return total;
  }, [airline, currentPrice]);

  const stats = [
    {
      label: 'Current Price',
      value: `$${currentPrice.toFixed(2)}`,
      sub: 'per kg (jet fuel)',
      icon: <Gauge className="w-5 h-5" />,
      color: 'text-sky-400',
      bg: 'bg-sky-500/10',
    },
    {
      label: 'Week-over-Week',
      value: changePct === null ? '—' : `${changePct >= 0 ? '+' : ''}${changePct.toFixed(1)}%`,
      sub: changePct === null ? 'awaiting first update' : 'vs last week',
      icon: changePct !== null && changePct < 0 ? <TrendingDown className="w-5 h-5" /> : <TrendingUp className="w-5 h-5" />,
      color: changePct === null ? 'text-runway-400' : changePct >= 0 ? 'text-red-400' : 'text-green-400',
      bg: changePct !== null && changePct < 0 ? 'bg-green-500/10' : 'bg-red-500/10',
    },
    {
      label: '26-Week Range',
      value: `$${low.toFixed(2)} – $${high.toFixed(2)}`,
      sub: 'per kg',
      icon: <TrendingUp className="w-5 h-5" />,
      color: 'text-emerald-400',
      bg: 'bg-emerald-500/10',
    },
    {
      label: 'Est. Weekly Fuel Spend',
      value: weeklyFuelSpend === null ? '—' : formatCurrency(weeklyFuelSpend, currencyFormat),
      sub: weeklyFuelSpend === null ? 'no active routes yet' : 'across your active routes',
      icon: <Flame className="w-5 h-5" />,
      color: 'text-amber-400',
      bg: 'bg-amber-500/10',
    },
  ];

  return (
    <div className="h-full overflow-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
          <Fuel className="w-6 h-6 text-sky-400" />
          Fuel Market
        </h1>
        <p className="text-sm text-runway-400">
          Jet fuel prices update weekly and directly affect the cost of every flight you operate.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, index) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: index * 0.1 }}
            className="glass-panel p-5"
          >
            <div className={`w-10 h-10 rounded-lg ${stat.bg} flex items-center justify-center ${stat.color} mb-3`}>
              {stat.icon}
            </div>
            <p className={`text-2xl font-bold ${stat.color === 'text-runway-400' ? 'text-white' : stat.color}`}>{stat.value}</p>
            <p className="text-xs text-runway-400 mt-1">{stat.label} · {stat.sub}</p>
          </motion.div>
        ))}
      </div>

      <div className="glass-panel p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Fuel Price History</h2>
          <span className="text-xs text-runway-400">USD per kg · weekly updates</span>
        </div>

        {history.length === 0 ? (
          <p className="text-sm text-runway-400 text-center py-16">
            No price history yet — the market will update at your first weekly settlement.
          </p>
        ) : (
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={history} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="fuelPriceFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#38bdf8" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis
                  dataKey="date"
                  tickFormatter={formatPriceDate}
                  tick={{ fill: '#8b9bb4', fontSize: 11 }}
                  axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
                  tickLine={false}
                />
                <YAxis
                  domain={['dataMin - 0.1', 'dataMax + 0.1']}
                  tickFormatter={(v: number) => `$${v.toFixed(2)}`}
                  tick={{ fill: '#8b9bb4', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={64}
                />
                <Tooltip content={<FuelChartTooltip />} />
                <Area
                  type="monotone"
                  dataKey="price"
                  stroke="#38bdf8"
                  strokeWidth={2}
                  fill="url(#fuelPriceFill)"
                  dot={{ r: 2, fill: '#38bdf8', strokeWidth: 0 }}
                  activeDot={{ r: 4, fill: '#7dd3fc' }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="glass-panel p-5">
        <p className="text-xs text-runway-400 leading-relaxed">
          <span className="font-semibold text-white">How it works:</span> every in-game week the jet fuel market moves by up to ±8%
          (clamped between $0.60 and $1.40 per kg). Your route costs — and therefore your weekly profit on every active route — are
          recalculated at the current price during settlement. Watch for surge notifications when prices jump 5% or more in a single week.
        </p>
      </div>
    </div>
  );
}
