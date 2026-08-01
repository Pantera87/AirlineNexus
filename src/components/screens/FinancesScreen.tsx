import { useGameStore } from '@store/gameStore';
import { formatCurrency } from '@utils/helpers';
import { DollarSign, TrendingUp, TrendingDown, Wallet, BarChart3, PiggyBank } from 'lucide-react';
import { motion } from 'framer-motion';

export function FinancesScreen() {
  const airline = useGameStore((state) => state.airline);
  const currencyFormat = useGameStore((state) => state.settings.currencyFormat);

  if (!airline) return null;

  const { finances } = airline;
  const profit = finances.totalRevenue - finances.totalExpenses;
  const isProfit = profit >= 0;

  const stats = [
    { label: 'Cash Balance', value: formatCurrency(finances.cash, currencyFormat), icon: <Wallet className="w-5 h-5" />, color: 'text-green-400', bg: 'bg-green-500/10' },
    { label: 'Net Worth', value: formatCurrency(finances.netWorth, currencyFormat), icon: <DollarSign className="w-5 h-5" />, color: 'text-sky-400', bg: 'bg-sky-500/10' },
    { label: 'Total Revenue', value: formatCurrency(finances.totalRevenue, currencyFormat), icon: <TrendingUp className="w-5 h-5" />, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
    { label: 'Total Expenses', value: formatCurrency(finances.totalExpenses, currencyFormat), icon: <TrendingDown className="w-5 h-5" />, color: 'text-red-400', bg: 'bg-red-500/10' },
  ];

  return (
    <div className="h-full overflow-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Financial Overview</h1>
        <p className="text-sm text-runway-400">{airline.name} - Financial Summary</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, index) => (
          <motion.div key={stat.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: index * 0.1 }} className="glass-panel p-5">
            <div className={`w-10 h-10 rounded-lg ${stat.bg} flex items-center justify-center ${stat.color} mb-3`}>{stat.icon}</div>
            <p className="text-2xl font-bold text-white">{stat.value}</p>
            <p className="text-xs text-runway-400 mt-1">{stat.label}</p>
          </motion.div>
        ))}
      </div>
      <div className="glass-panel p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Profit and Loss</h2>
          <BarChart3 className="w-5 h-5 text-runway-400" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 rounded-lg bg-runway-800/50">
            <p className="text-xs text-runway-400 mb-1">Net Profit</p>
            <p className={`text-2xl font-bold ${isProfit ? 'text-green-400' : 'text-red-400'}`}>{isProfit ? '+' : ''}{formatCurrency(profit)}</p>
          </div>
          <div className="p-4 rounded-lg bg-runway-800/50">
            <p className="text-xs text-runway-400 mb-1">Assets</p>
            <p className="text-2xl font-bold text-white">{formatCurrency(finances.assets)}</p>
          </div>
          <div className="p-4 rounded-lg bg-runway-800/50">
            <p className="text-xs text-runway-400 mb-1">Liabilities</p>
            <p className="text-2xl font-bold text-white">{formatCurrency(finances.liabilities)}</p>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass-panel p-6">
          <div className="flex items-center gap-2 mb-4">
            <PiggyBank className="w-5 h-5 text-amber-400" />
            <h2 className="text-lg font-semibold text-white">Loans</h2>
          </div>
          {finances.loans.length === 0 ? (
            <p className="text-sm text-runway-400 text-center py-8">No active loans.</p>
          ) : (
            <div className="space-y-2">
              {finances.loans.map((loan) => (
                <div key={loan.id} className="p-3 rounded-lg bg-runway-800/50">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium text-white">{formatCurrency(loan.amount)}</p>
                    <span className="badge badge-warning">{loan.interestRate}% APR</span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-runway-400">
                    <span>Monthly: {formatCurrency(loan.monthlyPayment)}</span>
                    <span>Remaining: {formatCurrency(loan.remainingBalance)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="glass-panel p-6">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-5 h-5 text-sky-400" />
            <h2 className="text-lg font-semibold text-white">Investments</h2>
          </div>
          {finances.investments.length === 0 ? (
            <p className="text-sm text-runway-400 text-center py-8">No investments.</p>
          ) : (
            <div className="space-y-2">
              {finances.investments.map((inv) => (
                <div key={inv.id} className="p-3 rounded-lg bg-runway-800/50">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium text-white">{inv.name}</p>
                    <span className="badge badge-info">{inv.type}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-runway-400">
                    <span>Initial: {formatCurrency(inv.initialValue)}</span>
                    <span className={inv.value >= inv.initialValue ? 'text-green-400' : 'text-red-400'}>Current: {formatCurrency(inv.value)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="glass-panel p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Monthly Reports</h2>
        {finances.monthlyReports.length === 0 ? (
          <p className="text-sm text-runway-400 text-center py-8">No monthly reports available yet.</p>
        ) : (
          <div className="space-y-2">
            {finances.monthlyReports.slice(-6).reverse().map((report, index) => (
              <div key={index} className="grid grid-cols-2 md:grid-cols-5 gap-3 p-3 rounded-lg bg-runway-800/50 text-center">
                <div><p className="text-xs text-runway-500">Month</p><p className="text-sm font-medium text-white">{new Date(report.month).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</p></div>
                <div><p className="text-xs text-runway-500">Revenue</p><p className="text-sm font-medium text-green-400">{formatCurrency(report.revenue, 'USD', true)}</p></div>
                <div><p className="text-xs text-runway-500">Expenses</p><p className="text-sm font-medium text-red-400">{formatCurrency(report.expenses, 'USD', true)}</p></div>
                <div><p className="text-xs text-runway-500">Profit</p><p className={`text-sm font-medium ${report.profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>{formatCurrency(report.profit, 'USD', true)}</p></div>
                <div><p className="text-xs text-runway-500">Passengers</p><p className="text-sm font-medium text-white">{report.passengerCount.toLocaleString()}</p></div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
