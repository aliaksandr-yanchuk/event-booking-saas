import { formatMoney, formatPrice, sumMinor } from "./money";

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

describe("formatPrice", () => {
  it("shows free seats as Free and everything else as money", () => {
    expect(formatPrice(0, "JPY", { free: "Free" })).toBe("Free");
    expect(formatPrice(6000, "JPY", { free: "Free" })).toBe("¥6,000");
  });

  it("formats in Japanese", () => {
    expect(formatPrice(0, "JPY", { locale: "ja", free: "無料" })).toBe("無料");
    expect(formatPrice(6000, "JPY", { locale: "ja", free: "無料" })).toBe("￥6,000");
  });
});

describe("sumMinor", () => {
  it("adds integer amounts without floating point drift", () => {
    expect(sumMinor([10, 20, 30])).toBe(60);
    expect(sumMinor([])).toBe(0);
  });
});
