import React, { useEffect } from 'react';
import { DatabaseInitializer } from '@/database/init';
import { useGameStore } from '@/store/gameStore';

interface DatabaseInitializerWrapperProps {
  children: React.ReactNode;
}

export const DatabaseInitializerWrapper: React.FC<DatabaseInitializerWrapperProps> = ({ children }) => {
  const setCurrentDate = useGameStore((state) => state.setCurrentDate);

  useEffect(() => {
    const initializeDatabase = async () => {
      try {
        console.log('Initializing database...');
        await DatabaseInitializer.initialize();

        // Load date from database and update store
        const dbDate = await DatabaseInitializer.getCurrentDate();
        if (dbDate) {
          console.log('Loaded date from database:', dbDate);
          setCurrentDate(dbDate);
        } else {
          console.log('No date found in database, using default');
          // Save the default date to database for future use
          const defaultDate = new Date(2024, 0, 1);
          await DatabaseInitializer.setCurrentDate(defaultDate);
          setCurrentDate(defaultDate);
        }
      } catch (error) {
        console.error('Failed to initialize database:', error);
      }
    };

    initializeDatabase();
  }, [setCurrentDate]);

  return <>{children}</>;
};
