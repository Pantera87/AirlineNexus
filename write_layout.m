import fs from 'fs';

const content = `import { ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { useGameStore } from '@store/gameStore';
import { useGameLoop } from '@hooks/useGameLoop';
import { motion, AnimatePresence } from 'framer-motion';

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const isPaused = useGameStore((state) => state.isPaused);
  const currentScreen = useGameStore((state) => state.currentScreen);

  // Run the game loop to advance time based on game speed
  useGameLoop();

  return (
    <div className="flex h-screen w-full bg-cockpit-bg overflow-hidden select-none">
      {/* Sidebar */}
      <Sidebar />

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col relative overflow-hidden">
        <TopBar />

        <div className="flex-1 relative overflow-hidden">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentScreen}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className={\`h-full w-full transition-colors duration-1000 \${isPaused ? 'bg-runway-900/50' : 'bg-transparent'}\`}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
`;

fs.writeFileSync('src/components/layout/Layout.tsx', content, 'utf8');
console.log('Layout.tsx written successfully');