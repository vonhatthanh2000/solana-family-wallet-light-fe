import type { SolanaDepositFeeQuote } from "../api/types";
import { baseUnitsToDecimal, type DepositCost } from "./deposits";

/**
 * One shape for the deposit cost, whichever side priced it: the Space's quote endpoint, or this
 * device when that endpoint is unavailable. Every figure stays a smallest-unit string.
 */
export type DepositCostView = {
  source: "quote" | "device";
  symbol: string;
  /**
   * none: a native SOL deposit, which has no token account.
   * opens: this deposit creates the Space's token account and pays its one-off rent.
   * exists: the account is already open, so only the network fee applies.
   * unknown: the rent could not be read — never render that as free.
   */
  account: "none" | "opens" | "exists" | "unknown";
  feeLamports?: string;
  rentLamports?: string;
  /** Fee + rent, plus the transferred lamports for a native deposit. */
  totalLamports?: string;
  senderLamports?: string;
  /** "0" when the wallet covers the total; undefined when the balance could not be read. */
  shortfallLamports?: string;
  destination?: string;
};

export function solText(lamports?: string): string {
  return lamports === undefined ? "Unknown" : `${baseUnitsToDecimal(lamports, 9)} SOL`;
}

/** A known shortfall must stop the deposit: the transaction would fail on chain. */
export function blocksDeposit(view?: DepositCostView): boolean {
  return view?.shortfallLamports !== undefined && view.shortfallLamports !== "0";
}

export function quoteCostView(quote: SolanaDepositFeeQuote, symbol: string): DepositCostView {
  return {
    source: "quote",
    symbol,
    account: quote.ataExists ? "exists" : "opens",
    feeLamports: quote.fees.transactionFeeLamports,
    rentLamports: quote.fees.rentLamports,
    totalLamports: quote.fees.totalLamports,
    senderLamports: quote.senderLamports,
    shortfallLamports: quote.shortfallLamports,
    destination: quote.destination,
  };
}

export function deviceCostView(cost: DepositCost, symbol: string): DepositCostView {
  const account = !cost.opensTokenAccount
    ? "none"
    : cost.rentLamports === undefined
      ? "unknown"
      : cost.rentLamports === "0" ? "exists" : "opens";
  return {
    source: "device",
    symbol,
    account,
    feeLamports: cost.feeLamports,
    rentLamports: cost.opensTokenAccount ? cost.rentLamports : undefined,
    totalLamports: cost.requiredLamports,
    senderLamports: cost.senderLamports,
    shortfallLamports: cost.shortfallLamports,
  };
}
