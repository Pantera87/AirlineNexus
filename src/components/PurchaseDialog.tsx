import { useState } from 'react';
import useFleetStore from '../store/fleetSlice';
import { useGameStore } from '../store/gameStore';
import { formatCurrency } from '../utils/helpers';
import { type AircraftListing, PurchaseType } from '../types/game';

interface PurchaseDialogProps {
  listing: AircraftListing;
}

export default function PurchaseDialog({ listing }: PurchaseDialogProps) {
  const [purchaseType, setPurchaseType] = useState<PurchaseType>(PurchaseType.Cash);
  const [downPaymentPercent, setDownPaymentPercent] = useState(20);
  const [loanTermMonths, setLoanTermMonths] = useState(60);

  const { purchaseAircraft } = useFleetStore();
  const currencyFormat = useGameStore((state) => state.settings.currencyFormat);

  // Calculate loan details
  const downPaymentAmount = Math.round(listing.price * downPaymentPercent / 100);
  const loanAmount = listing.price - downPaymentAmount;

  // Simple interest calculation (for demonstration)
  const annualInterestRate = 5.75; // APR based on airline credit rating
  const monthlyInterestRate = annualInterestRate / 12 / 100;
  const monthlyPayment = calculateMonthlyPayment(loanAmount, monthlyInterestRate, loanTermMonths);
  const totalInterestPaid = Math.round(monthlyPayment * loanTermMonths - loanAmount);

  const handlePurchase = async () => {
    const config = purchaseType === PurchaseType.Cash
      ? { type: PurchaseType.Cash, totalPriceUsd: listing.price }
      : {
          type: PurchaseType.Loan,
          totalPriceUsd: listing.price,
          downPaymentPercent,
          loanTermMonths,
          interestRatePercent: annualInterestRate
        };

    const result = await purchaseAircraft(listing.id, config);
    if (result.success) {
      alert(result.message);
    } else {
      alert(`Error: ${result.message}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Purchase options */}
      <div>
        <h3 className="text-xl font-semibold text-white mb-4">Purchase Options</h3>

        <div className="flex gap-4 mb-6">
          <label className="flex items-center glass-panel p-4 rounded-lg cursor-pointer flex-1">
            <input
              type="radio"
              checked={purchaseType === PurchaseType.Cash}
              onChange={() => setPurchaseType(PurchaseType.Cash)}
              className="mr-3 w-5 h-5"
            />
            <span className="text-white font-medium">Pay with Cash</span>
          </label>

          <label className="flex items-center glass-panel p-4 rounded-lg cursor-pointer flex-1">
            <input
              type="radio"
              checked={purchaseType === PurchaseType.Loan}
              onChange={() => setPurchaseType(PurchaseType.Loan)}
              className="mr-3 w-5 h-5"
            />
            <span className="text-white font-medium">Finance with Loan</span>
          </label>
        </div>

        {/* Loan details (only shown when loan is selected) */}
        {purchaseType === PurchaseType.Loan && (
          <div className="space-y-4">
            {/* Down payment slider */}
            <div>
              <label className="block text-white mb-2">Down Payment</label>
              <input
                type="range"
                min="10"
                max="80"
                step="5"
                value={downPaymentPercent}
                onChange={(e) => setDownPaymentPercent(Number(e.target.value))}
                className="w-full glass-slider h-2 rounded-lg appearance-none cursor-pointer"
              />
              <div className="flex justify-between text-xs text-gray-400 mt-1">
                <span>10%</span>
                <span>{downPaymentPercent}%</span>
                <span>80%</span>
              </div>
            </div>

            {/* Loan term */}
            <div>
              <label className="block text-white mb-2">Loan Term</label>
              <select
                value={loanTermMonths}
                onChange={(e) => setLoanTermMonths(Number(e.target.value))}
                className="w-full glass-dropdown p-2 rounded border border-gray-600 bg-slate-800/50 text-white"
              >
                {[36, 48, 60, 72, 84, 96].map(term => (
                  <option key={term} value={term}>
                    {term} months ({Math.round(term / 12)} years)
                  </option>
                ))}
              </select>
            </div>

            {/* Loan summary */}
            <div className="glass-panel p-4 rounded-lg">
              <h4 className="font-semibold text-white mb-3">Loan Summary</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-300">Aircraft Price:</span>
                  <span className="text-white">{formatCurrency(listing.price, currencyFormat)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-300">Down Payment ({downPaymentPercent}%):</span>
                  <span className="text-white">-{formatCurrency(downPaymentAmount, currencyFormat)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-300">Loan Amount:</span>
                  <span className="text-white">{formatCurrency(loanAmount, currencyFormat)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-300">Interest Rate:</span>
                  <span className="text-white">{annualInterestRate}% APR*</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-300">Monthly Payment:</span>
                  <span className="text-white">{formatCurrency(Math.round(monthlyPayment), currencyFormat)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-300">Total Interest Paid:</span>
                  <span className="text-white">{formatCurrency(totalInterestPaid, currencyFormat)}</span>
                </div>
              </div>
              <p className="text-xs text-gray-400 mt-2">
                *Rate based on airline credit rating and current market conditions
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Purchase button */}
      <button
        onClick={handlePurchase}
        className="w-full glass-button text-white py-3 rounded-lg font-medium hover:opacity-90 transition-opacity"
      >
        {purchaseType === PurchaseType.Cash ? 'Complete Cash Purchase' : 'Confirm Loan & Purchase'}
      </button>
    </div>
  );
}

// Helper function to calculate monthly payment
function calculateMonthlyPayment(principal: number, monthlyRate: number, termMonths: number): number {
  // Standard loan amortization formula
  const payment = principal * monthlyRate * Math.pow(1 + monthlyRate, termMonths) /
    (Math.pow(1 + monthlyRate, termMonths) - 1);
  return Math.round(payment);
}

