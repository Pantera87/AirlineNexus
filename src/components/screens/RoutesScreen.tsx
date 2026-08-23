import { useState } from 'react';
import { useGameStore } from '@store/gameStore';
import { AIRPORT_DATABASE, getAirportByIata, calculateDistance } from '@data/airports';
import { formatCurrency, formatPercentage } from '@utils/helpers';
import { Map, Plus, X, Plane, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export function RoutesScreen() {
  const airline = useGameStore((state) => state.airline);
  const currencyFormat = useGameStore((state) => state.settings.currencyFormat);
  const addNotification = useGameStore((state) => state.addNotification);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [origin, setOrigin] = useState(airline?.headquarters || 'JFK');
  const [destination, setDestination] = useState('LHR');

  if (!airline) return null;

  const handleCreateRoute = () => {
    const originAirport = getAirportByIata(origin);
    const destAirport = getAirportByIata(destination);

    if (!originAirport || !destAirport) {
      addNotification({
        type: 'error',
        title: 'Invalid Route',
        message: 'Please select valid airports for origin and destination.',
      });
      return;
    }

    if (origin === destination) {
      addNotification({
        type: 'error',
        title: 'Invalid Route',
        message: 'Origin and destination cannot be the same airport.',
      });
      return;
    }

    addNotification({
      type: 'success',
      title: 'Route Created',
      message: `Route ${origin} - ${destination} has been created.`,
    });
    setShowCreateModal(false);
  };

  return (
    <div className="h-full overflow-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Route Management</h1>
          <p className="text-sm text-runway-400">{airline.routes.length} routes total</p>
        </div>
        <button onClick={() => setShowCreateModal(true)} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" />
          Create Route
        </button>
      </div>

      {airline.routes.length === 0 ? (
        <div className="glass-panel p-12 flex flex-col items-center justify-center text-center">
          <Map className="w-12 h-12 text-runway-500 mb-4" />
          <h2 className="text-lg font-semibold text-white mb-2">No routes yet</h2>
          <p className="text-sm text-runway-400 mb-4">Create your first route to start generating revenue.</p>
          <button onClick={() => setShowCreateModal(true)} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Create First Route
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {airline.routes.map((route) => {
            const originAirport = getAirportByIata(route.origin);
            const destAirport = getAirportByIata(route.destination);
            const distance = originAirport && destAirport
              ? calculateDistance(originAirport, destAirport)
              : 0;
            return (
              <div key={route.id} className="glass-panel p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-sky-500/10 flex items-center justify-center">
                      <Plane className="w-5 h-5 text-sky-400" />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-bold text-white">{route.origin}</span>
                      <ArrowRight className="w-4 h-4 text-runway-400" />
                      <span className="text-lg font-bold text-white">{route.destination}</span>
                    </div>
                  </div>
                  <span className={`badge ${route.isActive ? 'badge-success' : 'badge-warning'}`}>
                    {route.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
                  <div>
                    <p className="text-xs text-runway-500">Distance</p>
                    <p className="text-sm font-medium text-white">{distance} nm</p>
                  </div>
                  <div>
                    <p className="text-xs text-runway-500">Frequency</p>
                    <p className="text-sm font-medium text-white">{route.frequency}/wk</p>
                  </div>
                  <div>
                    <p className="text-xs text-runway-500">Load Factor</p>
                    <p className="text-sm font-medium text-white">{formatPercentage(route.avgLoadFactor)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-runway-500">Profit</p>
                    <p className={`text-sm font-medium ${route.profitability >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {formatCurrency(route.revenue - route.cost, currencyFormat, true)}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <AnimatePresence>
        {showCreateModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowCreateModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="glass-panel w-full max-w-md"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between p-6 border-b border-white/5">
                <h2 className="text-xl font-bold text-white">Create New Route</h2>
                <button onClick={() => setShowCreateModal(false)} className="text-runway-400 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-runway-300 mb-2">Origin Airport</label>
                  <select value={origin} onChange={(e) => setOrigin(e.target.value)} className="input-field">
                    {AIRPORT_DATABASE.map((airport) => (
                      <option key={airport.iata} value={airport.iata}>
                        {airport.iata} - {airport.city}, {airport.country}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-runway-300 mb-2">Destination Airport</label>
                  <select value={destination} onChange={(e) => setDestination(e.target.value)} className="input-field">
                    {AIRPORT_DATABASE.map((airport) => (
                      <option key={airport.iata} value={airport.iata}>
                        {airport.iata} - {airport.city}, {airport.country}
                      </option>
                    ))}
                  </select>
                </div>
                {origin !== destination && (
                  <div className="p-3 rounded-lg bg-runway-800/50 text-center">
                    <p className="text-xs text-runway-400">Estimated Distance</p>
                    <p className="text-lg font-bold text-sky-400">
                      {calculateDistance(getAirportByIata(origin)!, getAirportByIata(destination)!)} nm
                    </p>
                  </div>
                )}
                <button onClick={handleCreateRoute} className="btn-primary w-full">
                  Create Route
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}