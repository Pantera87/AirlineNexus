import { useState } from 'react';
import useFleetStore from '../store/fleetSlice';
import { useGameStore } from '../store/gameStore';
import FilterSidebar from './FilterSidebar';
import AircraftGrid from './AircraftGrid';
import AircraftDetailModal from './AircraftDetailModal';
import { ArrowLeft } from 'lucide-react';

export default function FleetMarketplace() {
  const [isFiltersOpen, setIsFiltersOpen] = useState(true);
  const { activeTab, switchTab } = useFleetStore();
  const navigateTo = useGameStore((state) => state.navigateTo);

  return (
    <div className="h-screen bg-linear-to-br from-slate-900 via-slate-800 to-slate-900 relative flex flex-col">
      {/* Background pattern - aircraft silhouette overlay */}
      <div className="absolute inset-0 opacity-5 pointer-events-none">
        <div className="w-full h-full bg-[radial-gradient(circle_at_center,rgba(148,163,255,0.1)_0%,transparent_70%)]" />
      </div>

      {/* Main content */}
      <div className="relative z-10 flex flex-col h-full overflow-hidden">
        {/* Back button */}
        <button
          onClick={() => navigateTo('fleet')}
          className="absolute top-6 left-6 flex items-center gap-2 text-blue-300 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          Back to Fleet Management
        </button>

        {/* Header */}
        <header className="text-center py-6 px-4 shrink-0">
          <h1 className="text-3xl font-bold text-white mb-2">Fleet Marketplace</h1>
          <p className="text-sm text-blue-300 max-w-2xl mx-auto">
            {activeTab === 'new'
              ? 'Purchase brand new aircraft from leading manufacturers'
              : 'Explore pre-owned aircraft with competitive pricing'}
          </p>

          {/* Tab navigation */}
          <div className="mt-4 flex justify-center gap-3">
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
        <div className="flex-1 px-4 pb-6 overflow-hidden flex flex-col">
          <div className="max-w-7xl mx-auto h-full grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Filter sidebar - hidden on mobile, toggleable on desktop */}
            <div className={`h-full min-h-0 ${isFiltersOpen ? 'block' : 'hidden'} lg:col-span-1`}>
              <FilterSidebar
                isOpen={isFiltersOpen}
                setIsOpen={setIsFiltersOpen}
              />
            </div>

            {/* Aircraft grid - takes full width on mobile, 3 cols on desktop */}
            <div className="lg:col-span-3 flex flex-col h-full min-h-0 overflow-hidden">
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