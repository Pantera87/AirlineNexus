import { ReactNode } from 'react';
import { useGameStore } from '@store/gameStore';
import {
  LayoutDashboard,
  Plane,
  Map,
  DollarSign,
  Users,
  Settings,
  Globe,
  Bell,
  PlaneTakeoff,
} from 'lucide-react';
import type { MenuItem } from '@/types/game';

const menuItems: MenuItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
  { id: 'fleet', label: 'Fleet', icon: 'fleet' },
  { id: 'routes', label: 'Routes', icon: 'routes' },
  { id: 'finances', label: 'Finances', icon: 'finances' },
  { id: 'staff', label: 'Staff', icon: 'staff' },
  { id: 'operations', label: 'Operations', icon: 'operations' },
  { id: 'alliances', label: 'Alliances', icon: 'alliances' },
  { id: 'world', label: 'World View', icon: 'world' },
  { id: 'notifications', label: 'Notifications', icon: 'notifications' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
];

const iconMap: Record<string, ReactNode> = {
  dashboard: <LayoutDashboard className="w-5 h-5" />,
  fleet: <Plane className="w-5 h-5" />,
  routes: <Map className="w-5 h-5" />,
  finances: <DollarSign className="w-5 h-5" />,
  staff: <Users className="w-5 h-5" />,
  operations: <PlaneTakeoff className="w-5 h-5" />,
  alliances: <Globe className="w-5 h-5" />,
  world: <Globe className="w-5 h-5" />,
  settings: <Settings className="w-5 h-5" />,
  notifications: <Bell className="w-5 h-5" />,
};

export function Sidebar() {
  const currentScreen = useGameStore((state) => state.currentScreen);
  const navigateTo = useGameStore((state) => state.navigateTo);
  const airline = useGameStore((state) => state.airline);

  return (
    <aside className="w-64 bg-cockpit-panel border-r border-white/5 flex flex-col">
      {/* Logo */}
      <div className="p-6 border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center">
            <PlaneTakeoff className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gradient">Airline Nexus</h1>
            <p className="text-xs text-runway-400">Airline Simulator</p>
          </div>
        </div>
      </div>

      {/* Airline Info */}
      {airline && (
        <div className="px-4 py-3 mx-3 mt-3 rounded-lg bg-runway-800/50">
          <p className="text-sm font-medium text-white truncate">{airline.name}</p>
          <p className="text-xs text-runway-400">
            {airline.iataCode} • {airline.businessModel}
          </p>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-auto">
        {menuItems.map((item) => {
          const isActive = currentScreen === item.id;
          return (
            <button
              key={item.id}
              onClick={() => navigateTo(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                isActive
                  ? 'bg-sky-500/10 text-sky-400'
                  : 'text-runway-400 hover:text-white hover:bg-white/5'
              }`}
            >
              {iconMap[item.icon]}
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Bottom Section */}
      <div className="p-4 border-t border-white/5">
        <div className="glass-panel p-3">
          <p className="text-xs text-runway-400 mb-1">Quick Tip</p>
          <p className="text-xs text-runway-300">
            Start by purchasing your first aircraft from the Fleet screen.
          </p>
        </div>
      </div>
    </aside>
  );
}

