# Draft reports: Orderly Network (2026-11-01)

**DRAFT - NOT FILED. File only after the brand owner approves it and has signed a Letter of Authorisation.**


## orderlyreward.network (high, phishing-likely, 70/100)

### Registrar abuse report to NICENIC INTERNATIONAL GROUP CO., LIMITED

**File at:** abuse@nicenic.net  
**Subject:** Phishing / brand impersonation: orderlyreward.network impersonates Orderly Network

```text
DRAFT - NOT FILED. File only after the brand owner approves it and has signed a Letter of Authorisation.

Hello NICENIC INTERNATIONAL GROUP CO., LIMITED abuse team,

The domain orderlyreward[.]network (registered with you on 2026-03-29) is being used to impersonate Orderly Network, a crypto project whose official site is hxxps://orderly[.]network. We ask you to suspend the domain under your abuse policy and the RAA section 3.18 obligations.

Evidence (observed 2026-11-01, read-only, URLs defanged):
- URL: hxxps://orderlyreward[.]network/
- Brand name plus a phishing lure word
- Already on public wallet blocklist(s): scamsniffer
- Host already shows a phishing warning instead of the site ("Suspected Phishing | Cloudflare")
- Resolves to 172.67.214.20, 104.21.42.249
- Page title: "Suspected Phishing | Cloudflare"

We are not affiliated with the operator of orderlyreward[.]network. Orderly Network has not authorised its use of the brand. Screenshots and HTML captures are available on request.

Regards,
{{REPORTER_NAME}}
{{REPORTER_ORG}}, acting for Orderly Network under a Letter of Authorisation dated {{LOA_DATE}}
{{REPORTER_EMAIL}}
```

> Registrar IANA ID 3765, abuse phone +852.68584411

### Hosting abuse report to Cloudflare, Inc.

**File at:** https://abuse.cloudflare.com/  
**Subject:** Phishing site hosted on your network: orderlyreward.network (Orderly Network impersonation)

```text
DRAFT - NOT FILED. File only after the brand owner approves it and has signed a Letter of Authorisation.

Hello Cloudflare, Inc.,

hxxps://orderlyreward[.]network/ (172.67.214.20, 104.21.42.249) is hosted on your network and impersonates Orderly Network (official: hxxps://orderly[.]network).

Evidence (observed 2026-11-01):
- Brand name plus a phishing lure word
- Already on public wallet blocklist(s): scamsniffer
- Host already shows a phishing warning instead of the site ("Suspected Phishing | Cloudflare")
- Resolves to 172.67.214.20, 104.21.42.249
- Page title: "Suspected Phishing | Cloudflare"

Please take the content down under your acceptable use policy.

Regards,
{{REPORTER_NAME}}
{{REPORTER_ORG}}, acting for Orderly Network under a Letter of Authorisation dated {{LOA_DATE}}
{{REPORTER_EMAIL}}
```

> Email alternative: abuse@cloudflare.com

### Google Safe Browsing report

**File at:** https://safebrowsing.google.com/safebrowsing/report_phish/?url=https%3A%2F%2Forderlyreward.network%2F

- **Report Type:** `This page is not safe`
- **Threat Type:** `Social engineering (phishing) - pick the closest option shown`
- **Threat Category:** `Pick the closest option shown (impersonation / phishing)`
- **URL to report:** `https://orderlyreward.network/`
- **Additional details (max 800):** `Impersonates Orderly Network (official: https://orderly.network). Already on public wallet blocklist(s): scamsniffer; Host already shows a phishing warning instead of the site ("Suspected Phishing | Cloudflare"); Brand name plus a phishing lure word.`

```text
DRAFT - NOT FILED. File only after the brand owner approves it and has signed a Letter of Authorisation.

Impersonates Orderly Network (official: https://orderly.network). Already on public wallet blocklist(s): scamsniffer; Host already shows a phishing warning instead of the site ("Suspected Phishing | Cloudflare"); Brand name plus a phishing lure word.
```

> Web form with reCAPTCHA: a person has to submit it.

### Netcraft report

**File at:** https://report.netcraft.com/report

- **The URL of the site:** `https://orderlyreward.network/`
- **Further details:** `Impersonates Orderly Network (official: https://orderly.network). Already on public wallet blocklist(s): scamsniffer; Host already shows a phishing warning instead of the site ("Suspected Phishing | Cloudflare"); Brand name plus a phishing lure word.`
- **Your email address:** `{{REPORTER_EMAIL}}`

```text
DRAFT - NOT FILED. File only after the brand owner approves it and has signed a Letter of Authorisation.

Impersonates Orderly Network (official: https://orderly.network). Already on public wallet blocklist(s): scamsniffer; Host already shows a phishing warning instead of the site ("Suspected Phishing | Cloudflare"); Brand name plus a phishing lure word.
```

> Web form with reCAPTCHA. Netcraft feeds many browser and registrar blocklists.

### MetaMask eth-phishing-detect: blocklist addition issue

**File at:** https://github.com/MetaMask/eth-phishing-detect/issues/new?template=01-blocklist-addition.yaml

- **Malicious domains, IPs, IPFS hashes, or IPNS names:** `https://orderlyreward.network/`
- **Please explain why this content is malicious:** `Impersonates Orderly Network (official: https://orderly.network). Already on public wallet blocklist(s): scamsniffer; Host already shows a phishing warning instead of the site ("Suspected Phishing | Cloudflare"); Brand name plus a phishing lure word. Observed 2026-11-01. Reported on behalf of Orderly Network.`
- **Is this a duplicate request?:** `Search open issues for the domain first, then tick the box`

```text
DRAFT - NOT FILED. File only after the brand owner approves it and has signed a Letter of Authorisation.

Impersonates Orderly Network (official: https://orderly.network). Already on public wallet blocklist(s): scamsniffer; Host already shows a phishing warning instead of the site ("Suspected Phishing | Cloudflare"); Brand name plus a phishing lure word.
```

### MetaMask eth-phishing-detect: alternative PR (slower; most merges are bot syncs)

**File at:** https://github.com/MetaMask/eth-phishing-detect

```text
DRAFT - NOT FILED. File only after the brand owner approves it and has signed a Letter of Authorisation.

git checkout -b block-orderlyreward.network
yarn add:blocklist orderlyreward.network

PR title: Block orderlyreward.network (Orderly Network impersonation)
PR body: Impersonates Orderly Network (official: https://orderly.network). Already on public wallet blocklist(s): scamsniffer; Host already shows a phishing warning instead of the site ("Suspected Phishing | Cloudflare"); Brand name plus a phishing lure word.
```
