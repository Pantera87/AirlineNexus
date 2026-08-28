import { useEffect } from 'react';
import useFleetStore from '../store/fleetSlice';
import { useGameStore } from '../store/gameStore';
import { formatCurrency } from '../utils/helpers';
import { ConditionGrade } from '../types/game';
import { AIRCRAFT_TYPES } from '../data/aircraft-types';
import PurchaseDialog from './PurchaseDialog';
import { useUnits, formatDistanceKm, formatSpeedKmh } from '../utils/units';


export default function AircraftDetailModal() {
  const {
    selectedListingId,
    closeDetailModal,
    newAircraftListings,
    usedAircraftListings
  } = useFleetStore();
  const currencyFormat = useGameStore((state) => state.settings.currencyFormat);
  const units = useUnits();


  // Close modal on Escape key - moved immediately after store hook to maintain consistent hook order
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeDetailModal();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [closeDetailModal]);

  // Find the selected listing
  const allListings = [...newAircraftListings, ...usedAircraftListings];
  const listing = allListings.find(l => l.id === selectedListingId);

  if (!listing || !selectedListingId) return null;

  // Get aircraft type details
  const aircraftType = AIRCRAFT_TYPES[listing.aircraftTypeId];

  if (!aircraftType) return null;

  return (
    <div className="fixed inset-0 glass-modal-backdrop z-50 flex items-center justify-center p-4" onClick={closeDetailModal}>
      <div className="glass-modal max-w-4xl w-full max-h-[90vh] overflow-y-auto relative" onClick={(e) => e.stopPropagation()}>
        {/* Close button */}
        <button
          onClick={closeDetailModal}
          className="absolute top-4 right-4 text-gray-400 hover:text-white text-2xl z-10"
        >
          ✕
        </button>

        <div className="p-6">
          {/* Header */}
          <div className="flex flex-col lg:flex-row gap-6 mb-6">
            {/* Aircraft artwork (placeholder for real photo) */}
            <div className="w-full lg:w-1/2 h-64 overflow-hidden rounded-lg bg-linear-to-br from-sky-900/40 via-runway-800/60 to-blue-900/40" />

            {/* Basic info */}
            <div className="lg:w-1/2 space-y-4">
              <h2 className="text-3xl font-bold text-white">{aircraftType.model}</h2>

              <div className="flex flex-wrap gap-2">
                <span className="manufacturer-badge px-3 py-1 rounded-full text-sm">
                  {aircraftType.manufacturer}
                </span>
                <span className="bg-slate-700/50 px-3 py-1 rounded-full text-sm capitalize">
                  {getCategoryDisplay(aircraftType.category)}
                </span>
              </div>

              {/* Condition for used aircraft */}
              {listing.isNew === false && listing.condition && (
                <div className="flex items-center gap-2">
                  <span className="text-white">Condition:</span>
                  <span className={`px-3 py-1 rounded text-sm font-medium ${getConditionClass(listing.condition)}`}>
                    {formatCondition(listing.condition)}
                  </span>
                </div>
              )}

              {/* Price */}
              <div className="price-tag inline-block px-4 py-2 rounded-lg text-white font-bold">
                {formatCurrency(listing.price, currencyFormat)}
              </div>
            </div>
          </div>

          {/* Specifications table */}
          <div className="mb-6">
            <h3 className="text-xl font-semibold text-white mb-4">Specifications</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div className="space-y-2">
                <SpecRow label="Range" value={formatDistanceKm(aircraftType.rangeKm, units)} />
                <SpecRow label="Cruise Speed" value={formatSpeedKmh(aircraftType.cruiseSpeedKmh, units)} />
                <SpecRow label="Fuel Burn/Hour" value={`${formatNumber(aircraftType.fuelBurnPerHourKg)} kg`} />
              </div>
              <div className="space-y-2">
                <SpecRow label="Economy Seats" value={aircraftType.seatsEconomy.toString()} />
                <SpecRow label="Business Seats" value={aircraftType.seatsBusiness?.toString() || '0'} />
                <SpecRow
                  label="Monthly Maintenance"
                  value={formatCurrency(aircraftType.monthlyMaintenanceUsd, currencyFormat)}
                />
              </div>
            </div>

            {/* Used aircraft history */}
            {listing.isNew === false && (
              <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <SpecRow
                  label="Year Built"
                  value={listing.manufactureYear?.toString() || 'N/A'}
                />
                <SpecRow
                  label="Total Flight Hours"
                  value={formatNumber(listing.totalFlightHours || 0)}
                />
              </div>
            )}
          </div>

          {/* Purchase section */}
          <div className="border-t border-slate-700 pt-6">
            <PurchaseDialog listing={listing} />
          </div>
        </div>
      </div>
    </div>
  );
}

// Helper components
function SpecRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-300">{label}</span>
      <span className="text-white font-medium">{value}</span>
    </div>
  );
}

// Helper functions
function getCategoryDisplay(category: string): string {
  const displayMap = {
    'Narrowbody': 'narrow-body',
    'Widebody': 'wide-body',
    'Regional': 'regional',
    'Turboprop': 'turboprop',
    'Cargo': 'cargo',
    'Business Jet': 'business-jet'
  };
  return displayMap[category as keyof typeof displayMap] || category.toLowerCase();
}

function getConditionClass(condition: ConditionGrade): string {
  const classMap = {
    [ConditionGrade.Excellent]: 'condition-excellent',
    [ConditionGrade.VeryGood]: 'condition-very-good',
    [ConditionGrade.Good]: 'condition-good',
    [ConditionGrade.Fair]: 'condition-fair',
    [ConditionGrade.Poor]: 'condition-poor'
  };
  return classMap[condition];
}

function formatCondition(condition: ConditionGrade): string {
  const formatted = condition.replace(/([A-Z])/g, ' $1');
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

function formatNumber(num: number): string {
  if (num === undefined || num === null) {
    return 'N/A';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(0) + 'K';
  }
  return num.toString();
}
