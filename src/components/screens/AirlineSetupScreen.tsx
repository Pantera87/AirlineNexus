import { useState } from 'react';
import { useGameStore } from '@store/gameStore';
import { AIRPORT_DATABASE } from '@data/airports';
import type { BusinessModel } from '@/types/game';
import { PlaneTakeoff, ChevronRight, Check } from 'lucide-react';
import { motion } from 'framer-motion';

const businessModels: { id: BusinessModel; label: string; description: string }[] = [
  { id: 'low-cost', label: 'Low-Cost Carrier', description: 'Affordable fares, high volume, no frills.' },
  { id: 'full-service', label: 'Full-Service Carrier', description: 'Premium service with included amenities.' },
  { id: 'luxury', label: 'Luxury Airline', description: 'Top-tier luxury and exclusive service.' },
  { id: 'cargo', label: 'Cargo Airline', description: 'Focus on freight and logistics.' },
  { id: 'hybrid', label: 'Hybrid Model', description: 'A mix of low-cost and full-service.' },
];

export function AirlineSetupScreen() {
  const startGame = useGameStore((state) => state.startGame);
  const [name, setName] = useState('');
  const [iataCode, setIataCode] = useState('');
  const [icaoCode, setIcaoCode] = useState('');
  const [headquarters, setHeadquarters] = useState('JFK');
  const [businessModel, setBusinessModel] = useState<BusinessModel>('full-service');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!name.trim()) newErrors.name = 'Airline name is required';
    if (!iataCode.trim() || iataCode.length !== 2) newErrors.iataCode = 'IATA code must be 2 characters';
    if (!icaoCode.trim() || icaoCode.length !== 3) newErrors.icaoCode = 'ICAO code must be 3 characters';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = () => {
    if (!validate()) return;
    startGame({
      name: name.trim(),
      iataCode: iataCode.toUpperCase().trim(),
      icaoCode: icaoCode.toUpperCase().trim(),
      headquarters,
      businessModel,
    });
  };

  return (
    <div className="min-h-screen bg-cockpit-bg flex items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-2xl"
      >
        <div className="glass-panel p-8">
          {/* Header */}
          <div className="flex items-center gap-3 mb-8">
            <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center">
              <PlaneTakeoff className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Create Your Airline</h1>
              <p className="text-sm text-runway-400">Set up your carrier to begin operations</p>
            </div>
          </div>

          {/* Form */}
          <div className="space-y-6">
            {/* Airline Name */}
            <div>
              <label className="block text-sm font-medium text-runway-300 mb-2">Airline Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. SkyHigh Airlines"
                className="input-field"
              />
              {errors.name && <p className="text-xs text-red-400 mt-1">{errors.name}</p>}
            </div>

            {/* IATA & ICAO Codes */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-runway-300 mb-2">IATA Code (2 chars)</label>
                <input
                  type="text"
                  value={iataCode}
                  onChange={(e) => setIataCode(e.target.value.slice(0, 2))}
                  placeholder="e.g. SH"
                  className="input-field uppercase"
                />
                {errors.iataCode && <p className="text-xs text-red-400 mt-1">{errors.iataCode}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-runway-300 mb-2">ICAO Code (3 chars)</label>
                <input
                  type="text"
                  value={icaoCode}
                  onChange={(e) => setIcaoCode(e.target.value.slice(0, 3))}
                  placeholder="e.g. SKH"
                  className="input-field uppercase"
                />
                {errors.icaoCode && <p className="text-xs text-red-400 mt-1">{errors.icaoCode}</p>}
              </div>
            </div>

            {/* Headquarters */}
            <div>
              <label className="block text-sm font-medium text-runway-300 mb-2">Headquarters (Hub Airport)</label>
              <select
                value={headquarters}
                onChange={(e) => setHeadquarters(e.target.value)}
                className="input-field"
              >
                {AIRPORT_DATABASE.map((airport) => (
                  <option key={airport.iata} value={airport.iata}>
                    {airport.iata} - {airport.name} ({airport.city}, {airport.country})
                  </option>
                ))}
              </select>
            </div>

            {/* Business Model */}
            <div>
              <label className="block text-sm font-medium text-runway-300 mb-3">Business Model</label>
              <div className="grid grid-cols-1 gap-2">
                {businessModels.map((model) => (
                  <button
                    key={model.id}
                    onClick={() => setBusinessModel(model.id)}
                    className={`flex items-center justify-between p-3 rounded-lg border transition-all duration-200 ${
                      businessModel === model.id
                        ? 'border-sky-500 bg-sky-500/10'
                        : 'border-runway-700 hover:border-runway-600'
                    }`}
                  >
                    <div className="text-left">
                      <p className="text-sm font-medium text-white">{model.label}</p>
                      <p className="text-xs text-runway-400">{model.description}</p>
                    </div>
                    {businessModel === model.id && <Check className="w-5 h-5 text-sky-400" />}
                  </button>
                ))}
              </div>
            </div>

            {/* Submit */}
            <button
              onClick={handleSubmit}
              className="group w-full flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white font-semibold rounded-xl shadow-lg shadow-sky-500/25 transition-all duration-300 hover:scale-[1.02]"
            >
              Launch Airline
              <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}