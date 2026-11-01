# Draft reports: POTLOCK (2026-11-01)

**DRAFT - NOT FILED. File only after the brand owner approves it and has signed a Letter of Authorisation.**


## potlocktoken.org (critical, phishing-likely, 82/100)

### Registrar abuse report to NameCheap, Inc.

**File at:** abuse@namecheap.com  
**Subject:** Phishing / brand impersonation: potlocktoken.org impersonates POTLOCK

```text
DRAFT - NOT FILED. File only after the brand owner approves it and has signed a Letter of Authorisation.

Hello NameCheap, Inc. abuse team,

The domain potlocktoken[.]org (registered with you on 2025-09-05) is being used to impersonate POTLOCK, a crypto project whose official site is hxxps://potlock[.]org. We ask you to suspend the domain under your abuse policy and the RAA section 3.18 obligations.

Evidence (observed 2026-11-01, read-only, URLs defanged):
- URL: hxxps://www[.]potlocktoken[.]org/
- Brand name plus a phishing lure word
- Page title resembles the official title (80%)
- Brand named on the page (18x), including the title
- Wallet-connect prompt/library: connectWallet, walletconnect, web3modal
- Drainer-style JS: eth_signTypedData_v4
- Lure text: eligible
- Resolves to 216.24.57.1
- Page title: "Welcome to the Potlock!"
- Screenshot: shots/potlocktoken.org.jpg (attach)

We are not affiliated with the operator of potlocktoken[.]org. POTLOCK has not authorised its use of the brand. Screenshots and HTML captures are available on request.

Regards,
{{REPORTER_NAME}}
{{REPORTER_ORG}}, acting for POTLOCK under a Letter of Authorisation dated {{LOA_DATE}}
{{REPORTER_EMAIL}}
```

> Registrar IANA ID 1068, abuse phone +1.9854014545

### Hosting abuse report to Render

**File at:** abuse@render.com  
**Subject:** Phishing site hosted on your network: potlocktoken.org (POTLOCK impersonation)

```text
DRAFT - NOT FILED. File only after the brand owner approves it and has signed a Letter of Authorisation.

Hello Render,

hxxps://www[.]potlocktoken[.]org/ (216.24.57.1) is hosted on your network and impersonates POTLOCK (official: hxxps://potlock[.]org).

Evidence (observed 2026-11-01):
- Brand name plus a phishing lure word
- Page title resembles the official title (80%)
- Brand named on the page (18x), including the title
- Wallet-connect prompt/library: connectWallet, walletconnect, web3modal
- Drainer-style JS: eth_signTypedData_v4
- Lure text: eligible
- Resolves to 216.24.57.1
- Page title: "Welcome to the Potlock!"
- Screenshot: shots/potlocktoken.org.jpg (attach)

Please take the content down under your acceptable use policy.

Regards,
{{REPORTER_NAME}}
{{REPORTER_ORG}}, acting for POTLOCK under a Letter of Authorisation dated {{LOA_DATE}}
{{REPORTER_EMAIL}}
```

### Google Safe Browsing report

**File at:** https://safebrowsing.google.com/safebrowsing/report_phish/?url=https%3A%2F%2Fwww.potlocktoken.org%2F

- **Report Type:** `This page is not safe`
- **Threat Type:** `Social engineering (phishing) - pick the closest option shown`
- **Threat Category:** `Pick the closest option shown (impersonation / phishing)`
- **URL to report:** `https://www.potlocktoken.org/`
- **Additional details (max 800):** `Impersonates POTLOCK (official: https://potlock.org). Drainer-style JS: eth_signTypedData_v4; Wallet-connect prompt/library: connectWallet, walletconnect, web3modal; Page title resembles the official title (80%); Brand named on the page (18x), including the title.`

```text
DRAFT - NOT FILED. File only after the brand owner approves it and has signed a Letter of Authorisation.

Impersonates POTLOCK (official: https://potlock.org). Drainer-style JS: eth_signTypedData_v4; Wallet-connect prompt/library: connectWallet, walletconnect, web3modal; Page title resembles the official title (80%); Brand named on the page (18x), including the title.
```

