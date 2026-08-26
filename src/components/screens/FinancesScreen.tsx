import { useState } from 'react';
import { useGameStore } from '@store/gameStore';
import { formatCurrency } from '@utils/helpers';
import { DollarSign, TrendingUp, TrendingDown, Wallet, BarChart3, PiggyBank, Settings2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { ChartPanel, ChartTooltip, compactMoney } from '@/components/charts/ChartPanel';
import LoanManagementModal from '@/components/LoanManagementModal';

export function FinancesScreen() {
  const airline = useGameStore((state) => state.airline);
  const currencyFormat = useGameStore((state) => state.settings.currencyFormat);
  const [managedLoanId, setManagedLoanId] = useState<string | null>(null);

  if (!airline) return null;

  const { finances } = airline;
  // Only show active (unpaid) loans; fully repaid loans are hidden.
  const activeLoans = (finances.loans ?? []).filter((loan) => loan.remainingBalance > 0);
  const managedLoan = managedLoanId
    ? (finances.loans ?? []).find((l) => l.id === managedLoanId) ?? null
    : null;
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
      {/* Monthly performance chart */}
      {(() => {
        const reports = finances.monthlyReports.slice(-8).map((r) => ({
          month: new Date(r.month).toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
          revenue: Math.round(r.revenue),
          expenses: Math.round(r.expenses),
          profit: Math.round(r.profit),
        }));
        if (reports.length === 0) return null;
        return (
          <ChartPanel title="Monthly Performance" subtitle="revenue vs expenses, last 8 months" icon={<BarChart3 className="w-4 h-4 text-sky-400" />}>
            <ResponsiveContainer width="100%" height={240}>
              <ComposedChart data={reports} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => compactMoney(Number(v))} width={52} />
                <Tooltip content={<ChartTooltip valueFormatter={compactMoney} />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                <Bar dataKey="revenue" name="Revenue" fill="#34d399" radius={[3, 3, 0, 0]} maxBarSize={28} />
                <Bar dataKey="expenses" name="Expenses" fill="#fb7185" radius={[3, 3, 0, 0]} maxBarSize={28} />
                <Line dataKey="profit" name="Profit" stroke="#38bdf8" strokeWidth={2} dot={{ r: 2.5, fill: '#38bdf8' }} />
              </ComposedChart>
            </ResponsiveContainer>
          </ChartPanel>
        );
      })()}
      <div className="glass-panel p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Profit and Loss</h2>
          <BarChart3 className="w-5 h-5 text-runway-400" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 rounded-lg bg-runway-800/50">
            <p className="text-xs text-runway-400 mb-1">Net Profit</p>
            <p className={`text-2xl font-bold ${isProfit ? 'text-green-400' : 'text-red-400'}`}>{isProfit ? '+' : ''}{formatCurrency(profit, currencyFormat)}</p>
          </div>
          <div className="p-4 rounded-lg bg-runway-800/50">
            <p className="text-xs text-runway-400 mb-1">Assets</p>
            <p className="text-2xl font-bold text-white">{formatCurrency(finances.assets, currencyFormat)}</p>
          </div>
          <div className="p-4 rounded-lg bg-runway-800/50">
            <p className="text-xs text-runway-400 mb-1">Liabilities</p>
            <p className="text-2xl font-bold text-white">{formatCurrency(finances.liabilities, currencyFormat)}</p>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass-panel p-6">
          <div className="flex items-center gap-2 mb-4">
            <PiggyBank className="w-5 h-5 text-amber-400" />
            <h2 className="text-lg font-semibold text-white">Loans</h2>
          </div>
          {activeLoans.length === 0 ? (
            <p className="text-sm text-runway-400 text-center py-8">No active loans.</p>
          ) : (
            <div className="space-y-2">
              {activeLoans.map((loan) => {
                const aircraft = loan.aircraftId ? airline.fleet.find((a) => a.id === loan.aircraftId) : null;
                return (
                  <div key={loan.id} className="p-3 rounded-lg bg-runway-800/50">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-medium text-white">
                        {loan.loanNumber ?? 'Loan'}
                        {aircraft && <span className="ml-2 text-xs text-runway-400 font-normal">{aircraft.registration}</span>}
                      </p>
                      <button
                        onClick={() => setManagedLoanId(loan.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium transition-colors"
                      >
                        <Settings2 className="w-3.5 h-3.5" /> Manage
                      </button>
                    </div>
                    <div className="flex items-center justify-between text-xs text-runway-400">
                      <span>{loan.interestRate}% APR</span>
                      <span>Monthly: {formatCurrency(loan.monthlyPayment, currencyFormat)}</span>
                      <span>Remaining: {formatCurrency(loan.remainingBalance, currencyFormat)}</span>
                    </div>
                  </div>
                );
              })}
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
                    <span>Initial: {formatCurrency(inv.initialValue, currencyFormat)}</span>
                    <span className={inv.value >= inv.initialValue ? 'text-green-400' : 'text-red-400'}>Current: {formatCurrency(inv.value, currencyFormat)}</span>
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
                <div><p className="text-xs text-runway-500">Revenue</p><p className="text-sm font-medium text-green-400">{formatCurrency(report.revenue, currencyFormat, true)}</p></div>
                <div><p className="text-xs text-runway-500">Expenses</p><p className="text-sm font-medium text-red-400">{formatCurrency(report.expenses, currencyFormat, true)}</p></div>
                <div><p className="text-xs text-runway-500">Profit</p><p className={`text-sm font-medium ${report.profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>{formatCurrency(report.profit, currencyFormat, true)}</p></div>
                <div><p className="text-xs text-runway-500">Passengers</p><p className="text-sm font-medium text-white">{report.passengerCount.toLocaleString()}</p></div>
              </div>
            ))}
          </div>
        )}
      </div>

      {managedLoan && (
        <LoanManagementModal
          loan={managedLoan}
          aircraft={managedLoan.aircraftId ? airline.fleet.find((a) => a.id === managedLoan.aircraftId) ?? null : null}
          cash={finances.cash}
          onClose={() => setManagedLoanId(null)}
        />
      )}
    </div>
  );
}
