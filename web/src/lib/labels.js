/** Plain-language labels for enum values (contracts section 9). Fixed copy; the value itself comes from JSON. */

export const STATUS_LABELS = {
  unavailable: "No recent data",
  low_activity: "Too little burning to rank",
  below_normal: "Below normal",
  normal: "Normal",
  above_normal: "Above normal",
  extreme: "Extreme",
};

export function statusLabel(status) {
  return STATUS_LABELS[status] ?? "Unknown status";
}
