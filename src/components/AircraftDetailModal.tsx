import { useEffect } from 'react';
import useFleetStore from '../store/fleetSlice';
import { type AircraftListing, ConditionGrade } from '../types/game';
import { AIRCRAFT_TYPES } from '../data/aircraft-types';
import PurchaseDialog from './PurchaseDialog';

export default function AircraftDetailModal() {
  const {
    selectedListingId,
    closeDetailModal,
    newAircraftListings,
    usedAircraftListings
  } = useFleetStore();

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
    <div className="fixed inset-0 glass-modal-backdrop z-50 flex items-center justify-center p-4">
      <div className="glass-modal max-w-4xl w-full max-h-[90vh] overflow-y-auto relative">
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
            {/* Aircraft image placeholder */}
            <div className="lg:w-1/2 h-64 bg-slate-700 rounded-lg flex items-center justify-center">
              <span className="text-gray-500 text-sm">Aircraft Image</span>
            </div>

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
                ${formatCurrency(listing.price)}
              </div>
            </div>
          </div>

          {/* Specifications table */}
          <div className="mb-6">
            <h3 className="text-xl font-semibold text-white mb-4">Specifications</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div className="space-y-2">
                <SpecRow label="Range" value={`${formatNumber(aircraftType.rangeKm)} km`} />
                <SpecRow label="Cruise Speed" value={`${formatNumber(aircraftType.cruiseSpeedKmh)} km/h`} />
                <SpecRow label="Max Payload" value={`${formatNumber(aircraftType.maxPayloadKg)} kg`} />
                <SpecRow label="Fuel Burn/Hour" value={`${formatNumber(aircraftType.fuelBurnPerHourKg)} kg`} />
              </div>
              <div className="space-y-2">
                <SpecRow label="Economy Seats" value={aircraftType.seatsEconomy.toString()} />
                <SpecRow label="Business Seats" value={aircraftType.seatsBusiness?.toString() || '0'} />
                {aircraftType.seatsFirst && (
                  <SpecRow label="First Class Seats" value={aircraftType.seatsFirst.toString()} />
                )}
                <SpecRow
                  label="Monthly Maintenance"
                  value={`$${formatCurrency(aircraftType.monthlyMaintenanceUsd)}`}
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
                {listing.cycles && (
                  <SpecRow label="Cycles" value={formatNumber(listing.cycles)} />
                )}
              </div>
            )}
          </div>

          {/* Purchase section */}
          <div className="border-t border-slate-700 pt-6">
            <PurchaseDialog listing={listing} aircraftType={aircraftType} />
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

function formatCurrency(amount: number): string {
  return amount.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  });
}