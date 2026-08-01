import { useGameStore } from '@store/gameStore';
import { Settings, Bell, Volume2, Music, HelpCircle, DollarSign, Calendar, RotateCcw } from 'lucide-react';
import { motion } from 'framer-motion';

export function SettingsScreen() {
  const settings = useGameStore((state) => state.settings);
  const updateSettings = useGameStore((state) => state.updateSettings);
  const resetGame = useGameStore((state) => state.resetGame);
  const difficulty = useGameStore((state) => state.difficulty);
  const setDifficulty = useGameStore((state) => state.setDifficulty);

  const toggleSetting = (key: keyof typeof settings) => {
    updateSettings({ [key]: !settings[key] });
  };

  const settingItems = [
    { key: 'notificationsEnabled' as const, label: 'Notifications', description: 'Receive in-game alerts and notifications', icon: <Bell className="w-5 h-5" /> },
    { key: 'soundEnabled' as const, label: 'Sound Effects', description: 'Play sound effects for actions', icon: <Volume2 className="w-5 h-5" /> },
    { key: 'musicEnabled' as const, label: 'Background Music', description: 'Play ambient background music', icon: <Music className="w-5 h-5" /> },
    { key: 'showTooltips' as const, label: 'Tooltips', description: 'Show helpful tooltips on hover', icon: <HelpCircle className="w-5 h-5" /> },
  ];

  const difficulties = [
    { id: 'easy' as const, label: 'Easy', description: 'More cash, fewer events' },
    { id: 'normal' as const, label: 'Normal', description: 'Balanced gameplay' },
    { id: 'hard' as const, label: 'Hard', description: 'Less cash, more challenges' },
    { id: 'realistic' as const, label: 'Realistic', description: 'True-to-life difficulty' },
  ];

  return (
    <div className="h-full overflow-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-sm text-runway-400">Configure your game experience</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="glass-panel p-6">
          <div className="flex items-center gap-2 mb-4">
            <Settings className="w-5 h-5 text-sky-400" />
            <h2 className="text-lg font-semibold text-white">General Settings</h2>
          </div>
          <div className="space-y-3">
            {settingItems.map((item) => (
              <div key={item.key} className="flex items-center justify-between p-3 rounded-lg bg-runway-800/50">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-sky-500/10 flex items-center justify-center text-sky-400">{item.icon}</div>
                  <div>
                    <p className="text-sm font-medium text-white">{item.label}</p>
                    <p className="text-xs text-runway-400">{item.description}</p>
                  </div>
                </div>
                <button onClick={() => toggleSetting(item.key)} className={`relative w-12 h-6 rounded-full transition-colors ${settings[item.key] ? 'bg-sky-500' : 'bg-runway-600'}`}>
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${settings[item.key] ? 'translate-x-6' : 'translate-x-0'}`} />
                </button>
              </div>
            ))}
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.1 }} className="glass-panel p-6">
          <div className="flex items-center gap-2 mb-4">
            <DollarSign className="w-5 h-5 text-amber-400" />
            <h2 className="text-lg font-semibold text-white">Display Preferences</h2>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-runway-300 mb-2">Currency Format</label>
              <select value={settings.currencyFormat} onChange={(e) => updateSettings({ currencyFormat: e.target.value as 'USD' | 'EUR' | 'GBP' })} className="input-field">
                <option value="USD">USD - US Dollar ($)</option>
                <option value="EUR">EUR - Euro</option>
                <option value="GBP">GBP - British Pound</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-runway-300 mb-2">Date Format</label>
              <select value={settings.dateFormat} onChange={(e) => updateSettings({ dateFormat: e.target.value as 'US' | 'EU' })} className="input-field">
                <option value="US">US Format (Month Day, Year)</option>
                <option value="EU">EU Format (Day Month Year)</option>
              </select>
            </div>
          </div>
        </motion.div>
      </div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.2 }} className="glass-panel p-6">
        <div className="flex items-center gap-2 mb-4">
          <Calendar className="w-5 h-5 text-purple-400" />
          <h2 className="text-lg font-semibold text-white">Difficulty</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {difficulties.map((diff) => (
            <button key={diff.id} onClick={() => setDifficulty(diff.id)} className={`p-4 rounded-lg border text-left transition-all ${difficulty === diff.id ? 'border-sky-500 bg-sky-500/10' : 'border-runway-700 hover:border-runway-600'}`}>
              <p className="text-sm font-semibold text-white">{diff.label}</p>
              <p className="text-xs text-runway-400 mt-1">{diff.description}</p>
            </button>
          ))}
        </div>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.3 }} className="glass-panel p-6 border border-red-500/20">
        <div className="flex items-center gap-2 mb-4">
          <RotateCcw className="w-5 h-5 text-red-400" />
          <h2 className="text-lg font-semibold text-white">Reset Game</h2>
        </div>
        <p className="text-sm text-runway-400 mb-4">This will permanently delete your airline and all progress. This action cannot be undone.</p>
        <button onClick={() => { if (confirm('Are you sure you want to reset the game? All progress will be lost.')) resetGame(); }} className="btn-danger">
          Reset Game
        </button>
      </motion.div>
    </div>
  );
}
