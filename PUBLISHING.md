# Publishing — one-time setup

Everything below runs on **your machine**. Two halves: GitHub (same loop you
already know) and npm (new, one-time account setup).

## 1. GitHub — the loop you already know

Create the repo first: github.com/new → name it exactly `attestation-ledger`
→ Public → do NOT add a README, .gitignore or license (this folder has all
three).

Then from inside this folder:

```bash
git init
git add .
git commit -m "Extract attestation engine from live-sound-eq-sop as a standalone package"
git remote add origin https://github.com/davidpetry-cloud/attestation-ledger.git
git branch -M main
git push -u origin main
```

Check the Actions tab — the test workflow should go green within a minute.

## 2. npm — one-time account setup

1. Create an account at npmjs.com/signup (free)
2. **Enable 2FA immediately** — npmjs.com → profile → Account Settings →
   Two-Factor Authentication. Use an authenticator app. A hijacked npm
   account publishes malware under your name to everyone who installs your
   package; this is not optional.
3. Back in the terminal, log in:

```bash
npm login
```

A browser window opens to authenticate. The terminal confirms when done.

## 3. Verify before publishing

```bash
npm install
npm test          # expect 21 passing
npm pack --dry-run
```

`npm pack --dry-run` lists exactly which files the published package will
contain. Expect: `src/index.js`, `README.md`, `LICENSE`, `package.json` —
and nothing else. If anything unexpected appears in that list, stop and ask
before publishing.

## 4. Publish

```bash
npm publish
```

That's it. The package is live at npmjs.com/package/attestation-ledger within
a minute, and anyone in the world can `npm install attestation-ledger`.

## 5. Versioning from here on

The version in package.json follows semver: `MAJOR.MINOR.PATCH`.

- Fix a bug, change nothing else → bump PATCH (0.1.0 → 0.1.1)
- Add a function, break nothing → bump MINOR (0.1.0 → 0.2.0)
- Change existing behaviour → bump MAJOR

To release: edit the version in package.json, commit, push, then
`npm publish` again. npm refuses to publish the same version twice — that is
a feature, not a bug. A published version is immutable; you can deprecate one
but never silently replace it.

## What NOT to do

- Never publish with failing tests. There is no CI gate on `npm publish` —
  the discipline is yours.
- Never put credentials, tokens or personal email addresses in any committed
  file. Your git noreply email is already configured; leave it.
- Do not delete the GitHub repo after publishing — the README, issues link
  and provenance all point there.
