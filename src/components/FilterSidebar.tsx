import { useState } from 'react';
import useFleetStore from '../store/fleetSlice';
import { ConditionGrade } from '../types/game';

interface FilterSidebarProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
}

export default function FilterSidebar({ isOpen, setIsOpen }: FilterSidebarProps) {
  const {
    activeFilters,
    setFilters,
    clearAllFilters
  } = useFleetStore();

  // Price range state
  const [priceMin, setPriceMin] = useState(0);
  const [priceMax, setPriceMax] = useState(450000000);

  // Capacity state
  const [capacityMin, setCapacityMin] = useState(0);

  // Range state
  const [rangeMin, setRangeMin] = useState(0);

  // Used-specific filters
  const [yearBuiltFrom, setYearBuiltFrom] = useState(1960);
  const [flightHoursMax, setFlightHoursMax] = useState(100000);

  // Update filters immediately as inputs change
  const updatePriceRange = () => {
    setFilters({ priceRange: [priceMin, priceMax] });
  };

  const updateCapacityMin = () => {
    setFilters({ capacityMin });
  };

  const updateRangeMin = () => {
    setFilters({ rangeMin });
  };

  const updateYearBuiltFrom = () => {
    setFilters({ yearBuiltFrom });
  };

  const updateFlightHoursMax = () => {
    setFilters({ flightHoursMax });
  };

  return (
    <div className="filter-sidebar h-[calc(100vh-200px)] overflow-y-auto rounded-lg p-6 sticky top-8">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-semibold text-white">Filters</h2>
        <button
          onClick={() => setIsOpen(false)}
          className="lg:hidden text-blue-400 hover:text-blue-300"
        >
          ✕ Close
        </button>
      </div>

      <form className="space-y-6">
        {/* Category filters */}
        <div>
          <h3 className="text-lg font-medium text-white mb-3">Category</h3>
          <div className="space-y-2">
            {['narrow-body', 'wide-body', 'regional', 'turboprop', 'cargo', 'business-jet'].map(category => (
              <label key={category} className="flex items-center">
                <input
                  type="checkbox"
                  checked={activeFilters.category?.includes(category) || false}
                  onChange={(e) => {
                    const currentCategories = activeFilters.category || [];
                    if (e.target.checked) {
                      setFilters({ category: [...currentCategories, category] });
                    } else {
                      setFilters({ category: currentCategories.filter(c => c !== category) });
                    }
                  }}
                  className="mr-2 glass-checkbox rounded"
                />
                <span className="text-gray-300 capitalize">{category.replace('-', ' ')}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Manufacturer filters */}
        <div>
          <h3 className="text-lg font-medium text-white mb-3">Manufacturer</h3>
          <select
            multiple
            value={activeFilters.manufacturer || []}
            onChange={(e) => {
              const options = Array.from(e.target.selectedOptions, option => option.value);
              setFilters({ manufacturer: options });
            }}
            className="w-full glass-dropdown text-white p-2 rounded border border-gray-600 bg-slate-800/50"
          >
            {['Airbus', 'Boeing', 'Embraer', 'ATR', 'McDonnell Douglas', 'Dassault'].map(manufacturer => (
              <option key={manufacturer} value={manufacturer} className="bg-slate-800 text-white">
                {manufacturer}
              </option>
            ))}
          </select>
        </div>

        {/* Price range */}
        <div>
          <h3 className="text-lg font-medium text-white mb-3">Price Range</h3>
          <div className="flex gap-2 items-center">
            <input
              type="number"
              value={priceMin}
              onChange={(e) => {
                const newValue = Number(e.target.value);
                setPriceMin(newValue);
                updatePriceRange();
              }}
              placeholder="Min"
              className="glass-input w-24 p-2 rounded text-white flex-1"
            />
            <span className="text-gray-400">to</span>
            <input
              type="number"
              value={priceMax}
              onChange={(e) => {
                const newValue = Number(e.target.value);
                setPriceMax(newValue);
                updatePriceRange();
              }}
              placeholder="Max"
              className="glass-input w-24 p-2 rounded text-white flex-1"
            />
          </div>
        </div>

        {/* Minimum capacity */}
        <div>
          <h3 className="text-lg font-medium text-white mb-3">Minimum Capacity</h3>
            <input
              type="number"
              value={capacityMin}
              onChange={(e) => {
                const newValue = Number(e.target.value);
                setCapacityMin(newValue);
                updateCapacityMin();
              }}
              placeholder="Seats"
              className="glass-input w-full p-2 rounded text-white"
            />
        </div>

        {/* Minimum range */}
        <div>
          <h3 className="text-lg font-medium text-white mb-3">Minimum Range (km)</h3>
            <input
              type="number"
              value={rangeMin}
              onChange={(e) => {
                const newValue = Number(e.target.value);
                setRangeMin(newValue);
                updateRangeMin();
              }}
              placeholder="Range"
              className="glass-input w-full p-2 rounded text-white"
            />
        </div>

        {/* Used-specific filters */}
        {activeFilters.conditionGrade && (
          <div>
            <h3 className="text-lg font-medium text-white mb-3">Condition</h3>
            <div className="space-y-2">
              {Object.values(ConditionGrade).map(condition => (
                <label key={condition} className="flex items-center">
                  <input
                    type="checkbox"
                    checked={activeFilters.conditionGrade?.includes(condition as ConditionGrade) || false}
                    onChange={(e) => {
                      const currentConditions = activeFilters.conditionGrade || [];
                      if (e.target.checked) {
                        setFilters({ conditionGrade: [...currentConditions, condition] });
                      } else {
                        setFilters({ conditionGrade: currentConditions.filter(c => c !== condition) });
                      }
                    }}
                    className="mr-2 glass-checkbox rounded"
                  />
                  <span className={`text-gray-300 ${getConditionClass(condition)}`}>
                    {formatCondition(condition)}
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Year built range (used only) */}
        <div>
          <h3 className="text-lg font-medium text-white mb-3">Year Built</h3>
            <input
              type="number"
              value={yearBuiltFrom}
              onChange={(e) => {
                const newValue = Number(e.target.value);
                setYearBuiltFrom(newValue);
                updateYearBuiltFrom();
              }}
              placeholder="From year"
              min="1960"
              max={new Date().getFullYear()}
              className="glass-input w-full p-2 rounded text-white"
            />
        </div>

        {/* Flight hours (used only) */}
        <div>
          <h3 className="text-lg font-medium text-white mb-3">Max Flight Hours</h3>
            <input
              type="number"
              value={flightHoursMax}
              onChange={(e) => {
                const newValue = Number(e.target.value);
                setFlightHoursMax(newValue);
                updateFlightHoursMax();
              }}
              placeholder="Hours"
              className="glass-input w-full p-2 rounded text-white"
            />
        </div>

        {/* Action buttons */}
        <div className="flex gap-3 pt-4">
          <button
            type="button"
            onClick={clearAllFilters}
            className="bg-red-600/30 border border-red-500 text-red-300 px-4 py-2 rounded-lg flex-1 hover:bg-red-600/40 transition-colors"
          >
            Clear All
          </button>
        </div>
      </form>
    </div>
  );
}

// Helper functions for condition formatting
function getConditionClass(condition: string): string {
  const classMap = {
    [ConditionGrade.Excellent]: 'condition-excellent',
    [ConditionGrade.VeryGood]: 'condition-very-good',
    [ConditionGrade.Good]: 'condition-good',
    [ConditionGrade.Fair]: 'condition-fair',
    [ConditionGrade.Poor]: 'condition-poor'
  };
  return classMap[condition as ConditionGrade] || '';
}

function formatCondition(condition: string): string {
  const formatted = condition.replace(/([A-Z])/g, ' $1');
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}