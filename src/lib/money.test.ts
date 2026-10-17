import { formatMoney, sumMinor } from "./money";

describe("formatMoney", () => {
  it("formats JPY, which has no minor unit", () => {
    expect(formatMoney(8000, "JPY")).toBe("¥8,000");
  });

  it("formats USD from cents", () => {
    expect(formatMoney(12345, "USD")).toBe("$123.45");
  });

  it("formats zero", () => {
    expect(formatMoney(0, "JPY")).toBe("¥0");
  });
});

describe("sumMinor", () => {
  it("adds integer amounts without floating point drift", () => {
    expect(sumMinor([10, 20, 30])).toBe(60);
    expect(sumMinor([])).toBe(0);
  });
});
