import { useGameStore } from '@store/gameStore';

import { PlaneTakeoff, Rocket, TrendingUp, Users, Globe, Star, ChevronRight } from 'lucide-react';
import { motion } from 'framer-motion';

export function WelcomeScreen() {
  const navigateTo = useGameStore((state) => state.navigateTo);
  
  // Defensive check for navigateTo function
  if (typeof navigateTo !== 'function') {
    console.error('navigateTo is not a function:', typeof navigateTo);
    return (
      <div className="w-full h-full flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-white mb-2">Loading...</h2>
          <p className="text-sm text-runway-400">Please wait while the game initializes.</p>
        </div>
      </div>
    );
  }

  const features = [
    {
      icon: <PlaneTakeoff className="w-6 h-6" />,
      title: 'Build Your Fleet',
      description: 'Choose from 50+ aircraft types, from regional jets to jumbo jets.',
    },
    {
      icon: <Globe className="w-6 h-6" />,
      title: 'Global Routes',
      description: 'Connect airports worldwide and build your route network.',
    },
    {
      icon: <TrendingUp className="w-6 h-6" />,
      title: 'Financial Strategy',
      description: 'Manage budgets, take loans, and grow your airline empire.',
    },
    {
      icon: <Users className="w-6 h-6" />,
      title: 'Staff Management',
      description: 'Hire and train pilots, crew, and ground staff.',
    },
  ];

  return (
    <div className="min-h-screen bg-cockpit-bg relative overflow-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-sky-900/20 via-cockpit-bg to-blue-900/20" />
      
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-sky-500/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500/5 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10">
        {/* Hero Section */}
        <div className="max-w-6xl mx-auto px-6 pt-20 pb-16 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-sky-500/10 border border-sky-500/20 mb-8">
              <Star className="w-4 h-4 text-sky-400" />
              <span className="text-sm text-sky-400 font-medium">Airline Management Simulator</span>
            </div>

            <motion.h1
              className="text-6xl md:text-7xl font-bold mb-6"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
            >
              <span className="bg-gradient-to-r from-sky-400 via-blue-400 to-purple-400 bg-clip-text text-transparent">
                Airline Nexus
              </span>
            </motion.h1>

            <motion.p
              className="text-xl text-runway-300 max-w-2xl mx-auto mb-12"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
            >
              Build, manage, and grow your airline from a small startup to a global carrier. 
              Make strategic decisions, navigate challenges, and dominate the skies.
            </motion.p>

            <motion.div
              className="flex items-center justify-center gap-4"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
            >
              <button
                onClick={() => {
                  // Add defensive check before calling navigateTo
                  if (typeof navigateTo === 'function') {
                    navigateTo('airline-setup');
                  } else {
                    console.error('navigateTo function is not available');
                  }
                }}
                className="group flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white font-semibold rounded-xl shadow-lg shadow-sky-500/25 transition-all duration-300 hover:scale-105 hover:shadow-xl hover:shadow-sky-500/30"
              >
                <Rocket className="w-5 h-5 group-hover:animate-bounce" />
                Start Your Airline
                <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </button>
            </motion.div>
          </motion.div>
        </div>

        {/* Features Grid */}
        <div className="max-w-6xl mx-auto px-6 pb-20">
          <motion.div
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
          >
            {features.map((feature, index) => (
              <motion.div
                key={index}
                className="glass-panel p-6 card-hover"
                whileHover={{ y: -5 }}
                transition={{ type: 'spring', stiffness: 300 }}
              >
                <div className="w-12 h-12 rounded-lg bg-sky-500/10 flex items-center justify-center text-sky-400 mb-4">
                  {feature.icon}
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">{feature.title}</h3>
                <p className="text-sm text-runway-400">{feature.description}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>

        {/* Stats Bar */}
        <div className="max-w-6xl mx-auto px-6 pb-20">
          <motion.div
            className="glass-panel p-8"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.5 }}
          >
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
              <div>
                <p className="text-3xl font-bold text-gradient mb-1">50+</p>
                <p className="text-sm text-runway-400">Aircraft Types</p>
              </div>
              <div>
                <p className="text-3xl font-bold text-gradient mb-1">25+</p>
                <p className="text-sm text-runway-400">World Airports</p>
              </div>
              <div>
                <p className="text-3xl font-bold text-gradient mb-1">6</p>
                <p className="text-sm text-runway-400">Continents</p>
              </div>
              <div>
                <p className="text-3xl font-bold text-gradient mb-1">∞</p>
                <p className="text-sm text-runway-400">Possibilities</p>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
