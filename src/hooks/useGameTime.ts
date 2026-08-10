import { useEffect } from 'react';
import useFleetStore from '../store/fleetSlice';

/**
 * Hook to integrate used marketplace refresh with game time engine
 */
export function useGameTimeMarketplaceRefresh() {
  const { refreshUsedMarketplace } = useFleetStore();

  // In a real implementation, this would hook into the game's time system
  // For now, we'll simulate weekly refreshes for demonstration purposes

  useEffect(() => {
    // Simulate weekly marketplace refresh (every 7 days)
    const interval = setInterval(() => {
      console.log('Refreshing used marketplace...');
      refreshUsedMarketplace();
    }, 7 * 24 * 60 * 60 * 1000); // 7 days in milliseconds

    return () => clearInterval(interval);
  }, [refreshUsedMarketplace]);

  return {
    refreshUsedMarketplace
  };
}