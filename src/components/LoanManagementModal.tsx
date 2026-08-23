import { useState } from 'react';
import type { Aircraft, Loan } from '@/types/game';
import { useGameStore } from '@/store/gameStore';
import { formatCurrency } from '@/utils/helpers';

// Offered refinance rates (percent APR). In a full economy sim these would be
// derived from the airline's credit rating / reputation + world economic index.
const REFINANCE_RATE_OPTIONS = [4.25, 5.0, 5.75];
const TERM_MONTH_OPTIONS = [24, 36, 48, 60, 72, 96];

function calculateMonthlyPayment(principal: number, annualRatePercent: number, months: number): number {
  const monthlyRate = annualRatePercent / 12 / 100;
  if (principal <= 0 || months <= 0) return 0;
  if (monthlyRate === 0) return principal / months;
  return (principal * (monthlyRate * Math.pow(1 + monthlyRate, months))) / (Math.pow(1 + monthlyRate, months) - 1);
}

interface LoanManagementModalProps {
  loan: Loan;
  aircraft?: Aircraft | null;
  cash: number;
  onClose: () => void;
}

type Tab = 'payoff' | 'prepay' | 'refinance';

export default function LoanManagementModal({ loan, aircraft, cash, onClose }: LoanManagementModalProps) {
  const payoffLoan = useGameStore((s) => s.payoffLoan);
  const prepayLoan = useGameStore((s) => s.prepayLoan);
  const refinanceLoan = useGameStore((s) => s.refinanceLoan);
  const addNotification = useGameStore((s) => s.addNotification);
  const currencyFormat = useGameStore((s) => s.settings.currencyFormat);

  const [tab, setTab] = useState<Tab>('payoff');
  const [prepayAmount, setPrepayAmount] = useState(() => Math.min(loan.remainingBalance, 1_000_000));
  const [refRate, setRefRate] = useState(REFINANCE_RATE_OPTIONS[1]);
  const [refTerm, setRefTerm] = useState(60);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const remaining = loan.remainingBalance;
  const currentMonthly = loan.monthlyPayment;
  const currentRate = loan.interestRate;

  // Estimate of payments left at the original schedule (informational only)
  const estimatedPaymentsLeft = Math.ceil(remaining / currentMonthly);

  const refMonthly = calculateMonthlyPayment(remaining, refRate, refTerm);
  const refTotalInterest = Math.round(refMonthly * refTerm - remaining);
  const refFee = Math.round(remaining * 0.02);

  const notifyResult = (result: { success: boolean; message: string }) => {
    if (result.success) {
      setMessage({ type: 'success', text: result.message });
      addNotification({ type: 'success', title: 'Loan updated', message: result.message });
      setTimeout(onClose, 1200);
    } else {
      setMessage({ type: 'error', text: result.message });
    }
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: 'payoff', label: 'Pay Off' },
    { id: 'prepay', label: 'Prepayment' },
    { id: 'refinance', label: 'Refinance' },
  ];

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[60] p-4"
      onClick={onClose}
    >
      <div
        className="bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 bg-zinc-900/90">
          <div>
            <h2 className="text-lg font-semibold text-white">Manage Loan</h2>
            <p className="text-sm text-slate-400">
              {aircraft ? `${aircraft.registration} · ${loan.loanNumber ?? ''}` : 'Aircraft loan'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-zinc-800 text-slate-400 hover:text-white hover:bg-zinc-700 transition-colors"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-2 gap-3 px-5 py-4 border-b border-zinc-800">
          <div className="bg-zinc-800/60 rounded-lg p-3">
            <p className="text-xs text-slate-500 uppercase tracking-wide">Remaining Balance</p>
            <p className="text-base font-semibold text-white">{formatCurrency(remaining, currencyFormat)}</p>
          </div>
          <div className="bg-zinc-800/60 rounded-lg p-3">
            <p className="text-xs text-slate-500 uppercase tracking-wide">Monthly Payment</p>
            <p className="text-base font-semibold text-white">{formatCurrency(currentMonthly, currencyFormat)}</p>
          </div>
          <div className="bg-zinc-800/60 rounded-lg p-3">
            <p className="text-xs text-slate-500 uppercase tracking-wide">Interest Rate</p>
            <p className="text-base font-semibold text-white">{currentRate.toFixed(2)}% APR</p>
          </div>
          <div className="bg-zinc-800/60 rounded-lg p-3">
            <p className="text-xs text-slate-500 uppercase tracking-wide">Payments Remaining (est.)</p>
            <p className="text-base font-semibold text-white">≈ {estimatedPaymentsLeft}</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-zinc-800">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => {
                setTab(t.id);
                setMessage(null);
              }}
              className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                tab === t.id
                  ? 'text-white border-b-2 border-sky-500 bg-zinc-800/40'
                  : 'text-slate-400 hover:text-white border-b-2 border-transparent'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="p-5 space-y-4">
          {tab === 'payoff' && (
            <div className="space-y-3">
              <p className="text-sm text-slate-300">
                Settle the full remaining balance of{' '}
                <span className="font-semibold text-white">{formatCurrency(remaining, currencyFormat)}</span> in one payment. This removes
                the loan from your liabilities and frees {aircraft?.registration ?? 'the aircraft'} for sale.
              </p>
              <div className="text-sm text-slate-400">
                Cash on hand:{' '}
                <span className={cash >= remaining ? 'text-emerald-400 font-medium' : 'text-red-400 font-medium'}>
                  {formatCurrency(cash, currencyFormat)}
                </span>
              </div>
              <button
                onClick={() => notifyResult(payoffLoan(loan.id))}
                disabled={remaining <= 0 || cash < remaining}
                className="w-full py-2.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Pay Off Full Balance
              </button>
            </div>
          )}

          {tab === 'prepay' && (
            <div className="space-y-3">
              <p className="text-sm text-slate-300">
                Make a lump-sum prepayment to reduce the principal. Your scheduled monthly payment stays the same, so a
                lower balance shortens the loan and reduces total interest paid.
              </p>
              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Prepay up to {formatCurrency(remaining, currencyFormat)} · slider: 0 – 50% of remaining balance
                </label>
                <input
                  type="range"
                  min={0}
                  max={Math.round(remaining / 2) || 1}
                  value={Math.min(prepayAmount, Math.round(remaining / 2) || 1)}
                  onChange={(e) => setPrepayAmount(Number(e.target.value))}
                  className="w-full accent-sky-500"
                />
              </div>
              <input
                type="number"
                min={0}
                max={remaining}
                value={Math.round(prepayAmount)}
                onChange={(e) => setPrepayAmount(Math.max(0, Number(e.target.value)))}
                className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-white text-sm focus:outline-none focus:border-sky-500"
              />
              <div className="flex gap-2">
                {[0.1, 0.25, 0.5, 1].map((f) => (
                  <button
                    key={f}
                    onClick={() => setPrepayAmount(Math.round(remaining * f))}
                    className="flex-1 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-xs text-slate-300 hover:bg-zinc-700 transition-colors"
                  >
                    {f === 1 ? 'Full' : `${f * 100}%`}
                  </button>
                ))}
              </div>
              <button
                onClick={() => notifyResult(prepayLoan(loan.id, prepayAmount))}
                disabled={prepayAmount <= 0 || prepayAmount > remaining || cash < prepayAmount}
                className="w-full py-2.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {prepayAmount >= remaining ? 'Pay Full Balance' : `Prepay ${formatCurrency(prepayAmount, currencyFormat)}`}
              </button>
            </div>
          )}

          {tab === 'refinance' && (
            <div className="space-y-4">
              <p className="text-sm text-slate-300">
                Reprice and re-amortize the remaining balance. A refinancing fee of 2% ({formatCurrency(refFee, currencyFormat)}) is
                charged up front.
              </p>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Interest Rate</label>
                <select
                  value={refRate}
                  onChange={(e) => setRefRate(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-white text-sm focus:outline-none focus:border-sky-500"
                >
                  {REFINANCE_RATE_OPTIONS.map((r) => (
                    <option key={r} value={r}>
                      {r.toFixed(2)}% APR {Math.abs(r - currentRate) < 0.001 ? '(current)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Term</label>
                <select
                  value={refTerm}
                  onChange={(e) => setRefTerm(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-white text-sm focus:outline-none focus:border-sky-500"
                >
                  {TERM_MONTH_OPTIONS.map((m) => (
                    <option key={m} value={m}>
                      {m} months ({(m / 12).toFixed(m % 12 === 0 ? 0 : 1)} years)
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-3 gap-2 text-sm">
                <div className="bg-zinc-800/60 rounded-lg p-2.5">
                  <p className="text-[11px] text-slate-500">Current</p>
                  <p className="font-medium text-white">{formatCurrency(currentMonthly, currencyFormat)}</p>
                </div>
                <div className={`rounded-lg p-2.5 ${refMonthly < currentMonthly ? 'bg-emerald-900/30' : 'bg-red-900/30'}`}>
                  <p className="text-[11px] text-slate-500">New Payment</p>
                  <p className={`font-medium ${refMonthly < currentMonthly ? 'text-emerald-400' : 'text-red-400'}`}>
                    {formatCurrency(Math.round(refMonthly), currencyFormat)}
                  </p>
                </div>
                <div className="bg-zinc-800/60 rounded-lg p-2.5">
                  <p className="text-[11px] text-slate-500">Total Interest</p>
                  <p className="font-medium text-white">{formatCurrency(refTotalInterest, currencyFormat)}</p>
                </div>
              </div>

              <button
                onClick={() => notifyResult(refinanceLoan(loan.id, refRate, refTerm))}
                disabled={cash < refFee || refRate <= 0 || refTerm <= 0}
                className="w-full py-2.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Refinance {formatCurrency(remaining, currencyFormat)} @ {refRate.toFixed(2)}% / {refTerm} mo
              </button>
            </div>
          )}

          {message && (
            <div
              className={`px-3 py-2 rounded-lg text-sm ${
                message.type === 'success' ? 'bg-emerald-900/40 text-emerald-300' : 'bg-red-900/40 text-red-300'
              }`}
            >
              {message.text}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
