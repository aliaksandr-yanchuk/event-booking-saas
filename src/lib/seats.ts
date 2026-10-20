import { fill } from "@/i18n/config";

export type SeatPosition = {
  sectionName: string;
  row: string;
  number: number;
};

/**
 * Human-readable label from the dictionary's template: "Floor · Row B · Seat 12", or
 * "Floor B列 12番" in Japanese. Bookings store their labels in the customer's language.
 */
export function seatLabel({ sectionName, row, number }: SeatPosition, template: string): string {
  return fill(template, { section: sectionName, row, number });
}

/**
 * Groups seats into rows for rendering, keeping rows in their natural order
 * (A, B, … then AA) and seats in numeric order.
 */
export function groupSeatsByRow<T extends { row: string; number: number }>(seats: readonly T[]) {
  const rows = new Map<string, T[]>();
  for (const seat of seats) {
    const row = rows.get(seat.row) ?? [];
    row.push(seat);
    rows.set(seat.row, row);
  }
  return [...rows.entries()]
    .sort(([a], [b]) => a.length - b.length || a.localeCompare(b))
    .map(([row, rowSeats]) => ({
      row,
      seats: [...rowSeats].sort((a, b) => a.number - b.number),
    }));
}
