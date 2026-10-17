import { groupSeatsByRow, seatLabel } from "./seats";

describe("seatLabel", () => {
  it("includes section, row and number", () => {
    expect(seatLabel({ sectionName: "Balcony", row: "B", number: 12 })).toBe("Balcony · Row B · Seat 12");
  });
});

describe("groupSeatsByRow", () => {
  it("orders rows A..Z before AA and seats numerically", () => {
    const seats = [
      { id: "1", row: "B", number: 10 },
      { id: "2", row: "AA", number: 1 },
      { id: "3", row: "B", number: 2 },
      { id: "4", row: "A", number: 1 },
    ];

    expect(groupSeatsByRow(seats)).toEqual([
      { row: "A", seats: [{ id: "4", row: "A", number: 1 }] },
      {
        row: "B",
        seats: [
          { id: "3", row: "B", number: 2 },
          { id: "1", row: "B", number: 10 },
        ],
      },
      { row: "AA", seats: [{ id: "2", row: "AA", number: 1 }] },
    ]);
  });
});
