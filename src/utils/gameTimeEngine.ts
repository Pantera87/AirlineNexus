/**
 * Enhanced game time engine for airline management simulator
 * Provides date + hour tracking with game-speed-dependent advancement
 */
export class GameTimeEngine {
  private currentDate: Date;
  private currentHour: number;
  private currentMinute: number;
  private currentSecond: number;
  private saveCounter: number = 0;

  constructor(initialDate?: Date) {
    if (initialDate) {
      this.currentDate = new Date(initialDate);
      // Extract hours and minutes from the initial date if they exist
      this.currentHour = initialDate.getHours();
      this.currentMinute = initialDate.getMinutes();
      this.currentSecond = initialDate.getSeconds();
    } else {
      // Default to Jan 1, 2024 as in the existing game state
      this.currentDate = new Date(2024, 0, 1);
      this.currentHour = 0; // Start at hour 0 (midnight)
      this.currentMinute = 0; // Start at minute 0
      this.currentSecond = 0; // Start at second 0
    }
  }

  /**
   * Initialize the time engine from the database
   */
  static async initializeFromDatabase(): Promise<GameTimeEngine> {
    try {
      const { GameTimeRepository } = await import('@/database/repositories/gameTime.repository');
      const gameTime = await GameTimeRepository.find();

      if (gameTime && gameTime.currentDate) {
        console.log('Initializing GameTimeEngine from database:', gameTime.currentDate);
        return new GameTimeEngine(gameTime.currentDate);
      } else {
        console.log('No game time found in database, using default');
        return new GameTimeEngine();
      }
    } catch (error) {
      console.error('Failed to initialize GameTimeEngine from database:', error);
      // Fallback to default if database access fails
      return new GameTimeEngine();
    }
  }

  /**
   * Save the current time to the database
   */
  async saveToDatabase(): Promise<void> {
    try {
      const { GameTimeRepository } = await import('@/database/repositories/gameTime.repository');
      const currentDate = this.getCurrentDate();

      // Update or create game time record in database
      await GameTimeRepository.setCurrentDate(currentDate);
      console.log('Saved game time to database:', currentDate);
    } catch (error) {
      console.error('Failed to save game time to database:', error);
      // Continue execution even if save fails
    }
  }

  /**
   * Save the current time to the database and return it
   */
  async saveAndGetCurrentDate(): Promise<Date> {
    const currentDate = this.getCurrentDate();
    
    // Only save to database every 60 ticks (every minute at normal speed)
    // to reduce database load
    this.saveCounter++;
    if (this.saveCounter >= 60) {
      await this.saveToDatabase();
      this.saveCounter = 0;
    }
    
    return currentDate;
  }

  /**
   * Gets the current date and time as a JavaScript Date object
   */
  getCurrentDate(): Date {
    const dateCopy = new Date(this.currentDate);
    dateCopy.setHours(this.currentHour, this.currentMinute, this.currentSecond, 0); // Set hours, minutes, and seconds while preserving date
    return dateCopy;
  }

  /**
   * Gets just the date portion (no time component)
   */
  getCurrentDateOnly(): Date {
    return new Date(this.currentDate);
  }

  /**
   * Gets the current hour (0-23)
   */
  getCurrentHour(): number {
    return this.currentHour;
  }

  /**
   * Gets the current minute (0-59)
   */
  getCurrentMinute(): number {
    return this.currentMinute;
  }

    /**
     * Advances time based on game speed
     * @param gameSpeed Current game speed setting
     */
    advanceTimeBySpeed(gameSpeed: 'paused' | 'normal' | 'fast' | 'fastest'): void {
      if (gameSpeed === 'paused') {
        return;
      }

      // Calculate the actual time increment based on speed
      switch (gameSpeed) {
        case 'normal':
          // 1 game second per 1 second real time (real-time progression)
          this.currentSecond += 1;
          if (this.currentSecond >= 60) {
            this.currentSecond = 0;
            this.addMinutes(1);
          }
          break;
        case 'fast':
          // 1 game minute per 1 second real time (60x faster than normal)
          this.addMinutes(1);
          break;
        case 'fastest':
          // 1 game hour per 1 second real time (3600x faster than normal)
          this.addHours(1);
          break;
      }
    }

   /**
    * Adds hours to the current time (helper method)
    */
   private addHours(hours: number): void {
     this.currentHour += hours;
     const daysToAdd = Math.floor(this.currentHour / 24);
     if (daysToAdd !== 0) {
       this.currentDate.setDate(this.currentDate.getDate() + daysToAdd);
       this.currentHour = ((this.currentHour % 24) + 24) % 24;
     }
   }

   /**
    * Adds minutes to the current time (helper method)
    */
   private addMinutes(minutes: number): void {
     this.currentMinute += minutes;
     const totalMinutes = this.currentMinute;
     
     // Calculate hours and minutes using modulo
     const hoursToAdd = Math.floor(totalMinutes / 60);
     this.currentMinute = ((totalMinutes % 60) + 60) % 60;
     
     // Add hours using addHours method
     if (hoursToAdd !== 0) {
       this.addHours(hoursToAdd);
     }
   }

  /**
   * Sets the current date and time
   */
  setCurrentDateTime(date: Date, hour: number, minute: number = 0): void {
    this.currentDate = new Date(date);
    this.currentHour = Math.max(0, Math.min(23, hour)); // Clamp to valid hour range
    this.currentMinute = Math.max(0, Math.min(59, minute)); // Clamp to valid minute range
  }

  /**
   * Sets just the date (resets time to midnight)
   */
  setCurrentDate(date: Date): void {
    this.currentDate = new Date(date);
    this.currentHour = 0;
    this.currentMinute = 0;
  }

  /**
   * Gets formatted display string for date and time
   */
  getDisplayDateTime(): string {
    const date = this.getCurrentDate();
    return `${date.toLocaleDateString('en-US', { 
      weekday: 'short',
      month: 'short', 
      day: 'numeric', 
      year: 'numeric' 
    })} ${this.currentHour.toString().padStart(2, '0')}:${this.currentMinute.toString().padStart(2, '0')}`;
  }

  /**
   * Gets formatted display string for just the date
   */
  getDisplayDate(): string {
    const date = this.getCurrentDateOnly();
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric' 
    });
  }

  /**
   * Gets formatted display string for just the hour
   */
  getDisplayHour(): string {
    return `${this.currentHour.toString().padStart(2, '0')}:${this.currentMinute.toString().padStart(2, '0')}`;
  }
}
