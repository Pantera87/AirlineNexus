import { useGameStore } from '@store/gameStore';
import {
  Play,
  Pause,
  FastForward,
  Bell,
  Calendar,
} from 'lucide-react';
import { formatCurrency } from '@utils/helpers';
import { GameTimeEngine } from '@utils/gameTimeEngine';

export function TopBar() {
  const currentDate = useGameStore((state) => state.currentDate);
  const isPaused = useGameStore((state) => state.isPaused);
  const gameSpeed = useGameStore((state) => state.gameSpeed);
  const setGameSpeed = useGameStore((state) => state.setGameSpeed);
  const airline = useGameStore((state) => state.airline);
  const notifications = useGameStore((state) => state.notifications);
  const unreadCount = notifications.filter((n) => !n.isRead).length;

  // Use GameTimeEngine to display date and time
  const safeCurrentDate = currentDate && currentDate instanceof Date ? currentDate : new Date();
  const gameTimeEngine = new GameTimeEngine(safeCurrentDate);
  const displayDateTime = gameTimeEngine.getDisplayDateTime();

  const speedButtons = [
    { label: 'Paused', speed: 'paused' as const, icon: Pause },
    { label: 'Normal', speed: 'normal' as const, icon: Play },
    { label: 'Fast', speed: 'fast' as const, icon: FastForward },
    { label: 'Fastest', speed: 'fastest' as const, icon: FastForward },
  ];

  return (
    <header className="h-16 bg-cockpit-panel/80 backdrop-blur-sm border-b border-white/5 px-6 flex items-center justify-between">
      {/* Left: Date & Time */}
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2 text-runway-300">
          <Calendar className="w-4 h-4" />
          <span className="text-sm font-medium">
            {displayDateTime}
          </span>
        </div>

        {/* Game Speed Controls */}
        <div className="flex items-center gap-1 bg-runway-800 rounded-lg p-1">
          {speedButtons.map(({ label, speed, icon: Icon }) => (
            <button
              key={speed}
              onClick={() => setGameSpeed(speed)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-200 ${
                gameSpeed === speed
                  ? 'bg-sky-500/20 text-sky-400'
                  : 'text-runway-400 hover:text-white hover:bg-white/5'
              }`}
              title={label}
            >
              <Icon className="w-3.5 h-3.5" />
            </button>
          ))}
        </div>
      </div>

      {/* Right: Cash & Notifications */}
      <div className="flex items-center gap-4">
        {/* Cash Display */}
        {airline && (
          <div className="flex items-center gap-2 px-4 py-2 bg-runway-800 rounded-lg">
            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-sm font-mono font-semibold text-green-400">
              {formatCurrency(airline.finances.cash, useGameStore((state) => state.settings.currencyFormat))}
            </span>
          </div>
        )}

        {/* Notifications */}
        <button className="relative p-2 text-runway-400 hover:text-white transition-colors">
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 rounded-full text-[10px] flex items-center justify-center text-white font-bold">
              {unreadCount}
            </span>
          )}
        </button>

        {/* Status Indicator */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-runway-800">
          <div
            className={`w-2 h-2 rounded-full ${
              isPaused ? 'bg-yellow-400' : 'bg-green-400 animate-pulse'
            }`}
          />
          <span className="text-xs text-runway-300 capitalize">
            {isPaused ? 'Paused' : gameSpeed}
          </span>
        </div>
      </div>
    </header>
  );
}
