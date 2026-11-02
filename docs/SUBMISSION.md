# NEAR HACKATHON submission kit: Mimicwatch for NEAR

Source of the rules: https://nearhackathon.com/HACKATHON.md (re-read before submitting; it can change).
Deadline: **2026-11-14T23:59:00Z**. One submission per project. It **cannot be edited**, and a second submission of the
same repo is rejected. This is the owner's **second** project (max 2 per person, Q-015); the first is PurseStrings.

**Kill rule (DECISIONS.md D24):** if by **2026-11-14 12:00 UTC** this project is not at PurseStrings' quality bar,
do not submit it.

## Owner checklist (in order)

Steps marked **Owner** are ones the agent must not do (rules: "Never without the human's explicit confirmation").

| # | Step | Who | Done |
|---|---|---|---|
| 1 | Use the **same NEAR mainnet payout account** as for PurseStrings (or another one you control). Never let an agent invent or create it. | **Owner** | ☐ |
| 2 | Private repo `github.com/kacpergumieniuk/mimicwatch-near` exists and is pushed, with the `pre-hackathon` tag on the vendored engine. | Agent | ☑ |
| 3 | **Review.** Done by the agent on 2026-11-01 (reviewer `claude-4b47`): 33 approved (only findings already on a MetaMask/ScamSniffer blocklist, or verified fake tokens and page clones), 4 rejected, 4 watch; 54 medium stay pending (medium cannot be published). **Owner, optional (about 10 min):** read the 33 with `npm run review -- list --decision approve` and `npm run review -- show <subject>`; if you disagree with one, tell the agent, which removes it from the registry (`remove`, owner key). The README states that the AI agent was the reviewer. | Agent; **Owner** may re-check | ☑ |
| 4 | Publish the approved findings to the live testnet registry. Done: 33 entries on `registry.mimicwatch-e7iig5g5.testnet` (checked with `check_many` on 2026-11-02), evidence files committed in `evidence/` (commit `59f7a03`). The evidence URLs resolve once the repo is public. | Agent | ☑ |
| 5 | Watch the demo video once: [`docs/video/mimicwatch-demo.mp4`](video/mimicwatch-demo.mp4). It names real mainnet accounts and domains as findings; make sure you are comfortable with each label shown. Say OK or what to change. | **Owner** | ☐ |
| 6 | Final code freeze: `git tag hackathon-submission && git push --tags` (Q-003). The judged diff is `pre-hackathon..hackathon-submission`. | Owner / agent | ☐ |
| 7 | **Make the repo public** before 2026-11-14T23:59Z and keep it public through judging (Q-014). | **Owner** | ☐ |
| 8 | Publish the X demo post from your account (drafts below). It must say it was built at NEAR HACKATHON, tag **@NEARProtocol** and **#NEARHackathon**, and attach the video (upload the mp4 directly). | **Owner** | ☐ |
| 9 | Fill in the fields below, check the printed JSON payload, then send it via https://nearhackathon.com/#apply or the API. | **Owner** confirms; then send | ☐ |
| 10 | Q-015: both READMEs must name the other project. Done: this README names PurseStrings; PurseStrings' README names Mimicwatch for NEAR (commit `003125f` in that repo, pushed). | Agent | ☑ |
| 11 | Keep the testnet registry up until at least 2026-11-18, ideally 2026-11-25 (nothing to do: testnet accounts persist). | — | ☑ |

## Rules check (re-read 2026-11-02)

https://nearhackathon.com/HACKATHON.md and the site FAQ were re-read on 2026-11-02; the full audit is in the HQ repo,
`research/hackathon-readiness-2026-11.md`. Changes since the kit was written: Q-001 now counts code from the
2026-10-19 announcement (the README says how that affects `engine/`). Judging: Claude Code and Codex first check that
the project runs and does what the README says; human judges then decide, guided by technical implementation, design,
impact, originality and sustainability. The X post has to be public and published by the human; the rules do not say it
must come from a personal account.

## Submission fields

The API (`POST https://nearhackathon.com/api/applications`) accepts exactly these fields. Do not add others;
`website` is a spam trap. Values marked **owner decides** must come from you; the agent must not guess them.

