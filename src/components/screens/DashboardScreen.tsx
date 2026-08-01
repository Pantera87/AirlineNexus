import { useGameStore } from '@store/gameStore';
import { AIRCRAFT_DATABASE } from '@data/aircraft';
import { formatCurrency, formatShortDate } from '@utils/helpers';
import { Plane, TrendingUp, DollarSign, Users, AlertCircle } from 'lucide-react';
import { motion } from 'framer-motion';

export function DashboardScreen() {
  const airline = useGameStore((state) => state.airline);
  const currentDate = useGameStore((state) => state.currentDate);
  const notifications = useGameStore((state) => state.notifications);

  if (!airline) return null;

  const currencyFormat = useGameStore((state) => state.settings.currencyFormat);
  
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
      label: 'Active Routes',
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
                      <Plane className="w-4 h-4 text-sky-400" />
                      <div>
                        <p className="text-sm font-medium text-white">{type?.name || 'Unknown'}</p>
                        <p className="text-xs text-runway-400">{aircraft.registration}</p>
                      </div>
                    </div>
                    <span className={`badge ${aircraft.status === 'available' ? 'badge-success' : 'badge-warning'}`}>
                      {aircraft.status}
                    </span>
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