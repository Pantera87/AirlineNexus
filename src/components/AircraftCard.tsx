import { useState } from 'react';
import useFleetStore from '../store/fleetSlice';
import { useGameStore } from '../store/gameStore';
import { formatCurrency } from '../utils/helpers';
import { type AircraftListing, ConditionGrade } from '../types/game';
import { AIRCRAFT_TYPES } from '../data/aircraft-types';
import { AIRCRAFT_DATABASE } from '../data/aircraft';
import AircraftImage from './AircraftImage';

interface AircraftCardProps {
  listing: AircraftListing;
}

export default function AircraftCard({ listing }: AircraftCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  const { selectListing } = useFleetStore();
  const currencyFormat = useGameStore((state) => state.settings.currencyFormat);

  // Get aircraft type details
  const aircraftType = AIRCRAFT_TYPES[listing.aircraftTypeId];

  if (!aircraftType) return null;

  // Find matching imageKey from the database (bridges naming conventions)
  const dbMatch = AIRCRAFT_DATABASE.find(
    (db) =>
      db.name.toLowerCase().replace(/[^a-z0-9]/g, '') ===
      `${aircraftType.manufacturer} ${aircraftType.model}`.toLowerCase().replace(/[^a-z0-9]/g, '')
  );

  return (
    <button
      onClick={() => selectListing(listing.id)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`aircraft-card-glass w-full aspect-[3/4] p-6 text-left transition-all duration-300 ${isHovered ? 'scale-[1.02]' : ''}`}
    >
      {/* Aircraft image */}
      <AircraftImage
        keyOrId={dbMatch?.imageKey || aircraftType.id}
        fallbackKeys={[aircraftType.id]}
        alt={`${aircraftType.manufacturer} ${aircraftType.model}`}
        className="mb-4 w-full aspect-[16/9] rounded-lg"
        fit="contain"
      />

      {/* Manufacturer badge */}
      <div className="manufacturer-badge inline-block px-3 py-1 rounded-full text-xs font-medium mb-2">
        {aircraftType.manufacturer}
      </div>

      {/* Model name and category */}
      <h3 className="text-xl font-bold text-white mb-1">{aircraftType.model}</h3>
      <p className="text-sm text-blue-300 mb-4 capitalize">
        {getCategoryDisplay(aircraftType.category)} • {aircraftType.seatsEconomy} seats
      </p>

      {/* Key specs */}
      <div className="grid grid-cols-3 gap-2 text-xs text-gray-300 mb-4">
        <div>
          <span className="font-medium">Range:</span> {formatNumber(aircraftType.rangeKm)} km
        </div>
        <div>
          <span className="font-medium">Speed:</span> {formatNumber(aircraftType.cruiseSpeedKmh)} km/h
        </div>
        <div>
          <span className="font-medium">Price:</span> {formatCurrency(listing.price, currencyFormat)}
        </div>
      </div>

      {/* Condition badge for used aircraft */}
      {listing.isNew === false && listing.condition && (
        <div className={`inline-block px-2 py-1 rounded text-xs font-medium ${getConditionClass(listing.condition)}`}>
          {formatCondition(listing.condition)}
        </div>
      )}

      {/* Purchase indicator */}
      {listing.purchased && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center rounded-lg">
          <span className="text-yellow-400 font-medium">✓ Purchased</span>
        </div>
      )}
    </button>
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
  if (num >= 1000) {
    return (num / 1000).toFixed(0) + 'K';
  }
  return num.toString();
}