> Web form with reCAPTCHA: a person has to submit it.

### Netcraft report

**File at:** https://report.netcraft.com/report

- **The URL of the site:** `https://www.potlocktoken.org/`
- **Further details:** `Impersonates POTLOCK (official: https://potlock.org). Drainer-style JS: eth_signTypedData_v4; Wallet-connect prompt/library: connectWallet, walletconnect, web3modal; Page title resembles the official title (80%); Brand named on the page (18x), including the title.`
- **Your email address:** `{{REPORTER_EMAIL}}`

```text
DRAFT - NOT FILED. File only after the brand owner approves it and has signed a Letter of Authorisation.

Impersonates POTLOCK (official: https://potlock.org). Drainer-style JS: eth_signTypedData_v4; Wallet-connect prompt/library: connectWallet, walletconnect, web3modal; Page title resembles the official title (80%); Brand named on the page (18x), including the title.
```

> Web form with reCAPTCHA. Netcraft feeds many browser and registrar blocklists.

### MetaMask eth-phishing-detect: blocklist addition issue

**File at:** https://github.com/MetaMask/eth-phishing-detect/issues/new?template=01-blocklist-addition.yaml

- **Malicious domains, IPs, IPFS hashes, or IPNS names:** `https://www.potlocktoken.org/`
- **Please explain why this content is malicious:** `Impersonates POTLOCK (official: https://potlock.org). Drainer-style JS: eth_signTypedData_v4; Wallet-connect prompt/library: connectWallet, walletconnect, web3modal; Page title resembles the official title (80%); Brand named on the page (18x), including the title. Observed 2026-11-01. Reported on behalf of POTLOCK.`
- **Is this a duplicate request?:** `Search open issues for the domain first, then tick the box`

```text
DRAFT - NOT FILED. File only after the brand owner approves it and has signed a Letter of Authorisation.

Impersonates POTLOCK (official: https://potlock.org). Drainer-style JS: eth_signTypedData_v4; Wallet-connect prompt/library: connectWallet, walletconnect, web3modal; Page title resembles the official title (80%); Brand named on the page (18x), including the title.
```

### MetaMask eth-phishing-detect: alternative PR (slower; most merges are bot syncs)

**File at:** https://github.com/MetaMask/eth-phishing-detect

```text
DRAFT - NOT FILED. File only after the brand owner approves it and has signed a Letter of Authorisation.

git checkout -b block-potlocktoken.org
yarn add:blocklist potlocktoken.org

PR title: Block potlocktoken.org (POTLOCK impersonation)
PR body: Impersonates POTLOCK (official: https://potlock.org). Drainer-style JS: eth_signTypedData_v4; Wallet-connect prompt/library: connectWallet, walletconnect, web3modal; Page title resembles the official title (80%); Brand named on the page (18x), including the title.
```

### ScamSniffer scam-database issue

**File at:** https://github.com/scamsniffer/scam-database/issues/new  
**Subject:** [Phishing] potlocktoken.org - POTLOCK impersonation

```text
DRAFT - NOT FILED. File only after the brand owner approves it and has signed a Letter of Authorisation.

Domain: potlocktoken.org
Scam addresses (with chain): {{ADD IF KNOWN, e.g. from a victim's drain tx}}
Impersonates: POTLOCK (official: https://potlock.org)

Evidence (observed 2026-11-01):
- Brand name plus a phishing lure word
- Page title resembles the official title (80%)
- Brand named on the page (18x), including the title
- Wallet-connect prompt/library: connectWallet, walletconnect, web3modal
- Drainer-style JS: eth_signTypedData_v4
- Lure text: eligible
- Resolves to 216.24.57.1
- Page title: "Welcome to the Potlock!"
- Screenshot: shots/potlocktoken.org.jpg (attach)
```

> ScamSniffer asks for issues, not PRs (their JSON is regenerated). Attach the screenshot.


