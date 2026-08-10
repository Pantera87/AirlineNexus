import { useState } from 'react';
import useFleetStore from '../store/fleetSlice';
import FilterSidebar from './FilterSidebar';
import AircraftGrid from './AircraftGrid';
import AircraftDetailModal from './AircraftDetailModal';

export default function FleetMarketplace() {
  const [isFiltersOpen, setIsFiltersOpen] = useState(true);
  const { activeTab, switchTab } = useFleetStore();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 relative overflow-hidden">
      {/* Background pattern - aircraft silhouette overlay */}
      <div className="absolute inset-0 opacity-5 pointer-events-none">
        <div className="w-full h-full bg-[radial-gradient(circle_at_center,_rgba(148,163,255,0.1)_0%,_transparent_70%)]" />
      </div>

      {/* Main content */}
      <div className="relative z-10">
        {/* Header */}
        <header className="text-center py-12 px-4">
          <h1 className="text-5xl font-bold text-white mb-4">Fleet Marketplace</h1>
          <p className="text-xl text-blue-300 max-w-2xl mx-auto">
            {activeTab === 'new'
              ? 'Purchase brand new aircraft from leading manufacturers'
              : 'Explore pre-owned aircraft with competitive pricing'}
          </p>

          {/* Tab navigation */}
          <div className="mt-8 flex justify-center gap-4">
            <button
              onClick={() => switchTab('new')}
              className={`glass-tab ${activeTab === 'new' ? 'active' : ''}`}
            >
              Buy New
            </button>
            <button
              onClick={() => switchTab('used')}
              className={`glass-tab ${activeTab === 'used' ? 'active' : ''}`}
            >
              Used Fleet
            </button>
          </div>

          {/* Used market info banner */}
          {activeTab === 'used' && (
            <div className="mt-6 bg-blue-900/50 border border-blue-700 rounded-lg p-3 text-sm text-blue-200">
              ⚠️ New listings available weekly — check back often for fresh inventory!
            </div>
          )}
        </header>

        {/* Main content area */}
        <div className="px-4 pb-12">
          <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-4 gap-8">
            {/* Filter sidebar - hidden on mobile, toggleable on desktop */}
            <div className={`lg:block ${isFiltersOpen ? 'block' : 'hidden'} lg:col-span-1`}>
              <FilterSidebar
                isOpen={isFiltersOpen}
                setIsOpen={setIsFiltersOpen}
              />
            </div>

            {/* Aircraft grid - takes full width on mobile, 3 cols on desktop */}
            <div className="lg:col-span-3">
              <AircraftGrid activeTab={activeTab} />

              {/* Filters toggle button for mobile */}
              <button
                onClick={() => setIsFiltersOpen(!isFiltersOpen)}
                className="fixed bottom-6 right-6 glass-button text-white px-4 py-2 rounded-lg shadow-lg z-50 lg:hidden"
              >
                {isFiltersOpen ? 'Hide Filters' : 'Show Filters'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Detail modal */}
      <AircraftDetailModal />
    </div>
  );
}