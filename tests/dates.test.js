// Dates are calendar days where the clock is read, not UTC instants.
// Pinned to New York so the evening case (already tomorrow in UTC) runs on
// any machine, including UTC CI. Vitest runs each test file in its own
// process, so this does not leak into other files.
process.env.TZ = "America/New_York";

import { describe, it, expect } from "vitest";
import { SOURCE, STATUS, resolveStatus, daysRemaining, attest, reject, propose } from "../src/index.js";

const signed = (verified, ttlDays) => ({
  attestation: { source: SOURCE.PRACTITIONER, by: "David Petry", basis: "A real room", verified, ttlDays }
});
// 20:30 on 1 January in New York is 01:30 on 2 January in UTC.
const evening = new Date(2026, 0, 1, 20, 30);

describe("calendar days, read where the clock is", () => {
  it("runs in New York for these tests", () => {
    expect(evening.getTimezoneOffset()).toBe(300);
  });

  it("counts a full shelf life on the evening it was signed", () => {
    expect(daysRemaining(signed("2026-01-01", 100), evening)).toBe(100);
  });

  it("counts whole days, the same at breakfast and at the gig", () => {
    const record = signed("2026-01-01", 100);
    expect(daysRemaining(record, new Date(2026, 1, 1, 7, 0))).toBe(69);
    expect(daysRemaining(record, new Date(2026, 1, 1, 23, 59))).toBe(69);
  });

  it("holds through its last day and lapses the day after", () => {
    const record = signed("2026-01-01", 10);
    expect(daysRemaining(record, new Date(2026, 0, 11, 23, 0))).toBe(0);
    expect(resolveStatus(record, new Date(2026, 0, 11, 23, 0))).toBe(STATUS.ATTESTED);
    expect(daysRemaining(record, new Date(2026, 0, 12, 0, 30))).toBe(-1);
    expect(resolveStatus(record, new Date(2026, 0, 12, 0, 30))).toBe(STATUS.EXPIRED);
  });

  it("reads the date part of a full timestamp", () => {
    expect(daysRemaining(signed("2026-01-01T18:00:00Z", 100), evening)).toBe(100);
  });

  it("treats an impossible date as unreadable", () => {
    expect(daysRemaining(signed("2026-02-30", 100), evening)).toBeNull();
    expect(resolveStatus(signed("2026-02-30", 100), evening)).toBe(STATUS.PROPOSED);
  });

  it("stamps today's local date when attest() or reject() is given none", () => {
    const now = new Date();
    const local = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const p = propose({ lf: 0 }, { model: "Claude (Anthropic)" });
    expect(attest(p, { by: "David Petry", basis: "A real room" }).attestation.verified).toBe(local);
    expect(reject(p, { by: "David Petry", reason: "Wrong" }).attestation.rejection.reviewed).toBe(local);
  });
});