## potlock.io (high, impersonation, 50/100)

### Registrar abuse report

**File at:** (registrar abuse address not found via RDAP: look it up at https://lookup.icann.org)  
**Subject:** Phishing / brand impersonation: potlock.io impersonates POTLOCK

```text
DRAFT - NOT FILED. File only after the brand owner approves it and has signed a Letter of Authorisation.

Hello Abuse Team abuse team,

The domain potlock[.]io (registered with you) is being used to impersonate POTLOCK, a crypto project whose official site is hxxps://potlock[.]org. We ask you to suspend the domain under your abuse policy and the RAA section 3.18 obligations.

Evidence (observed 2026-11-01, read-only, URLs defanged):
- URL: hxxps://www[.]potlock[.]io/
- Official name on a different TLD
- One of 3 lookalikes on the same DNS account (henrik.ns.cloudflare.com + meera.ns.cloudflare.com): a single operator
- Page title resembles the official title (80%)
- Brand named on the page (108x), including the title
- Resolves to 188.114.96.3, 188.114.97.3
- Page title: "POTLOCK | Open Funding Stack & AI-PGF"
- Screenshot: shots/potlock.io.jpg (attach)

We are not affiliated with the operator of potlock[.]io. POTLOCK has not authorised its use of the brand. Screenshots and HTML captures are available on request.

Regards,
{{REPORTER_NAME}}
{{REPORTER_ORG}}, acting for POTLOCK under a Letter of Authorisation dated {{LOA_DATE}}
{{REPORTER_EMAIL}}
```

### Hosting abuse report to MNT-CLOUDFLARE

**File at:** https://abuse.cloudflare.com/  
**Subject:** Phishing site hosted on your network: potlock.io (POTLOCK impersonation)

```text
DRAFT - NOT FILED. File only after the brand owner approves it and has signed a Letter of Authorisation.

Hello MNT-CLOUDFLARE,

hxxps://www[.]potlock[.]io/ (188.114.96.3, 188.114.97.3) is hosted on your network and impersonates POTLOCK (official: hxxps://potlock[.]org).

Evidence (observed 2026-11-01):
- Official name on a different TLD
- One of 3 lookalikes on the same DNS account (henrik.ns.cloudflare.com + meera.ns.cloudflare.com): a single operator
- Page title resembles the official title (80%)
- Brand named on the page (108x), including the title
- Resolves to 188.114.96.3, 188.114.97.3
- Page title: "POTLOCK | Open Funding Stack & AI-PGF"
- Screenshot: shots/potlock.io.jpg (attach)

Please take the content down under your acceptable use policy.

Regards,
{{REPORTER_NAME}}
{{REPORTER_ORG}}, acting for POTLOCK under a Letter of Authorisation dated {{LOA_DATE}}
{{REPORTER_EMAIL}}
```

> Email alternative: abuse@cloudflare.com

### Google Safe Browsing report

**File at:** https://safebrowsing.google.com/safebrowsing/report_phish/?url=https%3A%2F%2Fwww.potlock.io%2F

- **Report Type:** `This page is not safe`
- **Threat Type:** `Social engineering (phishing) - pick the closest option shown`
- **Threat Category:** `Pick the closest option shown (impersonation / phishing)`
- **URL to report:** `https://www.potlock.io/`
- **Additional details (max 800):** `Impersonates POTLOCK (official: https://potlock.org). Page title resembles the official title (80%); Brand named on the page (108x), including the title; Official name on a different TLD; One of 3 lookalikes on the same DNS account (henrik.ns.cloudflare.com + meera.ns.cloudflare.com): a single operator.`

```text
DRAFT - NOT FILED. File only after the brand owner approves it and has signed a Letter of Authorisation.

Impersonates POTLOCK (official: https://potlock.org). Page title resembles the official title (80%); Brand named on the page (108x), including the title; Official name on a different TLD; One of 3 lookalikes on the same DNS account (henrik.ns.cloudflare.com + meera.ns.cloudflare.com): a single operator.
```

> Web form with reCAPTCHA: a person has to submit it.

### Netcraft report

**File at:** https://report.netcraft.com/report

- **The URL of the site:** `https://www.potlock.io/`
- **Further details:** `Impersonates POTLOCK (official: https://potlock.org). Page title resembles the official title (80%); Brand named on the page (108x), including the title; Official name on a different TLD; One of 3 lookalikes on the same DNS account (henrik.ns.cloudflare.com + meera.ns.cloudflare.com): a single operator.`
- **Your email address:** `{{REPORTER_EMAIL}}`

```text
DRAFT - NOT FILED. File only after the brand owner approves it and has signed a Letter of Authorisation.

Impersonates POTLOCK (official: https://potlock.org). Page title resembles the official title (80%); Brand named on the page (108x), including the title; Official name on a different TLD; One of 3 lookalikes on the same DNS account (henrik.ns.cloudflare.com + meera.ns.cloudflare.com): a single operator.
```

> Web form with reCAPTCHA. Netcraft feeds many browser and registrar blocklists.

### MetaMask eth-phishing-detect: blocklist addition issue

**File at:** https://github.com/MetaMask/eth-phishing-detect/issues/new?template=01-blocklist-addition.yaml

- **Malicious domains, IPs, IPFS hashes, or IPNS names:** `https://www.potlock.io/`
- **Please explain why this content is malicious:** `Impersonates POTLOCK (official: https://potlock.org). Page title resembles the official title (80%); Brand named on the page (108x), including the title; Official name on a different TLD; One of 3 lookalikes on the same DNS account (henrik.ns.cloudflare.com + meera.ns.cloudflare.com): a single operator. Observed 2026-11-01. Reported on behalf of POTLOCK.`
- **Is this a duplicate request?:** `Search open issues for the domain first, then tick the box`

```text
DRAFT - NOT FILED. File only after the brand owner approves it and has signed a Letter of Authorisation.

Impersonates POTLOCK (official: https://potlock.org). Page title resembles the official title (80%); Brand named on the page (108x), including the title; Official name on a different TLD; One of 3 lookalikes on the same DNS account (henrik.ns.cloudflare.com + meera.ns.cloudflare.com): a single operator.
```

### MetaMask eth-phishing-detect: alternative PR (slower; most merges are bot syncs)

**File at:** https://github.com/MetaMask/eth-phishing-detect

```text
DRAFT - NOT FILED. File only after the brand owner approves it and has signed a Letter of Authorisation.

git checkout -b block-potlock.io
yarn add:blocklist potlock.io

PR title: Block potlock.io (POTLOCK impersonation)
PR body: Impersonates POTLOCK (official: https://potlock.org). Page title resembles the official title (80%); Brand named on the page (108x), including the title; Official name on a different TLD; One of 3 lookalikes on the same DNS account (henrik.ns.cloudflare.com + meera.ns.cloudflare.com): a single operator.
```

### ScamSniffer scam-database issue

**File at:** https://github.com/scamsniffer/scam-database/issues/new  
**Subject:** [Phishing] potlock.io - POTLOCK impersonation

```text
DRAFT - NOT FILED. File only after the brand owner approves it and has signed a Letter of Authorisation.

Domain: potlock.io
Scam addresses (with chain): {{ADD IF KNOWN, e.g. from a victim's drain tx}}
Impersonates: POTLOCK (official: https://potlock.org)

Evidence (observed 2026-11-01):
- Official name on a different TLD
- One of 3 lookalikes on the same DNS account (henrik.ns.cloudflare.com + meera.ns.cloudflare.com): a single operator
- Page title resembles the official title (80%)
- Brand named on the page (108x), including the title
- Resolves to 188.114.96.3, 188.114.97.3
- Page title: "POTLOCK | Open Funding Stack & AI-PGF"
- Screenshot: shots/potlock.io.jpg (attach)
```

> ScamSniffer asks for issues, not PRs (their JSON is regenerated). Attach the screenshot.


## potlock.xyz (high, impersonation, 50/100)

### Registrar abuse report to Squarespace Domains II LLC

**File at:** abuse-complaints@squarespace.com  
**Subject:** Phishing / brand impersonation: potlock.xyz impersonates POTLOCK

```text
DRAFT - NOT FILED. File only after the brand owner approves it and has signed a Letter of Authorisation.

Hello Squarespace Domains II LLC abuse team,

The domain potlock[.]xyz (registered with you on 2023-07-02) is being used to impersonate POTLOCK, a crypto project whose official site is hxxps://potlock[.]org. We ask you to suspend the domain under your abuse policy and the RAA section 3.18 obligations.

Evidence (observed 2026-11-01, read-only, URLs defanged):
- URL: hxxps://www[.]potlock[.]xyz/
- Official name on a different TLD
- One of 3 lookalikes on the same DNS account (henrik.ns.cloudflare.com + meera.ns.cloudflare.com): a single operator
- Page title resembles the official title (80%)
- Brand named on the page (108x), including the title
- Resolves to 216.150.16.1, 216.150.1.1
- Page title: "POTLOCK | Open Funding Stack & AI-PGF"
- Screenshot: shots/potlock.xyz.jpg (attach)

We are not affiliated with the operator of potlock[.]xyz. POTLOCK has not authorised its use of the brand. Screenshots and HTML captures are available on request.

Regards,
{{REPORTER_NAME}}
{{REPORTER_ORG}}, acting for POTLOCK under a Letter of Authorisation dated {{LOA_DATE}}
{{REPORTER_EMAIL}}
```

> Registrar IANA ID 895, abuse phone +1.6466935324

### Hosting abuse report to Vercel, Inc

**File at:** abuse@vercel.com  
**Subject:** Phishing site hosted on your network: potlock.xyz (POTLOCK impersonation)

```text
DRAFT - NOT FILED. File only after the brand owner approves it and has signed a Letter of Authorisation.

Hello Vercel, Inc,

hxxps://www[.]potlock[.]xyz/ (216.150.16.1, 216.150.1.1) is hosted on your network and impersonates POTLOCK (official: hxxps://potlock[.]org).

Evidence (observed 2026-11-01):
- Official name on a different TLD
- One of 3 lookalikes on the same DNS account (henrik.ns.cloudflare.com + meera.ns.cloudflare.com): a single operator
- Page title resembles the official title (80%)
- Brand named on the page (108x), including the title
- Resolves to 216.150.16.1, 216.150.1.1
- Page title: "POTLOCK | Open Funding Stack & AI-PGF"
- Screenshot: shots/potlock.xyz.jpg (attach)

Please take the content down under your acceptable use policy.

Regards,
{{REPORTER_NAME}}
{{REPORTER_ORG}}, acting for POTLOCK under a Letter of Authorisation dated {{LOA_DATE}}
{{REPORTER_EMAIL}}
```

### Google Safe Browsing report

**File at:** https://safebrowsing.google.com/safebrowsing/report_phish/?url=https%3A%2F%2Fwww.potlock.xyz%2F

- **Report Type:** `This page is not safe`
- **Threat Type:** `Social engineering (phishing) - pick the closest option shown`
- **Threat Category:** `Pick the closest option shown (impersonation / phishing)`
- **URL to report:** `https://www.potlock.xyz/`
- **Additional details (max 800):** `Impersonates POTLOCK (official: https://potlock.org). Page title resembles the official title (80%); Brand named on the page (108x), including the title; Official name on a different TLD; One of 3 lookalikes on the same DNS account (henrik.ns.cloudflare.com + meera.ns.cloudflare.com): a single operator.`

```text
DRAFT - NOT FILED. File only after the brand owner approves it and has signed a Letter of Authorisation.

Impersonates POTLOCK (official: https://potlock.org). Page title resembles the official title (80%); Brand named on the page (108x), including the title; Official name on a different TLD; One of 3 lookalikes on the same DNS account (henrik.ns.cloudflare.com + meera.ns.cloudflare.com): a single operator.
```

> Web form with reCAPTCHA: a person has to submit it.

### Netcraft report

**File at:** https://report.netcraft.com/report

- **The URL of the site:** `https://www.potlock.xyz/`
- **Further details:** `Impersonates POTLOCK (official: https://potlock.org). Page title resembles the official title (80%); Brand named on the page (108x), including the title; Official name on a different TLD; One of 3 lookalikes on the same DNS account (henrik.ns.cloudflare.com + meera.ns.cloudflare.com): a single operator.`
- **Your email address:** `{{REPORTER_EMAIL}}`

```text
DRAFT - NOT FILED. File only after the brand owner approves it and has signed a Letter of Authorisation.

Impersonates POTLOCK (official: https://potlock.org). Page title resembles the official title (80%); Brand named on the page (108x), including the title; Official name on a different TLD; One of 3 lookalikes on the same DNS account (henrik.ns.cloudflare.com + meera.ns.cloudflare.com): a single operator.
```

> Web form with reCAPTCHA. Netcraft feeds many browser and registrar blocklists.

### MetaMask eth-phishing-detect: blocklist addition issue

**File at:** https://github.com/MetaMask/eth-phishing-detect/issues/new?template=01-blocklist-addition.yaml

- **Malicious domains, IPs, IPFS hashes, or IPNS names:** `https://www.potlock.xyz/`
- **Please explain why this content is malicious:** `Impersonates POTLOCK (official: https://potlock.org). Page title resembles the official title (80%); Brand named on the page (108x), including the title; Official name on a different TLD; One of 3 lookalikes on the same DNS account (henrik.ns.cloudflare.com + meera.ns.cloudflare.com): a single operator. Observed 2026-11-01. Reported on behalf of POTLOCK.`
- **Is this a duplicate request?:** `Search open issues for the domain first, then tick the box`

```text
DRAFT - NOT FILED. File only after the brand owner approves it and has signed a Letter of Authorisation.

Impersonates POTLOCK (official: https://potlock.org). Page title resembles the official title (80%); Brand named on the page (108x), including the title; Official name on a different TLD; One of 3 lookalikes on the same DNS account (henrik.ns.cloudflare.com + meera.ns.cloudflare.com): a single operator.
```

### MetaMask eth-phishing-detect: alternative PR (slower; most merges are bot syncs)

**File at:** https://github.com/MetaMask/eth-phishing-detect

```text
DRAFT - NOT FILED. File only after the brand owner approves it and has signed a Letter of Authorisation.

git checkout -b block-potlock.xyz
yarn add:blocklist potlock.xyz

PR title: Block potlock.xyz (POTLOCK impersonation)
PR body: Impersonates POTLOCK (official: https://potlock.org). Page title resembles the official title (80%); Brand named on the page (108x), including the title; Official name on a different TLD; One of 3 lookalikes on the same DNS account (henrik.ns.cloudflare.com + meera.ns.cloudflare.com): a single operator.
```

### ScamSniffer scam-database issue

**File at:** https://github.com/scamsniffer/scam-database/issues/new  
**Subject:** [Phishing] potlock.xyz - POTLOCK impersonation

```text
DRAFT - NOT FILED. File only after the brand owner approves it and has signed a Letter of Authorisation.

Domain: potlock.xyz
Scam addresses (with chain): {{ADD IF KNOWN, e.g. from a victim's drain tx}}
Impersonates: POTLOCK (official: https://potlock.org)

Evidence (observed 2026-11-01):
- Official name on a different TLD
- One of 3 lookalikes on the same DNS account (henrik.ns.cloudflare.com + meera.ns.cloudflare.com): a single operator
- Page title resembles the official title (80%)
- Brand named on the page (108x), including the title
- Resolves to 216.150.16.1, 216.150.1.1
- Page title: "POTLOCK | Open Funding Stack & AI-PGF"
- Screenshot: shots/potlock.xyz.jpg (attach)
```

> ScamSniffer asks for issues, not PRs (their JSON is regenerated). Attach the screenshot.


## potlock.app (high, impersonation, 50/100)

### Registrar abuse report to Squarespace Domains II LLC.

**File at:** abuse-complaints@squarespace.com  
**Subject:** Phishing / brand impersonation: potlock.app impersonates POTLOCK

```text
DRAFT - NOT FILED. File only after the brand owner approves it and has signed a Letter of Authorisation.

Hello Squarespace Domains II LLC. abuse team,

The domain potlock[.]app (registered with you on 2023-07-02) is being used to impersonate POTLOCK, a crypto project whose official site is hxxps://potlock[.]org. We ask you to suspend the domain under your abuse policy and the RAA section 3.18 obligations.

Evidence (observed 2026-11-01, read-only, URLs defanged):
- URL: hxxps://www[.]potlock[.]app/
- Official name on a different TLD
- One of 3 lookalikes on the same DNS account (henrik.ns.cloudflare.com + meera.ns.cloudflare.com): a single operator
- Page title resembles the official title (80%)
- Brand named on the page (108x), including the title
- Resolves to 216.150.1.65, 216.150.16.65
- Page title: "POTLOCK | Open Funding Stack & AI-PGF"
- Screenshot: shots/potlock.app.jpg (attach)

We are not affiliated with the operator of potlock[.]app. POTLOCK has not authorised its use of the brand. Screenshots and HTML captures are available on request.

Regards,
{{REPORTER_NAME}}
{{REPORTER_ORG}}, acting for POTLOCK under a Letter of Authorisation dated {{LOA_DATE}}
{{REPORTER_EMAIL}}
```

> Registrar IANA ID 895, abuse phone +1.6466935324

### Hosting abuse report to Vercel, Inc

**File at:** abuse@vercel.com  
**Subject:** Phishing site hosted on your network: potlock.app (POTLOCK impersonation)

```text
DRAFT - NOT FILED. File only after the brand owner approves it and has signed a Letter of Authorisation.

Hello Vercel, Inc,

hxxps://www[.]potlock[.]app/ (216.150.1.65, 216.150.16.65) is hosted on your network and impersonates POTLOCK (official: hxxps://potlock[.]org).

Evidence (observed 2026-11-01):
- Official name on a different TLD
- One of 3 lookalikes on the same DNS account (henrik.ns.cloudflare.com + meera.ns.cloudflare.com): a single operator
- Page title resembles the official title (80%)
- Brand named on the page (108x), including the title
- Resolves to 216.150.1.65, 216.150.16.65
- Page title: "POTLOCK | Open Funding Stack & AI-PGF"
- Screenshot: shots/potlock.app.jpg (attach)

Please take the content down under your acceptable use policy.

Regards,
{{REPORTER_NAME}}
{{REPORTER_ORG}}, acting for POTLOCK under a Letter of Authorisation dated {{LOA_DATE}}
{{REPORTER_EMAIL}}
```

### Google Safe Browsing report

**File at:** https://safebrowsing.google.com/safebrowsing/report_phish/?url=https%3A%2F%2Fwww.potlock.app%2F

- **Report Type:** `This page is not safe`
- **Threat Type:** `Social engineering (phishing) - pick the closest option shown`
- **Threat Category:** `Pick the closest option shown (impersonation / phishing)`
- **URL to report:** `https://www.potlock.app/`
- **Additional details (max 800):** `Impersonates POTLOCK (official: https://potlock.org). Page title resembles the official title (80%); Brand named on the page (108x), including the title; Official name on a different TLD; One of 3 lookalikes on the same DNS account (henrik.ns.cloudflare.com + meera.ns.cloudflare.com): a single operator.`

```text
DRAFT - NOT FILED. File only after the brand owner approves it and has signed a Letter of Authorisation.

Impersonates POTLOCK (official: https://potlock.org). Page title resembles the official title (80%); Brand named on the page (108x), including the title; Official name on a different TLD; One of 3 lookalikes on the same DNS account (henrik.ns.cloudflare.com + meera.ns.cloudflare.com): a single operator.
```

> Web form with reCAPTCHA: a person has to submit it.

### Netcraft report

**File at:** https://report.netcraft.com/report

- **The URL of the site:** `https://www.potlock.app/`
- **Further details:** `Impersonates POTLOCK (official: https://potlock.org). Page title resembles the official title (80%); Brand named on the page (108x), including the title; Official name on a different TLD; One of 3 lookalikes on the same DNS account (henrik.ns.cloudflare.com + meera.ns.cloudflare.com): a single operator.`
- **Your email address:** `{{REPORTER_EMAIL}}`

```text
DRAFT - NOT FILED. File only after the brand owner approves it and has signed a Letter of Authorisation.

Impersonates POTLOCK (official: https://potlock.org). Page title resembles the official title (80%); Brand named on the page (108x), including the title; Official name on a different TLD; One of 3 lookalikes on the same DNS account (henrik.ns.cloudflare.com + meera.ns.cloudflare.com): a single operator.
```

> Web form with reCAPTCHA. Netcraft feeds many browser and registrar blocklists.

### MetaMask eth-phishing-detect: blocklist addition issue

**File at:** https://github.com/MetaMask/eth-phishing-detect/issues/new?template=01-blocklist-addition.yaml

- **Malicious domains, IPs, IPFS hashes, or IPNS names:** `https://www.potlock.app/`
- **Please explain why this content is malicious:** `Impersonates POTLOCK (official: https://potlock.org). Page title resembles the official title (80%); Brand named on the page (108x), including the title; Official name on a different TLD; One of 3 lookalikes on the same DNS account (henrik.ns.cloudflare.com + meera.ns.cloudflare.com): a single operator. Observed 2026-11-01. Reported on behalf of POTLOCK.`
- **Is this a duplicate request?:** `Search open issues for the domain first, then tick the box`

```text
DRAFT - NOT FILED. File only after the brand owner approves it and has signed a Letter of Authorisation.

Impersonates POTLOCK (official: https://potlock.org). Page title resembles the official title (80%); Brand named on the page (108x), including the title; Official name on a different TLD; One of 3 lookalikes on the same DNS account (henrik.ns.cloudflare.com + meera.ns.cloudflare.com): a single operator.
```

### MetaMask eth-phishing-detect: alternative PR (slower; most merges are bot syncs)

**File at:** https://github.com/MetaMask/eth-phishing-detect

```text
DRAFT - NOT FILED. File only after the brand owner approves it and has signed a Letter of Authorisation.

git checkout -b block-potlock.app
yarn add:blocklist potlock.app

PR title: Block potlock.app (POTLOCK impersonation)
PR body: Impersonates POTLOCK (official: https://potlock.org). Page title resembles the official title (80%); Brand named on the page (108x), including the title; Official name on a different TLD; One of 3 lookalikes on the same DNS account (henrik.ns.cloudflare.com + meera.ns.cloudflare.com): a single operator.
```

### ScamSniffer scam-database issue

**File at:** https://github.com/scamsniffer/scam-database/issues/new  
**Subject:** [Phishing] potlock.app - POTLOCK impersonation

```text
DRAFT - NOT FILED. File only after the brand owner approves it and has signed a Letter of Authorisation.

Domain: potlock.app
Scam addresses (with chain): {{ADD IF KNOWN, e.g. from a victim's drain tx}}
Impersonates: POTLOCK (official: https://potlock.org)

Evidence (observed 2026-11-01):
- Official name on a different TLD
- One of 3 lookalikes on the same DNS account (henrik.ns.cloudflare.com + meera.ns.cloudflare.com): a single operator
- Page title resembles the official title (80%)
- Brand named on the page (108x), including the title
- Resolves to 216.150.1.65, 216.150.16.65
- Page title: "POTLOCK | Open Funding Stack & AI-PGF"
- Screenshot: shots/potlock.app.jpg (attach)
```

> ScamSniffer asks for issues, not PRs (their JSON is regenerated). Attach the screenshot.
