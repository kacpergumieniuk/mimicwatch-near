# Provenance of `engine/` (pre-existing code, baseline)

This folder is a verbatim copy of the **Mimicwatch** brand-impersonation engine, taken from commit
`2d9dfbb` of the private repository `kacpergumieniuk/brandwatch` (same author). Nothing in it is NEAR-specific.

- **Written:** 2026-11-01, in that separate repository, for EVM projects (lookalike domains, fake sites and copycat
  tokens on Base and Ethereum). It existed before this repository was created.
- **What it contains:** dnstwist-style domain permutations, DNS, Certificate Transparency (crt.sh), newly registered
  domains (WhoisDS), wallet-blocklist status (MetaMask, ScamSniffer), page fingerprints (HTTP + Playwright), scoring and
  labels, RDAP abuse contacts, draft reports, and a vendored copy of the Canisell Base token-risk engine
  (`src/vendor/canisell`, see its own `ATTRIBUTION.md`).
- **How it is treated in the hackathon:** as baseline (NEAR HACKATHON rules Q-002 and Q-005). This repository's first
  commit contains only this folder and is tagged `pre-hackathon`. Everything after that tag is the NEAR integration and is
  what we ask judges to review: `git diff pre-hackathon..HEAD`.
- **Changes after the tag:** listed in the root README ("What existed before vs what was built in the window").
- **License:** the original repository is unlicensed (private). Its author releases this copy under the MIT license of
  this repository.
