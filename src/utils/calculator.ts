import type { CalculationBreakdown } from '../types';

/**
 * Calculates the wallet credit based on weekly earnings rule:
 * 1. If amount <= 40 => 0 credited
 * 2. If 40 < amount <= 80 => credited amount between 40 and 80 (amount - 40)
 * 3. If amount > 80 => credited amount from 40 to 80 (which is 40) + half of amount exceeding 80
 */
export function calculateWalletCredit(amount: number): number {
  if (amount <= 40) {
    return 0;
  }
  
  if (amount <= 80) {
    return Number((amount - 40).toFixed(2));
  }
  
  const baseCredit = 40; // 80 - 40
  const excess = amount - 80;
  const excessCredit = excess / 2;
  return Number((baseCredit + excessCredit).toFixed(2));
}

/**
 * Returns detailed breakdown and explanation for UI preview in Dollars ($)
 */
export function getCalculationBreakdown(amount: number): CalculationBreakdown {
  if (amount <= 40) {
    return {
      amount,
      tier: 1,
      baseCredit: 0,
      excessAmount: 0,
      excessCredit: 0,
      totalCredit: 0,
      summary: `Earnings of $${amount.toFixed(2)} are $40 or less. Wallet credit is $0.00.`
    };
  }

  if (amount <= 80) {
    const credit = Number((amount - 40).toFixed(2));
    return {
      amount,
      tier: 2,
      baseCredit: credit,
      excessAmount: 0,
      excessCredit: 0,
      totalCredit: credit,
      summary: `Earnings between $40 and $80: ($${amount.toFixed(2)} - $40) = $${credit.toFixed(2)} credited.`
    };
  }

  const baseCredit = 40;
  const excess = amount - 80;
  const excessCredit = Number((excess / 2).toFixed(2));
  const total = Number((baseCredit + excessCredit).toFixed(2));

  return {
    amount,
    tier: 3,
    baseCredit,
    excessAmount: excess,
    excessCredit,
    totalCredit: total,
    summary: `Tier 2 max credit ($40.00) + 50% of amount over $80 ($${excess.toFixed(2)} / 2 = $${excessCredit.toFixed(2)}) = $${total.toFixed(2)} credited.`
  };
}
