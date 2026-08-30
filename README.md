# attestation-ledger

[![test](https://github.com/davidpetry-cloud/attestation-ledger/actions/workflows/test.yml/badge.svg)](https://github.com/davidpetry-cloud/attestation-ledger/actions/workflows/test.yml)

Provenance for expert assertions, enforced in code rather than promised in a README.

> **A model can propose. Only a named human can attest.**

A value in an expert reference — an EQ starting point, a clinical threshold, a
safety limit, a style rule — is not a fact. It is an assertion made by someone,
grounded in something, at a point in time. Most documents flatten that into a
bare number. This library keeps the provenance attached and makes one rule
structurally unbreakable: no combination of fields can promote a model-generated
value to attested. There is no code path from machine output to human sign-off.

## Install

```bash
npm install attestation-ledger
```

Zero dependencies. ES modules. ~200 lines you can read in one sitting.

## The four states

| State | Means |
|---|---|
| `proposed` | A model produced it, or nobody has signed it. A hypothesis, not a reference. |
| `attested` | A named human signed it, stated what grounds it, and dated it — and the date is still inside its shelf life. |
| `expired` | It was signed, but the shelf life ran out. Re-verify before working from it. |
| `rejected` | A named human reviewed it and turned it down, with the reason recorded. Kept, not deleted — "somebody tried this and it was wrong" is worth more than a gap. |

Status is **derived, never stored**. It is computed from the verification date
and TTL every time you ask, so an attestation decays on its own unless somebody
re-checks it against reality. A rejection is the exception: it does not decay,
and it stands until superseded by a new attestation.

## Usage

```js
import {
  propose, attest, reject,
  resolveStatus, isTrusted, daysRemaining, tally
} from "attestation-ledger";

// A model proposes a value, with its reasoning attached
const proposal = propose(
  { hpf: "IN", lf: -5 },
  { model: "Claude (Anthropic)", rationale: "Inferred from the bright-instrument pattern" }
);

resolveStatus(proposal);  // "proposed" — and nothing can change that except a human

// A named practitioner ratifies it
const signed = attest(proposal, {
  by: "David Petry",
  role: "FOH engineer",
  basis: "Verified at the console with the instrument in the room",
  verified: "2026-08-27",
  ttlDays: 730
});

resolveStatus(signed);    // "attested"
isTrusted(signed);        // true
daysRemaining(signed);    // 730, counting down

// Or turns it down — a finding, not a deletion
const turned = reject(proposal, {
  by: "David Petry",
  reason: "Low cut far too aggressive — the instrument's body sits lower than assumed"
});

resolveStatus(turned);    // "rejected", and it stays rejected until superseded
```

### The guarantees, enforced by code and covered by tests

- **Models never resolve to attested.** A model-sourced record with a real
  name, a real date and a convincing basis smuggled into its fields still
  resolves to `proposed`. There is a test that attempts exactly this attack.
- **Attestation requires a name and a stated basis.** `attest()` throws
  without both. An anonymous sign-off is not a sign-off; an ungrounded one
  cannot be argued with.
- **Rejection requires a name and a reason.** Same logic, same enforcement.
- **Nothing mutates.** `attest()` and `reject()` return new records. When a
  proposal is ratified, the original survives in `supersedes` — you can always
  see what was proposed versus what a human actually signed.
- **Attestations decay; rejections do not.** A claim about the world goes
  stale as the world changes. A finding about the claim itself stands until
  somebody supersedes it.

## API

| Function | Does |
|---|---|
| `propose(payload, { model, rationale })` | Build a model proposal. Deliberately no path from here to attested. |
| `attest(record, { by, role, basis, verified, ttlDays })` | Named human signs a record. Throws without `by` and `basis`. Returns a new record. |
| `reject(record, { by, role, reason, reviewed })` | Named human turns a record down. Throws without `by` and `reason`. Returns a new record. |
| `resolveStatus(record, now?)` | Derive `proposed` / `attested` / `expired` / `rejected`. Rejection outranks everything; the model check outranks the rest. |
| `isTrusted(record, now?)` | `true` only for a current attestation. |
| `daysRemaining(record, now?)` | Days until the attestation lapses. Negative once overdue. |
| `tally(records, now?)` | Counts by resolved status. |
| `SOURCE`, `STATUS`, `DEFAULT_TTL_DAYS` | Constants. Default TTL is 730 days. |

Records are plain objects. The library owns the `attestation` field on them and
nothing else — your payload shape is your business.

## Design decisions worth knowing

**Resolution order is deliberate and fail-safe.** Rejection short-circuits
first — safe, because a rejection can only ever make a record *less* trusted.
The model check runs second, before anything else can promote. Everything
after resolves on dates.

**Rejected values stay in the dataset.** Deleting a rejected record loses the
finding and invites the next person to propose the same wrong thing.

**Status has no setter.** If you find yourself wanting to write
`record.status = "attested"`, that impulse is the exact failure this library
exists to prevent.

## Where it came from

Extracted from the [Live Sound EQ SOP](https://github.com/davidpetry-cloud/live-sound-eq-sop)
— a field reference for front-of-house audio engineers where every EQ value
carries a record of who asserted it and what grounds it. The engine was reused
unchanged across two domains (channel values, then bus routing policy) before
being published; nothing in it knows about audio.

The underlying concern is older than the tooling: expert knowledge moves
through communities informally, gets absorbed into "common knowledge," and the
people who earned it disappear from the record. As models generate more
operational content, the difference between *"a practitioner verified this"*
and *"a model produced something plausible"* becomes load-bearing. This
library makes that difference a data structure instead of a hope.

## Maintenance

Maintained as working infrastructure for the author's own tools. Bug reports
welcome; the API surface is small and intended to stay that way. Feature
requests that weaken the core rule will be declined — that includes any
mechanism for programmatic attestation, however reasonable the use case
sounds.

## License

MIT — see [LICENSE](LICENSE).