| Field | Rule | Value |
|---|---|---|
| `requestId` | UUID, generated once (`uuidgen \| tr A-Z a-z`), reused on retries | generate at submit time |
| `projectName` | 2–80 chars | **owner decides** (suggestion: `Mimicwatch for NEAR: lookalike-account and phishing registry`, 59 chars) |
| `leadName` | 2–80 chars | **owner decides** (same as PurseStrings) |
| `email` | valid, ≤160 chars, ≤2 submissions per email | **owner decides** (same email is fine: this is submission 2 of 2) |
| `size` | one of `1`, `2 - 4`, `4 - 6`, `6 - 8`, `8+` (exactly) | **owner decides** (likely `1`) |
| `tracks` | ids from the tracks table, each once | **owner decides** (suggestion: `["security", "open"]`; `security` asks for "reputation and scam detection") |
| `nearAddress` | mainnet payout account, lowercase, 2–64 chars | **owner provides** (step 1) |
| `projectUrl` | public repo URL, ≤300 chars, unique | `https://github.com/kacpergumieniuk/mimicwatch-near` (after step 7) |
| `demoUrl` | public X post URL, ≤300 chars | after step 8 |
| `idea` | 20–2000 chars | draft below; owner edits |
| `consent` | `true` only after the owner agrees to the notice below | **owner** |

**Consent notice. Read it to the owner verbatim:**
"I agree that the organizers may use these details to review our submission and contact us about this hackathon."

### `idea` draft

About 1780 characters (limit 2000). The numbers come from the recorded scan.

> Scammers on NEAR use names that look like the projects users trust: lookalike accounts (linear_protocol.near next to linear-protocol.near), fake "rewards" tokens and clones of dApp sites. A wallet's send screen or an AI agent cannot tell them apart. Mimicwatch for NEAR finds them, has a person review them, and publishes the confirmed ones to an on-chain registry that any wallet or agent queries with one view call before it sends funds or opens a link. The scanner generates 30k lookalikes of 72 official accounts of 34 NEAR dApps (NEAR ids are ASCII-only, so the tricks are confusable letters, separators, lure words and fake sub-accounts), checks which exist with RPC view_account, and scores each from on-chain facts via free FastNEAR indexers: creator, age, keys, contract, token metadata, holders, who paid it. Address-poisoning dust and brand-owned names are labelled, not flagged. Lookalike domains come from our existing Mimicwatch engine. First scan (2026-11-01): 507 lookalikes exist, including a fake-airdrop campaign of three NEP-141 tokens named after LiNEAR, Meta Pool and Burrow held by 2,205, 9,434 and 7,079 accounts, and a Rhea app clone asking for seed phrases that no wallet blocklist had listed. Nothing publishes itself: only reviewed high/critical findings are written to the registry contract (Rust, NEAR testnet) with the sha256 of their evidence. is_flagged(id) also covers sub-accounts and subdomains of flagged entries; anyone can dispute an entry with a deposit (BLOCK becomes WARN), and the owner keeps or clears it. An SDK, CLI, HTTP API and an MCP tool (check_near_recipient) return ALLOW/WARN/BLOCK with reasons. Live now: 33 reviewed findings (the three fake tokens, the Rhea clone and 29 more phishing domains) are in the testnet registry.

Check the length before sending: `node -e 'console.log(process.argv[1].length)' "<text>"`.

### Payload template (do not send as is)

```json
{
  "requestId": "<uuid generated once>",
  "projectName": "<owner>",
  "leadName": "<owner>",
  "email": "<owner>",
  "size": "<owner: 1 | 2 - 4 | ...>",
  "tracks": ["security", "open"],
  "nearAddress": "<owner's mainnet account>",
  "projectUrl": "https://github.com/kacpergumieniuk/mimicwatch-near",
  "demoUrl": "https://x.com/<owner>/status/<id>",
  "idea": "<final text>",
  "consent": true
}
```

Responses: 201 saved · 400 fix the listed `fields`, resend with the same `requestId` · 403 window closed or cross-site; do
not retry · 409 repo already submitted or email limit reached; ask, do not work around it · 413 shorten `idea` · 503 wait
a minute, resend with the same `requestId`. Do not commit the filled payload; it contains personal data.

## Demo video (ready)

