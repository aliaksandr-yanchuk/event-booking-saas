export type SeatPosition = {
  sectionName: string;
  row: string;
  number: number;
};

/** Human-readable label, e.g. "Floor · Row B · Seat 12". */
export function seatLabel({ sectionName, row, number }: SeatPosition): string {
  return `${sectionName} · Row ${row} · Seat ${number}`;
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
