import { useEffect } from 'react';
import { useGameStore } from '../store/gameStore';
import { useFleetStore } from '../store/fleetSlice';

export function useUsedMarketTimer() {
  const currentDate = useGameStore((state) => state.currentDate);
  const gameSpeed = useGameStore((state) => state.gameSpeed);
  const refreshUsedMarketplace = useFleetStore((state) => state.refreshUsedMarketplace);

  // Refresh used marketplace weekly
  useEffect(() => {
    if (gameSpeed === 'paused') return;

    // Check if it's time to refresh (every 7 days)
    const lastRefresh = localStorage.getItem('usedMarketLastRefresh');
    if (!lastRefresh) {
      // First time - refresh immediately
      refreshUsedMarketplace();
      localStorage.setItem('usedMarketLastRefresh', currentDate.toISOString());
      return;
    }

    const lastRefreshDate = new Date(lastRefresh);
    const diffDays = Math.floor(
      (currentDate.getTime() - lastRefreshDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (diffDays >= 7) {
      refreshUsedMarketplace();
      localStorage.setItem('usedMarketLastRefresh', currentDate.toISOString());
    }
  }, [currentDate, gameSpeed, refreshUsedMarketplace]);
}