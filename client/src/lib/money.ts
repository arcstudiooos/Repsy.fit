/** An amount in an ISO currency, the way the Business tab shows it (INR in Indian grouping). */
export function formatMoney(amount: number, currency = "INR"): string {
  try {
    return new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", { style: "currency", currency }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
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
