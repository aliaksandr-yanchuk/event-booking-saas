import { toCsv } from "./csv";

describe("toCsv", () => {
  it("writes rows with CRLF line ends and a byte order mark for Excel", () => {
    expect(
      toCsv([
        ["reference", "seats"],
        ["7KQM-4XPA", 2],
      ]),
    ).toBe("﻿reference,seats\r\n7KQM-4XPA,2\r\n");
  });

  it("quotes cells with commas, quotes or line breaks", () => {
    expect(toCsv([["Floor · Row A, Seat 1", 'Say "hi"', "two\nlines", null]])).toBe(
      '﻿"Floor · Row A, Seat 1","Say ""hi""","two\nlines",\r\n',
    );
  });

  it("keeps formulas from running when the file is opened in a spreadsheet", () => {
    expect(toCsv([['=HYPERLINK("https://evil.example")', "+81 90", "-1", "@SUM(A1)"]])).toBe(
      '﻿"\'=HYPERLINK(""https://evil.example"")",\'+81 90,\'-1,\'@SUM(A1)\r\n',
    );
  });

  it("keeps non-ASCII names as they are", () => {
    expect(toCsv([["田中 愛子", "Dvořák"]])).toBe("﻿田中 愛子,Dvořák\r\n");
  });
});
