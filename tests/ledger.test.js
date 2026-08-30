import { describe, it, expect } from "vitest";
import {
  SOURCE,
  STATUS,
  resolveStatus,
  daysRemaining,
  isTrusted,
  attest,
  reject,
  propose,
  tally
} from "../src/index.js";

describe("the rule — a model can propose, only a human can attest", () => {
  it("never resolves a model-sourced record to attested", () => {
    // A model record may read as proposed or, once a reviewer turns it down,
    // rejected. What it may never be is attested.
    const p = propose({ value: 42 }, { model: "any model", rationale: "reasoned guess" });
    expect(resolveStatus(p)).toBe(STATUS.PROPOSED);
    expect(isTrusted(p)).toBe(false);
  });

  it("refuses to promote a model record even when handed attested-looking fields", () => {
    const smuggled = {
      bands: {},
      attestation: {
        source: SOURCE.MODEL,
        by: "David Petry",
        role: "FOH engineer",
        basis: "Twenty years at the desk",
        verified: new Date().toISOString().slice(0, 10),
        ttlDays: 730
      }
    };
    expect(resolveStatus(smuggled)).toBe(STATUS.PROPOSED);
    expect(isTrusted(smuggled)).toBe(false);
  });

  it("will not attest without a named person", () => {
    const p = propose({ hpf: "IN" }, { model: "test" });
    expect(() => attest(p, { basis: "Some rooms" })).toThrow(/named person/i);
    expect(() => attest(p, { by: "   ", basis: "Some rooms" })).toThrow(/named person/i);
  });

  it("will not attest without a stated basis", () => {
    const p = propose({ hpf: "IN" }, { model: "test" });
    expect(() => attest(p, { by: "David Petry" })).toThrow(/grounded in/i);
  });

  it("records what a practitioner overrode when they ratify a proposal", () => {
    const p = propose({ hpf: "IN", lf: 0 }, { model: "Claude (Anthropic)" });
    const signed = attest(p, {
      by: "David Petry",
      role: "FOH engineer",
      basis: "Checked against a wedge at a 200-cap room",
      verified: "2026-08-20"
    });
    expect(signed.attestation.source).toBe(SOURCE.PRACTITIONER);
    expect(signed.attestation.supersedes.source).toBe(SOURCE.MODEL);
    expect(resolveStatus(signed, new Date("2026-08-23"))).toBe(STATUS.ATTESTED);
  });

  it("leaves the original proposal untouched when ratifying", () => {
    const p = propose({ hpf: "IN" }, { model: "Claude (Anthropic)" });
    attest(p, { by: "David Petry", basis: "A real room" });
    expect(p.attestation.source).toBe(SOURCE.MODEL);
    expect(p.attestation.by).toBeNull();
  });
});

describe("rejection — a finding, not a deletion", () => {
  const proposal = propose({ hpf: "IN", lf: -5 }, {
    model: "Claude (Anthropic)",
    rationale: "Inferred from the bright-instrument pattern"
  });

  it("records who turned it down and why", () => {
    const turned = reject(proposal, {
      by: "David Petry",
      role: "FOH engineer",
      reason: "Low cut is far too aggressive — banjo body lives lower than assumed",
      reviewed: "2026-08-23"
    });
    expect(resolveStatus(turned)).toBe(STATUS.REJECTED);
    expect(turned.attestation.rejection.by).toBe("David Petry");
    expect(turned.attestation.rejection.reason).toMatch(/aggressive/);
  });

  it("keeps the rejected values and their reasoning in the dataset", () => {
    const turned = reject(proposal, { by: "David Petry", reason: "Wrong" });
    expect(turned.bands.lf).toBe(-5);
    expect(turned.attestation.rationale).toBeTruthy();
  });

  it("will not reject without a named person", () => {
    expect(() => reject(proposal, { reason: "Wrong" })).toThrow(/named person/i);
  });

  it("will not reject without a stated reason", () => {
    expect(() => reject(proposal, { by: "David Petry" })).toThrow(/why/i);
  });

  it("leaves the original untouched", () => {
    reject(proposal, { by: "David Petry", reason: "Wrong" });
    expect(proposal.attestation.rejection).toBeUndefined();
  });

  it("never counts as trusted", () => {
    const turned = reject(proposal, { by: "David Petry", reason: "Wrong" });
    expect(isTrusted(turned)).toBe(false);
  });

  it("does not decay — a rejection stands until superseded", () => {
    const turned = reject(proposal, {
      by: "David Petry", reason: "Wrong", reviewed: "2019-01-01"
    });
    expect(resolveStatus(turned, new Date("2026-08-23"))).toBe(STATUS.REJECTED);
  });

  it("outranks the model check, so a rejected proposal does not read as merely proposed", () => {
    const turned = reject(proposal, { by: "David Petry", reason: "Wrong" });
    expect(turned.attestation.source).toBe(SOURCE.MODEL);
    expect(resolveStatus(turned)).toBe(STATUS.REJECTED);
  });

  it("ignores a malformed rejection rather than trusting it", () => {
    const half = { attestation: { source: SOURCE.MODEL, rejection: { by: "David Petry" } } };
    expect(resolveStatus(half)).toBe(STATUS.PROPOSED);
  });

  it("preserves the rejection in the trail when a replacement is attested", () => {
    const turned = reject(proposal, { by: "David Petry", reason: "Too aggressive" });
    const replaced = attest({ ...turned, bands: { hpf: "IN", lf: -2 } }, {
      by: "David Petry",
      role: "FOH engineer",
      basis: "Re-checked with a banjo at a 150-cap room",
      verified: "2026-08-23"
    });
    expect(resolveStatus(replaced, new Date("2026-08-24"))).toBe(STATUS.ATTESTED);
    expect(replaced.attestation.rejection).toBeUndefined();
    expect(replaced.attestation.supersedes.rejection.reason).toMatch(/aggressive/);
  });
});

describe("attestations decay", () => {
  const record = {
    bands: {},
    attestation: {
      source: SOURCE.PRACTITIONER,
      by: "David Petry",
      basis: "A real room",
      verified: "2026-01-01",
      ttlDays: 100
    }
  };

  it("holds inside its shelf life", () => {
    expect(resolveStatus(record, new Date("2026-03-01"))).toBe(STATUS.ATTESTED);
  });

  it("lapses to expired once past it", () => {
    expect(resolveStatus(record, new Date("2026-06-01"))).toBe(STATUS.EXPIRED);
  });

  it("stops being trusted the moment it lapses", () => {
    expect(isTrusted(record, new Date("2026-06-01"))).toBe(false);
  });

  it("counts down the days remaining, going negative when overdue", () => {
    expect(daysRemaining(record, new Date("2026-02-01"))).toBe(69);
    expect(daysRemaining(record, new Date("2026-06-01"))).toBeLessThan(0);
  });

  it("treats an unreadable verification date as unverified", () => {
    const bad = { attestation: { source: SOURCE.PRACTITIONER, by: "X", basis: "Y", verified: "last summer" } };
    expect(resolveStatus(bad)).toBe(STATUS.PROPOSED);
  });
});

