import { useGameStore } from '@store/gameStore';
import { AIRCRAFT_DATABASE } from '@data/aircraft';
import { formatCurrency, formatShortDate } from '@utils/helpers';
import { Plane, TrendingUp, DollarSign, Users, AlertCircle, BarChart3, PieChart } from 'lucide-react';
import { motion } from 'framer-motion';
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart as RePieChart, Pie, Cell } from 'recharts';
import { ChartPanel, ChartTooltip, compactMoney } from '@/components/charts/ChartPanel';
import { StatusPill, toneFromStatus } from '@/components/icons/StatusIcons';
import { SilhouetteForType } from '@/components/icons/AircraftSilhouettes';

export function DashboardScreen() {
  const airline = useGameStore((state) => state.airline);
  const currentDate = useGameStore((state) => state.currentDate);
  const notifications = useGameStore((state) => state.notifications);
  const currencyFormat = useGameStore((state) => state.settings.currencyFormat);

  if (!airline) return null;

  const stats = [
    {
      label: 'Cash Balance',
      value: formatCurrency(airline.finances.cash, currencyFormat),
      icon: <DollarSign className="w-5 h-5" />,
      color: 'text-green-400',
      bg: 'bg-green-500/10',
    },
    {
      label: 'Net Worth',
      value: formatCurrency(airline.finances.netWorth, currencyFormat),
      icon: <TrendingUp className="w-5 h-5" />,
      color: 'text-sky-400',
      bg: 'bg-sky-500/10',
    },
    {
      label: 'Fleet Size',
      value: String(airline.fleet.length),
      icon: <Plane className="w-5 h-5" />,
      color: 'text-purple-400',
      bg: 'bg-purple-500/10',
    },
    {
      label: `Active Routes · ${airline.routes.reduce((s, r) => s + (r.timetable?.legs.length ?? 0), 0)} flights/wk`,
      value: String(airline.routes.filter((r) => r.isActive).length),
      icon: <TrendingUp className="w-5 h-5" />,
      color: 'text-amber-400',
      bg: 'bg-amber-500/10',
    },
  ];

  return (
    <div className="h-full overflow-auto p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-sm text-runway-400">{airline.name} - Overview as of {formatShortDate(currentDate)}</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, index) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: index * 0.1 }}
            className="glass-panel p-5"
          >
            <div className="flex items-center justify-between mb-3">
              <div className={`w-10 h-10 rounded-lg ${stat.bg} flex items-center justify-center ${stat.color}`}>
                {stat.icon}
              </div>
            </div>
            <p className="text-2xl font-bold text-white">{stat.value}</p>
            <p className="text-xs text-runway-400 mt-1">{stat.label}</p>
          </motion.div>
        ))}
      </div>

      {/* Charts */}
      {(() => {
        const reports = airline.finances.monthlyReports.slice(-12).map((r) => ({
          month: new Date(r.month).toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
          revenue: Math.round(r.revenue),
          expenses: Math.round(r.expenses),
          profit: Math.round(r.profit),
        }));
        const fleetByCategory = airline.fleet.reduce<Record<string, number>>((acc, a) => {
          const cat = AIRCRAFT_DATABASE.find((t) => t.id === a.typeId)?.category ?? 'other';
          acc[cat] = (acc[cat] ?? 0) + 1;
          return acc;
        }, {});
        const fleetData = Object.entries(fleetByCategory).map(([name, value]) => ({ name, value }));
        const FLEET_COLORS = ['#38bdf8', '#34d399', '#a78bfa', '#f59e0b', '#fb7185', '#facc15'];
        return (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <ChartPanel
              title="Financial Performance"
              subtitle="last 12 months"
              icon={<BarChart3 className="w-4 h-4 text-sky-400" />}
              className="lg:col-span-2"
            >
              {reports.length === 0 ? (
                <div className="h-[240px] flex flex-col items-center justify-center text-center">
                  <BarChart3 className="w-8 h-8 text-runway-600 mb-2" />
                  <p className="text-sm text-runway-400">No monthly reports yet.</p>
                  <p className="text-xs text-runway-500 mt-1">Financial data appears after your first monthly settlement.</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <ComposedChart data={reports} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                    <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => compactMoney(Number(v))} width={52} />
                    <Tooltip content={<ChartTooltip valueFormatter={compactMoney} />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                    <Bar dataKey="revenue" name="Revenue" fill="#34d399" radius={[3, 3, 0, 0]} maxBarSize={22} />
                    <Bar dataKey="expenses" name="Expenses" fill="#fb7185" radius={[3, 3, 0, 0]} maxBarSize={22} />
                    <Line dataKey="profit" name="Profit" stroke="#38bdf8" strokeWidth={2} dot={{ r: 2.5, fill: '#38bdf8' }} />
                  </ComposedChart>
                </ResponsiveContainer>
              )}
            </ChartPanel>

            <ChartPanel
              title="Fleet Composition"
              subtitle={`${airline.fleet.length} aircraft`}
              icon={<PieChart className="w-4 h-4 text-sky-400" />}
            >
              {fleetData.length === 0 ? (
                <div className="h-[240px] flex flex-col items-center justify-center text-center">
                  <Plane className="w-8 h-8 text-runway-600 mb-2" />
                  <p className="text-sm text-runway-400">No aircraft in fleet yet.</p>
                </div>
              ) : (
                <div className="relative h-[240px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <RePieChart>
                      <Pie data={fleetData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={80} paddingAngle={3} stroke="none">
                        {fleetData.map((entry, i) => (
                          <Cell key={entry.name} fill={FLEET_COLORS[i % FLEET_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip content={<ChartTooltip valueFormatter={(v) => `${v} aircraft`} />} />
                    </RePieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <p className="text-2xl font-bold text-white">{airline.fleet.length}</p>
                    <p className="text-xs text-runway-400">total</p>
                  </div>
                </div>
              )}
            </ChartPanel>
          </div>
        );
      })()}

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Fleet Summary */}
        <div className="glass-panel p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Fleet Summary</h2>
          {airline.fleet.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <AlertCircle className="w-8 h-8 text-runway-500 mb-2" />
              <p className="text-sm text-runway-400">No aircraft in fleet yet.</p>
              <p className="text-xs text-runway-500 mt-1">Visit the Fleet screen to acquire aircraft.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {airline.fleet.slice(0, 5).map((aircraft) => {
                const type = AIRCRAFT_DATABASE.find((a) => a.id === aircraft.typeId);
                return (
                  <div key={aircraft.id} className="flex items-center justify-between p-3 rounded-lg bg-runway-800/50">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-7 rounded-md bg-gradient-to-br from-sky-900/40 to-blue-900/40 flex items-center justify-center shrink-0">
                        <SilhouetteForType typeId={aircraft.typeId} className="w-10 h-5" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-white">{type?.name || 'Unknown'}</p>
                        <p className="text-xs text-runway-400">{aircraft.registration}</p>
                      </div>
                    </div>
                    <StatusPill tone={toneFromStatus(aircraft.status)} className="text-[11px] px-2 py-0.5">
                      {aircraft.status}
                    </StatusPill>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Recent Notifications */}
        <div className="glass-panel p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Recent Notifications</h2>
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Users className="w-8 h-8 text-runway-500 mb-2" />
              <p className="text-sm text-runway-400">No notifications yet.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {notifications.slice(0, 5).map((notif) => (
                <div key={notif.id} className="p-3 rounded-lg bg-runway-800/50">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-medium text-white">{notif.title}</p>
                    <span className={`badge ${
                      notif.type === 'success' ? 'badge-success' :
                      notif.type === 'warning' ? 'badge-warning' :
                      notif.type === 'error' ? 'badge-danger' : 'badge-info'
                    }`}>
                      {notif.type}
                    </span>
                  </div>
                  <p className="text-xs text-runway-400">{notif.message}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}