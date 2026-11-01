# Draft reports: LiNEAR Protocol (2026-11-01)

**DRAFT - NOT FILED. File only after the brand owner approves it and has signed a Letter of Authorisation.**


## linearprotocol.io (high, phishing-likely, 72/100)

### Registrar abuse report

**File at:** (registrar abuse address not found via RDAP: look it up at https://lookup.icann.org)  
**Subject:** Phishing / brand impersonation: linearprotocol.io impersonates LiNEAR Protocol

```text
DRAFT - NOT FILED. File only after the brand owner approves it and has signed a Letter of Authorisation.

Hello Abuse Team abuse team,

The domain linearprotocol[.]io (registered with you) is being used to impersonate LiNEAR Protocol, a crypto project whose official site is hxxps://linearprotocol[.]org. We ask you to suspend the domain under your abuse policy and the RAA section 3.18 obligations.

Evidence (observed 2026-11-01, read-only, URLs defanged):
- URL: hxxps://linearprotocol[.]io/
- Official name on a different TLD
- Page title resembles the official title (100%)
- Page text overlaps the official site (57% shingles)
- Wallet-connect prompt/library: connectWallet, WalletConnect, Web3Modal
- Drainer-style JS: eth_signTypedData_v4
- Lure text: rewards
- Resolves to 63.176.8.218, 35.157.26.135
- Page title: "LiNEAR - Omnichain Liquid (Re)Staking"
- Screenshot: shots/linearprotocol.io.jpg (attach)

We are not affiliated with the operator of linearprotocol[.]io. LiNEAR Protocol has not authorised its use of the brand. Screenshots and HTML captures are available on request.

Regards,
{{REPORTER_NAME}}
{{REPORTER_ORG}}, acting for LiNEAR Protocol under a Letter of Authorisation dated {{LOA_DATE}}
{{REPORTER_EMAIL}}
```

### Hosting abuse report to A100 ROW GmbH

**File at:** trustandsafety@support.aws.com  
**Subject:** Phishing site hosted on your network: linearprotocol.io (LiNEAR Protocol impersonation)

```text
DRAFT - NOT FILED. File only after the brand owner approves it and has signed a Letter of Authorisation.

Hello A100 ROW GmbH,

hxxps://linearprotocol[.]io/ (63.176.8.218, 35.157.26.135) is hosted on your network and impersonates LiNEAR Protocol (official: hxxps://linearprotocol[.]org).

Evidence (observed 2026-11-01):
- Official name on a different TLD
- Page title resembles the official title (100%)
- Page text overlaps the official site (57% shingles)
- Wallet-connect prompt/library: connectWallet, WalletConnect, Web3Modal
- Drainer-style JS: eth_signTypedData_v4
- Lure text: rewards
- Resolves to 63.176.8.218, 35.157.26.135
- Page title: "LiNEAR - Omnichain Liquid (Re)Staking"
- Screenshot: shots/linearprotocol.io.jpg (attach)

Please take the content down under your acceptable use policy.

Regards,
{{REPORTER_NAME}}
{{REPORTER_ORG}}, acting for LiNEAR Protocol under a Letter of Authorisation dated {{LOA_DATE}}
{{REPORTER_EMAIL}}
```

### Google Safe Browsing report

**File at:** https://safebrowsing.google.com/safebrowsing/report_phish/?url=https%3A%2F%2Flinearprotocol.io%2F

- **Report Type:** `This page is not safe`
- **Threat Type:** `Social engineering (phishing) - pick the closest option shown`
- **Threat Category:** `Pick the closest option shown (impersonation / phishing)`
- **URL to report:** `https://linearprotocol.io/`
- **Additional details (max 800):** `Impersonates LiNEAR Protocol (official: https://linearprotocol.org). Page text overlaps the official site (57% shingles); Drainer-style JS: eth_signTypedData_v4; Wallet-connect prompt/library: connectWallet, WalletConnect, Web3Modal; Page title resembles the official title (100%).`

```text
DRAFT - NOT FILED. File only after the brand owner approves it and has signed a Letter of Authorisation.

Impersonates LiNEAR Protocol (official: https://linearprotocol.org). Page text overlaps the official site (57% shingles); Drainer-style JS: eth_signTypedData_v4; Wallet-connect prompt/library: connectWallet, WalletConnect, Web3Modal; Page title resembles the official title (100%).
```

> Web form with reCAPTCHA: a person has to submit it.

### Netcraft report

**File at:** https://report.netcraft.com/report

- **The URL of the site:** `https://linearprotocol.io/`
- **Further details:** `Impersonates LiNEAR Protocol (official: https://linearprotocol.org). Page text overlaps the official site (57% shingles); Drainer-style JS: eth_signTypedData_v4; Wallet-connect prompt/library: connectWallet, WalletConnect, Web3Modal; Page title resembles the official title (100%).`
- **Your email address:** `{{REPORTER_EMAIL}}`

```text
DRAFT - NOT FILED. File only after the brand owner approves it and has signed a Letter of Authorisation.

Impersonates LiNEAR Protocol (official: https://linearprotocol.org). Page text overlaps the official site (57% shingles); Drainer-style JS: eth_signTypedData_v4; Wallet-connect prompt/library: connectWallet, WalletConnect, Web3Modal; Page title resembles the official title (100%).
```

> Web form with reCAPTCHA. Netcraft feeds many browser and registrar blocklists.

### MetaMask eth-phishing-detect: blocklist addition issue

**File at:** https://github.com/MetaMask/eth-phishing-detect/issues/new?template=01-blocklist-addition.yaml

- **Malicious domains, IPs, IPFS hashes, or IPNS names:** `https://linearprotocol.io/`
- **Please explain why this content is malicious:** `Impersonates LiNEAR Protocol (official: https://linearprotocol.org). Page text overlaps the official site (57% shingles); Drainer-style JS: eth_signTypedData_v4; Wallet-connect prompt/library: connectWallet, WalletConnect, Web3Modal; Page title resembles the official title (100%). Observed 2026-11-01. Reported on behalf of LiNEAR Protocol.`
- **Is this a duplicate request?:** `Search open issues for the domain first, then tick the box`

```text
DRAFT - NOT FILED. File only after the brand owner approves it and has signed a Letter of Authorisation.

Impersonates LiNEAR Protocol (official: https://linearprotocol.org). Page text overlaps the official site (57% shingles); Drainer-style JS: eth_signTypedData_v4; Wallet-connect prompt/library: connectWallet, WalletConnect, Web3Modal; Page title resembles the official title (100%).
```

### MetaMask eth-phishing-detect: alternative PR (slower; most merges are bot syncs)

**File at:** https://github.com/MetaMask/eth-phishing-detect

```text
DRAFT - NOT FILED. File only after the brand owner approves it and has signed a Letter of Authorisation.

git checkout -b block-linearprotocol.io
yarn add:blocklist linearprotocol.io

PR title: Block linearprotocol.io (LiNEAR Protocol impersonation)
PR body: Impersonates LiNEAR Protocol (official: https://linearprotocol.org). Page text overlaps the official site (57% shingles); Drainer-style JS: eth_signTypedData_v4; Wallet-connect prompt/library: connectWallet, WalletConnect, Web3Modal; Page title resembles the official title (100%).
```

### ScamSniffer scam-database issue

**File at:** https://github.com/scamsniffer/scam-database/issues/new  
**Subject:** [Phishing] linearprotocol.io - LiNEAR Protocol impersonation

```text
DRAFT - NOT FILED. File only after the brand owner approves it and has signed a Letter of Authorisation.

Domain: linearprotocol.io
Scam addresses (with chain): {{ADD IF KNOWN, e.g. from a victim's drain tx}}
Impersonates: LiNEAR Protocol (official: https://linearprotocol.org)

Evidence (observed 2026-11-01):
- Official name on a different TLD
- Page title resembles the official title (100%)
- Page text overlaps the official site (57% shingles)
- Wallet-connect prompt/library: connectWallet, WalletConnect, Web3Modal
- Drainer-style JS: eth_signTypedData_v4
- Lure text: rewards
- Resolves to 63.176.8.218, 35.157.26.135
- Page title: "LiNEAR - Omnichain Liquid (Re)Staking"
- Screenshot: shots/linearprotocol.io.jpg (attach)
```

> ScamSniffer asks for issues, not PRs (their JSON is regenerated). Attach the screenshot.
