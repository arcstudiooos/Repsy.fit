/** An amount in an ISO currency (INR in Indian grouping). Whole amounts drop the decimals:
 *  "₹4,999", "₹1,25,000.50" (owner, Nov 2026). */
export function formatMoney(amount: number, currency = "INR"): string {
  const digits = Number.isInteger(amount) ? 0 : 2;
  try {
    return new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: digits,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${digits ? amount.toFixed(2) : amount} ${currency}`;
  }
}

/** "per month" style words for a billing cycle. */
export function perCycle(cycle: string | undefined): string {
  switch (cycle) {
    case "Monthly":
      return "per month";
    case "Quarterly":
      return "per quarter";
    case "Yearly":
      return "per year";
    case "One-time":
      return "one-time";
    default:
      return "";
  }
}
