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
| 3 | **Review the findings** in `review/queue.json` (`npm run review -- list`). The agent pre-filled recommendations in each item's `review.note`, but every decision is still `pending` except the ones listed under "Review status" below. Approve or reject: `npm run review -- approve <subject> --reviewer <your name>` / `reject ... --note "why"`. About 15 minutes. | **Owner** | ☐ |
| 4 | Publish the approved findings to the live testnet registry: `npm run publish:registry` (dry run, read the list), then `npm run publish:registry -- --send`. Commit the new `evidence/` files and `review/queue.json` and push, so the evidence URLs resolve once the repo is public. | **Owner** (or agent after your go-ahead) | ☐ |
| 5 | Watch the demo video once: [`docs/video/mimicwatch-demo.mp4`](video/mimicwatch-demo.mp4). It names real mainnet accounts and domains as findings; make sure you are comfortable with each label shown. Say OK or what to change. | **Owner** | ☐ |
| 6 | Final code freeze: `git tag hackathon-submission && git push --tags` (Q-003). The judged diff is `pre-hackathon..hackathon-submission`. | Owner / agent | ☐ |
| 7 | **Make the repo public** before 2026-11-14T23:59Z and keep it public through judging (Q-014). | **Owner** | ☐ |
| 8 | Publish the X demo post from your account (drafts below). It must say it was built at NEAR HACKATHON, tag **@NEARProtocol** and **#NEARHackathon**, and attach the video (upload the mp4 directly). | **Owner** | ☐ |
| 9 | Fill in the fields below, check the printed JSON payload, then send it via https://nearhackathon.com/#apply or the API. | **Owner** confirms; then send | ☐ |
| 10 | Q-015: both READMEs must name the other project. Done: this README names PurseStrings; PurseStrings' README names Mimicwatch for NEAR (commit `003125f` in that repo, pushed). | Agent | ☑ |
| 11 | Keep the testnet registry up until at least 2026-11-18, ideally 2026-11-25 (nothing to do: testnet accounts persist). | — | ☑ |

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

About 1678 characters (limit 2000). The numbers come from the recorded scan; if the owner publishes findings to the live registry first, add one sentence saying so.

> Scammers on NEAR use names that look like the projects users trust: lookalike accounts (linear_protocol.near next to linear-protocol.near), fake "rewards" tokens and clones of dApp sites. A wallet's send screen or an AI agent cannot tell them apart. Mimicwatch for NEAR finds them, has a person review them, and publishes the confirmed ones to an on-chain registry that any wallet or agent queries with one view call before it sends funds or opens a link. The scanner generates 30k lookalikes of 72 official accounts of 34 NEAR dApps (NEAR ids are ASCII-only, so the tricks are confusable letters, separators, lure words and fake sub-accounts), checks which exist with RPC view_account, and scores each from on-chain facts via free FastNEAR indexers: creator, age, keys, contract, token metadata, holders, who paid it. Address-poisoning dust and brand-owned names are labelled, not flagged. Lookalike domains come from our existing Mimicwatch engine. First scan (2026-11-01): 507 lookalikes exist, including a fake-airdrop campaign of three NEP-141 tokens named after LiNEAR, Meta Pool and Burrow held by 2,205, 9,434 and 7,079 accounts, and a Rhea app clone asking for seed phrases that no wallet blocklist had listed. Nothing publishes itself: only reviewed high/critical findings are written to the registry contract (Rust, NEAR testnet) with the sha256 of their evidence. is_flagged(id) also covers sub-accounts and subdomains of flagged entries; anyone can dispute an entry with a deposit (BLOCK becomes WARN), and the owner keeps or clears it. An SDK, CLI, HTTP API and an MCP tool (check_near_recipient) return ALLOW/WARN/BLOCK with reasons.

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

**File:** [`docs/video/mimicwatch-demo.mp4`](video/mimicwatch-demo.mp4): 1:54 (113.9 s), 1920x1080, 30 fps, H.264 + AAC
48 kHz, about 8 MB, -16 LUFS. Under X's 2:20 upload limit for accounts without Premium, and under 50 MB, so it is
committed as a normal file. Subtitles are burned into the picture. The same text is also a soft English track inside the
mp4 and a separate file, [`docs/video/mimicwatch-demo.en.srt`](video/mimicwatch-demo.en.srt).

**What it shows:** the recorded mainnet scan is re-scored. One finding is shown up close (the fake LiNEAR rewards token),
then the labelled false positives, the domain findings, and the review queue with the publisher's skip reasons. The
approved findings are published to the registry contract on a **local NEAR node**, and the evidence hash is checked
against the chain. An agent then checks five recipients (BLOCK, BLOCK via parent, ALLOW official, WARN unreviewed
lookalike, BLOCK phishing link). Finally an entry is disputed (WARN) and the owner keeps it (BLOCK). An end card follows.

**How it was made:** `npm run demo:record` records `npm run demo` into an asciicast with viewer events. `npm run
demo:render` renders [`viewer.html`](video/viewer.html) frame by frame in headless Chromium (Playwright) and pipes the
frames to ffmpeg. The voice is macOS `say -v Samantha`, one clip per subtitle line. Each line starts when its event
appears; between lines the recording plays at up to 2.5x speed, or holds while the voice finishes.

**Checked:** speech onsets (ffmpeg `silencedetect`) match the subtitle cues to within about 10 ms. Frames at 21
timestamps were inspected, and each shows the event being narrated. The file decodes with no errors. Integrated
loudness is -16.0 LUFS.

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
