/**
 * attestation-ledger
 *
 * A value in an expert reference is not a fact. It is an assertion made by
 * someone, grounded in something, at a point in time. This module makes that
 * explicit and enforces one rule above all others:
 *
 *   A model can propose. Only a named human can attest.
 *
 * Status is derived, never stored. Storing it would let a stale record claim
 * to be current; deriving it from the verification date means a value decays
 * on its own unless somebody re-checks it against reality.
 *
 * Built for and extracted from a live-sound engineering SOP, where EQ values
 * carried no record of who asserted them or what grounded them. Nothing in
 * this engine knows about audio — the same rule fits clinical protocols,
 * safety procedures, editorial standards, or any reference where expert
 * assertions get treated as facts.
 */

/**
 * @typedef {"practitioner" | "model"} Source
 * @typedef {"proposed" | "attested" | "expired" | "rejected"} Status
 */

/**
 * @typedef {object} Attestation
 * @property {Source} source            Who produced the assertion.
 * @property {string|null} [by]         Name of the human who signed it.
 * @property {string|null} [role]       Their role, for context.
 * @property {string} [basis]           What the assertion is grounded in.
 * @property {string} [verified]        ISO date (YYYY-MM-DD) of verification: a calendar day, not an instant.
 * @property {number} [ttlDays]         Shelf life in days. Defaults to 730.
 * @property {string} [model]           Model identifier, when source is "model".
 * @property {string} [rationale]       The model's stated reasoning.
 * @property {Rejection} [rejection]    Present once a human has turned it down.
 * @property {object|null} [supersedes] What this attestation replaced.
 */

/**
 * @typedef {object} Rejection
 * @property {string} by         Name of the human who rejected it.
 * @property {string|null} role  Their role.
 * @property {string} reason     Why it was turned down.
 * @property {string} reviewed   ISO date of the review.
 */

/**
 * @typedef {object} Record
 * @property {Attestation} attestation  The provenance block. Everything else
 *   on the record is your own payload — this library does not touch it.
 */

export const SOURCE = {
  PRACTITIONER: "practitioner",
  MODEL: "model"
};

export const STATUS = {
  PROPOSED: "proposed",
  ATTESTED: "attested",
  EXPIRED: "expired",
  REJECTED: "rejected"
};

/** Default shelf life of an attestation, in days. */
export const DEFAULT_TTL_DAYS = 730;

const DAY_MS = 86400000;
const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})/;

/*
 * Dates here are calendar days, not instants. "2026-08-25" means that day
 * wherever the record is read, and "today" is the day on the reader's clock.
 * Treating the date as midnight UTC made a record read in the Americas in
 * the evening a day older than it was, and stamped tomorrow's date on a
 * sign-off made after 7pm in New York.
 */

/** The calendar day of an ISO date (or a timestamp's date part) as a day count, or null if unreadable. */
function dayOf(iso) {
  const m = ISO_DAY.exec(String(iso ?? ""));
  if (!m) return null;
  const y = Number(m[1]), mo = Number(m[2]) - 1, d = Number(m[3]);
  const t = Date.UTC(y, mo, d);
  const back = new Date(t);
  // Refuse a day the calendar doesn't have ("2026-02-30") instead of rolling it over.
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo || back.getUTCDate() !== d) return null;
  return t / DAY_MS;
}

/** The calendar day on the reader's clock, as a day count. */
function today(now) {
  return Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / DAY_MS;
}