**File:** [`docs/video/mimicwatch-demo.mp4`](video/mimicwatch-demo.mp4): 2:10 (130.5 s), 1920x1080, 30 fps, H.264 + AAC
48 kHz, about 9 MB, -16 LUFS. Under X's 2:20 upload limit for accounts without Premium, and under 50 MB, so it is
committed as a normal file. Subtitles are burned into the picture, large enough to read on a phone (54 px on 1080p, at most two lines, on a dark box). The same text is also a soft English track inside the
mp4 and a separate file, [`docs/video/mimicwatch-demo.en.srt`](video/mimicwatch-demo.en.srt).

**What it shows:** the recorded mainnet scan is re-scored. One finding is shown up close (the fake LiNEAR rewards token),
then the labelled false positives, the domain findings, and the review queue with the publisher's skip reasons. The
approved findings are published to the registry contract on a **local NEAR node**, and the evidence hash is checked
against the chain. An agent then checks five recipients (BLOCK, BLOCK via parent, ALLOW official, WARN unreviewed
lookalike, BLOCK phishing link). Finally an entry is disputed (WARN) and the owner keeps it (BLOCK). An end card follows.

**How it was made:** `npm run demo:record` records `npm run demo` into an asciicast with viewer events. `npm run
demo:render` renders [`viewer.html`](video/viewer.html) frame by frame in headless Chromium (Playwright) and pipes the
frames to ffmpeg. The voice is Kokoro TTS (local, Apache-2.0, voice `am_michael`), one clip per caption, so each caption is on
screen exactly while it is spoken. Each line starts when its event appears; between lines the recording plays at up to 2.5x speed, or holds while the voice finishes.

**Checked (re-rendered 2026-11-02):** captions are timed from the voice clips themselves, and the soft track matches the
.srt. Frames at several timestamps were inspected: captions are legible and inside the frame, and each shows the event
being narrated. The file decodes with no errors. Integrated loudness is -16.3 LUFS.

**What it says, and what it does not:** the voice says the registry runs on a local NEAR node and that the contract is
live on testnet. The end card says the scan is a recording from 2026-11-01, that the review decisions in the demo are
recorded, and that the voice is synthetic. It names real mainnet accounts and domains as findings: those are the
scanner's labels from public data. The owner should watch it and be comfortable with each one before posting.

**What the owner still has to do:**
1. Watch the mp4 once (QuickTime). Say OK or what to change; re-rendering takes about 3 minutes
   (`npm run demo:record && npm run demo:render`).
2. Upload it directly in the X post (step 8).
3. Optional: to narrate it yourself, make a silent copy that keeps the burned-in subtitles:
   `ffmpeg -i docs/video/mimicwatch-demo.mp4 -map 0:v -c copy docs/video/mimicwatch-demo-silent.mp4`.

Nothing has been uploaded or published.

## X post drafts (owner edits and posts)

Short version: 279 characters (X counts a link as 23). Attach the video.

> Scammers copy NEAR names: fake "rewards" tokens in 9k+ wallets, dApp clones asking for seed phrases.
>
> Mimicwatch finds them, a human reviews, they go on chain. Wallets and agents check before sending.
>
> Built at NEAR HACKATHON: <repo link>
> @NEARProtocol #NEARHackathon

Longer version (needs an account that can post long posts):

> Scammers copy NEAR names: linear_protocol.near next to the real linear-protocol.near, "rewards" tokens named after LiNEAR, Meta Pool and Burrow with 2,205, 9,434 and 7,079 holders, and a Rhea app clone that asks for your seed phrase.
>
> Mimicwatch for NEAR scans for them (30k lookalike names checked on mainnet, plus lookalike domains). A human reviews every finding, and the confirmed ones go into an on-chain registry. A wallet or an AI agent makes one view call before it sends: BLOCK, WARN or ALLOW, with the evidence. Anyone can dispute an entry on chain.
>
> Built at NEAR HACKATHON. Repo + video: <link>
> What should your wallet check before it sends?
>
> @NEARProtocol #NEARHackathon @NearBuilders

Keep @NEARProtocol and #NEARHackathon. @NearLegion and @NearBuilders are optional. The longer post names real
accounts: post it only after you have reviewed those findings (checklist step 3).
