import { useGameStore } from '@store/gameStore';
import { Layout } from '@components/layout/Layout';
import { WelcomeScreen } from '@components/screens/WelcomeScreen';
import { AirlineSetupScreen } from '@components/screens/AirlineSetupScreen';
import { DashboardScreen } from '@components/screens/DashboardScreen';
import { FleetScreen } from '@components/screens/FleetScreen';
import { StaffScreen } from '@components/screens/StaffScreen';
import { RoutesScreen } from '@components/screens/RoutesScreen';
import { TimetableScreen } from '@components/screens/TimetableScreen';
import { FinancesScreen } from '@components/screens/FinancesScreen';
import { FuelScreen } from '@components/screens/FuelScreen';
import { SettingsScreen } from '@components/screens/SettingsScreen';
import { NotificationsScreen } from '@components/screens/NotificationsScreen';
import { WorldView } from '@components/world/WorldView';
import FleetMarketplace from './components/FleetMarketplace';

function App() {
  const currentScreen = useGameStore((state) => state.currentScreen);
  const airline = useGameStore((state) => state.airline);

  // Defensive check for state
  if (typeof currentScreen !== 'string') {
    console.error('Invalid currentScreen value:', currentScreen);
    return (
      <div className="w-full h-screen flex items-center justify-center bg-black">
        <div className="text-center">
          <p className="text-white">Loading application...</p>
        </div>
      </div>
    );
  }

  // Check if we're in welcome or airline setup screens
  if (!airline && (currentScreen === 'welcome' || currentScreen === 'airline-setup')) {
    return (
      <>
        {currentScreen === 'welcome' && <WelcomeScreen />}
        {currentScreen === 'airline-setup' && <AirlineSetupScreen />}
      </>
    );
  }

  // Ensure we have a valid airline before rendering other screens
  if (!airline) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-black">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-white mb-2">Loading...</h2>
          <p className="text-runway-400">Please wait while the game loads.</p>
        </div>
      </div>
    );
  }

  return (
    <Layout>
      {currentScreen === 'dashboard' && <DashboardScreen />}
      {currentScreen === 'fleet' && <FleetScreen />}
      {currentScreen === 'routes' && <RoutesScreen />}
      {currentScreen === 'timetable' && <TimetableScreen />}
      {currentScreen === 'finances' && <FinancesScreen />}
      {currentScreen === 'fuel' && <FuelScreen />}
      {currentScreen === 'settings' && <SettingsScreen />}
      {currentScreen === 'notifications' && <NotificationsScreen />}
      {currentScreen === 'world' && <WorldView />}
      {currentScreen === 'fleet-marketplace' && <FleetMarketplace />}
      {currentScreen === 'staff' && <StaffScreen />}
      {(currentScreen === 'operations' || currentScreen === 'alliances' || currentScreen === 'events') && (
        <div className='h-full flex items-center justify-center'>
          <div className='text-center'>
            <h2 className='text-2xl font-bold text-white mb-2'>Coming Soon</h2>
            <p className='text-sm text-runway-400'>This screen is under development.</p>
          </div>
        </div>
      )}
    </Layout>
  );
}

export default App;