/** Today's date on the reader's clock, as YYYY-MM-DD. */
function todayISO(now = new Date()) {
  const two = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}`;
}

/** Whole days from the verification date to today, or null if the date is unreadable. */
function ageInDays(verified, now) {
  const day = dayOf(verified);
  return day === null ? null : today(now) - day;
}

/**
 * Resolve the current status of a record.
 *
 * Order matters, and it is deliberate:
 *
 *   1. Rejection first. A rejection can only ever make a record less trusted,
 *      never more, so letting it short-circuit is fail-safe. It also has to
 *      run before the model check, or a rejected model proposal would report
 *      as merely "proposed" and the reviewer's judgement would vanish.
 *   2. Model records next. No combination of fields can promote a model
 *      assertion past this line.
 *   3. Everything else resolves on the verification date.
 *
 * A rejection does not decay. It stands until somebody supersedes it by
 * attesting a replacement value, which records the rejection in `supersedes`.
 */
/**
 * Derive the current status of a record.
 * @param {Record} record
 * @param {Date} [now] Override the clock, for testing.
 * @returns {Status}
 */
export function resolveStatus(record, now = new Date()) {
  const a = record?.attestation;
  if (!a) return STATUS.PROPOSED;

  const r = a.rejection;
  if (r && r.by && r.reason) return STATUS.REJECTED;

  if (a.source === SOURCE.MODEL) return STATUS.PROPOSED;
  if (!a.by || !a.verified) return STATUS.PROPOSED;

  const ageDays = ageInDays(a.verified, now);
  if (ageDays === null) return STATUS.PROPOSED;

  // Good through its last day (ttl days after verification), lapsed the next.
  const ttl = a.ttlDays ?? DEFAULT_TTL_DAYS;
  if (ageDays > ttl) return STATUS.EXPIRED;
  return STATUS.ATTESTED;
}

/**
 * Whole days until the attestation lapses: 0 on its last good day, negative
 * once lapsed. Counted in calendar days on the reader's clock.
 * @param {Record} record
 * @param {Date} [now]
 * @returns {number|null} Null when the record has no readable date.
 */
export function daysRemaining(record, now = new Date()) {
  const a = record?.attestation;
  if (!a?.verified) return null;
  const ageDays = ageInDays(a.verified, now);
  if (ageDays === null) return null;
  return (a.ttlDays ?? DEFAULT_TTL_DAYS) - ageDays;
}

/**
 * Can this record be worked from without a second look?
 * Only attested records clear. Proposed, expired and rejected all need a human.
 */
/**
 * True only for a current attestation. Proposed, expired and rejected
 * records all return false.
 * @param {Record} record
 * @param {Date} [now]
 * @returns {boolean}
 */
export function isTrusted(record, now = new Date()) {
  return resolveStatus(record, now) === STATUS.ATTESTED;
}

/**
 * Promote a proposed record by having a named practitioner sign it.
 *
 * Returns a new record — the original is never mutated, so the proposal
 * survives alongside what the practitioner actually ratified. Throws rather
 * than failing quietly: a silent refusal here would be the exact failure the
 * module exists to prevent.
 */
/**
 * Have a named human sign a record. Returns a new record; never mutates.
 * @param {Record} record
 * @param {object} signature
 * @param {string} signature.by         Required. Anonymous sign-off is not sign-off.
 * @param {string} [signature.role]
 * @param {string} signature.basis      Required. What grounds the assertion.
 * @param {string} [signature.verified] ISO date. Defaults to today.
 * @param {number} [signature.ttlDays]  Defaults to 730.
 * @returns {Record} A new record with practitioner provenance.
 * @throws {Error} If `by` or `basis` is missing, or the date is unreadable.
 */
export function attest(record, { by, role, basis, verified, ttlDays } = {}) {
  if (!by || !String(by).trim()) {
    throw new Error("Attestation requires a named person. Anonymous sign-off is not sign-off.");
  }
  if (!basis || !String(basis).trim()) {
    throw new Error(`${by} must state what the assertion is grounded in.`);
  }
  const date = verified ?? todayISO();
  if (dayOf(date) === null) {
    throw new Error(`"${date}" is not a readable verification date.`);
  }

  return {
    ...record,
    attestation: {
      source: SOURCE.PRACTITIONER,
      by: String(by).trim(),
      role: role ?? null,
      basis: String(basis).trim(),
      verified: date,
      ttlDays: ttlDays ?? DEFAULT_TTL_DAYS,
      supersedes: buildSupersedes(record.attestation)
    }
  };
}

/**
 * Record that a practitioner reviewed a value and turned it down.
 *
 * Rejection is a finding, not a deletion. The values stay in the dataset with
 * the reasoning attached, because "somebody tried this and it was wrong" is
 * worth more to the next reader than a gap where the record used to be.
 *
 * Only a named human can reject, for the same reason only a named human can
 * attest: an unattributed judgement is not a judgement.
 */
/**
 * Record that a named human reviewed a value and turned it down. The values
 * stay in the dataset with the reasoning attached — a rejection is a finding,
 * not a deletion.
 * @param {Record} record
 * @param {object} review
 * @param {string} review.by         Required.
 * @param {string} [review.role]
 * @param {string} review.reason     Required. Why it was turned down.
 * @param {string} [review.reviewed] ISO date. Defaults to today.
 * @returns {Record} A new record carrying the rejection.
 * @throws {Error} If `by` or `reason` is missing, or the date is unreadable.
 */
export function reject(record, { by, role, reason, reviewed } = {}) {
  if (!by || !String(by).trim()) {
    throw new Error("Rejection requires a named person. An anonymous veto is not a finding.");
  }
  if (!reason || !String(reason).trim()) {
    throw new Error(`${by} must say why the value was turned down.`);
  }
  const date = reviewed ?? todayISO();
  if (dayOf(date) === null) {
    throw new Error(`"${date}" is not a readable review date.`);
  }

  return {
    ...record,
    attestation: {
      ...record.attestation,
      rejection: {
        by: String(by).trim(),
        role: role ?? null,
        reason: String(reason).trim(),
        reviewed: date
      }
    }
  };
}

/** What a new attestation replaced, so the trail survives the promotion. */
function buildSupersedes(prev) {
  if (!prev) return null;
  const entry = {};
  if (prev.source === SOURCE.MODEL) {
    entry.source = SOURCE.MODEL;
    entry.model = prev.model ?? null;
  }
  if (prev.rejection) entry.rejection = prev.rejection;
  if (!Object.keys(entry).length) return prev.supersedes ?? null;
  return entry;
}

/** Build a model proposal. There is deliberately no path from here to attested. */
/**
 * Build a model proposal. There is deliberately no path from here to
 * attested — only `attest()` with a named human can do that.
 * @param {object} bands Your payload. Shape is entirely yours.
 * @param {object} [origin]
 * @param {string} [origin.model]     Which model produced it.
 * @param {string} [origin.rationale] Its stated reasoning, so it can be argued with.
 * @returns {Record}
 */
export function propose(bands, { model, rationale } = {}) {
  return {
    bands,
    attestation: {
      source: SOURCE.MODEL,
      model: model ?? "unspecified model",
      rationale: rationale ?? null,
      by: null,
      verified: null
    }
  };
}

/** Count records by resolved status. */
/**
 * Count records by resolved status.
 * @param {Record[]} records
 * @param {Date} [now]
 * @returns {{proposed: number, attested: number, expired: number, rejected: number}}
 */
export function tally(records, now = new Date()) {
  const counts = { proposed: 0, attested: 0, expired: 0, rejected: 0 };
  for (const record of records) counts[resolveStatus(record, now)] += 1;
  return counts;
}
