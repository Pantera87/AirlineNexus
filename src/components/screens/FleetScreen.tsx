import { useState } from 'react';
import { useGameStore } from '@store/gameStore';
import { AIRCRAFT_DATABASE, getAircraftByCategory } from '@data/aircraft';
import { formatCurrency } from '@utils/helpers';
import type { Aircraft, AircraftCategory } from '@/types/game';
import { Plane, Plus, X, DollarSign, Gauge, Users, Navigation, TrendingDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// Estimate resale value: ~5% depreciation per year + condition factor
function estimateSalePrice(aircraft: Aircraft): number | null {
  const type = AIRCRAFT_DATABASE.find((a) => a.id === aircraft.typeId);
  if (!type) return null;
  const ageFactor = Math.max(0.1, 1 - aircraft.age * 0.05);
  const conditionFactor = aircraft.condition / 100;
  return Math.round(type.acquisitionCost * ageFactor * conditionFactor);
}

const categories: { id: AircraftCategory | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'regional', label: 'Regional' },
  { id: 'turboprop', label: 'Turboprop' },
  { id: 'narrow-body', label: 'Narrow-body' },
  { id: 'wide-body', label: 'Wide-body' },
  { id: 'cargo', label: 'Cargo' },
];

export function FleetScreen() {
  const airline = useGameStore((state) => state.airline);
  const addNotification = useGameStore((state) => state.addNotification);
  const purchaseAircraft = useGameStore((state) => state.purchaseAircraft);
  const sellAircraft = useGameStore((state) => state.sellAircraft);
  const navigateTo = useGameStore((state) => state.navigateTo);
  const currencyFormat = useGameStore((state) => state.settings.currencyFormat);
  const [activeCategory, setActiveCategory] = useState<AircraftCategory | 'all'>('all');
  const [showMarketplace, setShowMarketplace] = useState(false);
  const [aircraftToSell, setAircraftToSell] = useState<Aircraft | null>(null);
  const [saleResult, setSaleResult] = useState<{ success: boolean; message: string } | null>(null);

  if (!airline) return null;

  const openSaleModal = (aircraft: Aircraft) => {
    setSaleResult(null);
    setAircraftToSell(aircraft);
  };

  const handleConfirmSale = () => {
    if (!aircraftToSell) return;
    try {
      const result = sellAircraft(aircraftToSell.id);
      addNotification({
        type: result.success ? 'success' : 'error',
        title: result.success ? 'Aircraft Sold' : 'Sale Failed',
        message: result.message,
      });
      setSaleResult(result);
    } catch (err) {
      console.error('Failed to sell aircraft:', err);
      const message = `Something went wrong while selling ${aircraftToSell.registration}. Check the console for details.`;
      addNotification({
        type: 'error',
        title: 'Sale Failed',
        message,
      });
      setSaleResult({ success: false, message });
    }
  };

  const closeSaleModal = () => {
    setAircraftToSell(null);
    setSaleResult(null);
  };

  const availableAircraft =
    activeCategory === 'all'
      ? AIRCRAFT_DATABASE
      : getAircraftByCategory(activeCategory);

  const handlePurchase = (typeId: string) => {
    const aircraftType = AIRCRAFT_DATABASE.find((a) => a.id === typeId);
    if (!aircraftType) return;

    if (airline.finances.cash < aircraftType.acquisitionCost) {
      addNotification({
        type: 'error',
        title: 'Insufficient Funds',
        message: `You need ${formatCurrency(aircraftType.acquisitionCost, currencyFormat)} to purchase a ${aircraftType.name}.`,
      });
      return;
    }

    const success = purchaseAircraft(typeId);
    if (success) {
      addNotification({
        type: 'success',
        title: 'Aircraft Purchased',
        message: `${aircraftType.name} has been added to your fleet.`,
      });
      setShowMarketplace(false);
    } else {
      addNotification({
        type: 'error',
        title: 'Purchase Failed',
        message: `Unable to purchase ${aircraftType.name}. Please try again.`,
      });
    }
  };

  return (
    <div className="h-full overflow-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Fleet Management</h1>
          <p className="text-sm text-runway-400">
            {airline.fleet.filter((aircraft) => {
              const type = AIRCRAFT_DATABASE.find((a) => a.id === aircraft.typeId);
              return activeCategory === 'all' || type?.category === activeCategory;
            }).length} aircraft in fleet
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => navigateTo('fleet-marketplace')} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Visit Marketplace
          </button>
          <button onClick={() => setShowMarketplace(true)} className="btn-secondary flex items-center gap-2">
            <Plane className="w-4 h-4" />
            Quick Purchase
          </button>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2">
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setActiveCategory(cat.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
              activeCategory === cat.id
                ? 'bg-sky-500/20 text-sky-400'
                : 'text-runway-400 hover:text-white hover:bg-white/5'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

        {airline.fleet.length === 0 ? (
          <div className="glass-panel p-12 flex flex-col items-center justify-center text-center">
            <Plane className="w-12 h-12 text-runway-500 mb-4" />
            <h2 className="text-lg font-semibold text-white mb-2">Your fleet is empty</h2>
        <p className="text-sm text-runway-400 mb-4">Start building your airline by acquiring your first aircraft.</p>
        <div className="flex items-center gap-3">
          <button onClick={() => navigateTo('fleet-marketplace')} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Visit Marketplace
          </button>
          <button onClick={() => setShowMarketplace(true)} className="btn-secondary flex items-center gap-2">
            <Plane className="w-4 h-4" />
            Quick Purchase
          </button>
        </div>
        </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {airline.fleet
              .filter((aircraft) => {
                const type = AIRCRAFT_DATABASE.find((a) => a.id === aircraft.typeId);
                if (!type) return false;
                return activeCategory === 'all' || type.category === activeCategory;
              })
              .map((aircraft) => {
                const type = AIRCRAFT_DATABASE.find((a) => a.id === aircraft.typeId);
                return (
                  <div key={aircraft.id} className="glass-panel p-5">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-sky-500/10 flex items-center justify-center">
                          <Plane className="w-5 h-5 text-sky-400" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-white">{type?.name || 'Unknown'}</p>
                          <p className="text-xs text-runway-400">{aircraft.registration}</p>
                        </div>
                      </div>
                      <span className={`badge ${aircraft.status === 'available' ? 'badge-success' : 'badge-warning'}`}>
                        {aircraft.status}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div>
                        <p className="text-xs text-runway-500">Age</p>
                        <p className="text-sm font-medium text-white">{aircraft.age}y</p>
                      </div>
                      <div>
                        <p className="text-xs text-runway-500">Condition</p>
                        <p className="text-sm font-medium text-white">{aircraft.condition}%</p>
                      </div>
                      <div>
                        <p className="text-xs text-runway-500">Hours</p>
                        <p className="text-sm font-medium text-white">{aircraft.totalFlightHours}</p>
                      </div>
                    </div>
                    {(() => {
                      const salePrice = estimateSalePrice(aircraft);
                      return (
                        <button
                          onClick={() => openSaleModal(aircraft)}
                          disabled={aircraft.status === 'in-flight'}
                          className="btn-danger w-full mt-4 flex items-center justify-center gap-2 text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                          title={salePrice ? `Estimated value: ${formatCurrency(salePrice, currencyFormat)}` : undefined}
                        >
                          <TrendingDown className="w-3.5 h-3.5" />
                          Sell Aircraft
                        </button>
                      );
                    })()}
                  </div>
                );
              })}
          </div>
      )}

      {/* Sale Confirmation Modal */}
      <AnimatePresence>
        {aircraftToSell && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm"
            onClick={saleResult ? closeSaleModal : undefined}
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
                  <TrendingDown className="w-5 h-5 text-red-400" />
                </div>
                <h2 className="text-lg font-bold text-white">{saleResult ? 'Sale Complete' : 'Sell Aircraft'}</h2>
              </div>

              {saleResult && (
                <div
                  className={`rounded-lg p-4 mb-6 text-sm ${
                    saleResult.success
                      ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300'
                      : 'bg-red-500/10 border border-red-500/30 text-red-300'
                  }`}
                >
                  <p className="font-semibold mb-1">{saleResult.success ? '✅ Aircraft Sold' : '❌ Sale Failed'}</p>
                  <p>{saleResult.message}</p>
                </div>
              )}

              {!saleResult && (() => {
                const type = AIRCRAFT_DATABASE.find((a) => a.id === aircraftToSell.typeId);
                const salePrice = estimateSalePrice(aircraftToSell);
                return (
                  <>
                    <p className="text-sm text-runway-400 mb-4">
                      Are you sure you want to sell this aircraft? This action cannot be undone.
                    </p>
                    <div className="bg-runway-800/50 rounded-lg p-4 space-y-2 mb-6">
                      <div className="flex justify-between text-sm">
                        <span className="text-runway-400">Aircraft</span>
                        <span className="font-medium text-white">{type?.name || 'Unknown'}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-runway-400">Registration</span>
                        <span className="font-medium text-white">{aircraftToSell.registration}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-runway-400">Age / Condition</span>
                        <span className="font-medium text-white">{aircraftToSell.age}y / {aircraftToSell.condition}%</span>
                      </div>
                      {aircraftToSell.assignedRoute && (
                        <p className="text-xs text-amber-400 pt-2 border-t border-white/5">
                          ⚠ This aircraft is assigned to a route and will be unassigned.
                        </p>
                      )}
                      <div className="flex justify-between items-center pt-3 border-t border-white/10">
                        <span className="text-sm text-runway-400">Estimated Sale Price</span>
                        <span className="text-lg font-bold text-emerald-400">
                          {salePrice ? formatCurrency(salePrice, currencyFormat) : '—'}
                        </span>
                      </div>
                    </div>
                  </>
                );
              })()}

              {saleResult ? (
                <button onClick={closeSaleModal} className="btn-primary w-full text-sm">
                  Done
                </button>
              ) : (
                <div className="flex gap-3">
                  <button onClick={closeSaleModal} className="btn-secondary flex-1 text-sm">
                    Cancel
                  </button>
                  <button onClick={handleConfirmSale} className="btn-danger flex-1 text-sm">
                    Confirm Sale
                  </button>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showMarketplace && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowMarketplace(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="glass-panel w-full max-w-4xl max-h-[80vh] flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between p-6 border-b border-white/5">
                <h2 className="text-xl font-bold text-white">Aircraft Marketplace</h2>
                <button onClick={() => setShowMarketplace(false)} className="text-runway-400 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex gap-2 p-4 border-b border-white/5 overflow-x-auto">
                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setActiveCategory(cat.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                      activeCategory === cat.id
                        ? 'bg-sky-500/20 text-sky-400'
                        : 'text-runway-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>

              <div className="flex-1 overflow-auto p-4 space-y-3">
                {availableAircraft.map((ac) => (
                  <div key={ac.id} className="p-4 rounded-lg bg-runway-800/50 hover:bg-runway-800 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="text-sm font-semibold text-white">{ac.name}</h3>
                          <span className="badge badge-info">{ac.category}</span>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                          <div className="flex items-center gap-1.5 text-runway-400">
                            <Navigation className="w-3.5 h-3.5" />
                            {ac.range} nm
                          </div>
                          <div className="flex items-center gap-1.5 text-runway-400">
                            <Users className="w-3.5 h-3.5" />
                            {ac.maxPassengers} pax
                          </div>
                          <div className="flex items-center gap-1.5 text-runway-400">
                            <Gauge className="w-3.5 h-3.5" />
                            {ac.cruiseSpeed} kts
                          </div>
                          <div className="flex items-center gap-1.5 text-runway-400">
                            <DollarSign className="w-3.5 h-3.5" />
                            {formatCurrency(ac.acquisitionCost, currencyFormat, true)}
                          </div>
                        </div>
                      </div>
                      <button onClick={() => handlePurchase(ac.id)} className="btn-primary ml-4 text-xs">
                        Purchase
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
