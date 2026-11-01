//! Mimicwatch registry: reviewed lookalike NEAR accounts and phishing domains, queryable on chain.
//!
//! * Approved **reporters** add entries (`report`, `report_batch`). Only `high` and `critical`
//!   entries are accepted: the registry is a blocklist, not a watch list.
//! * **Anyone** can query `is_flagged(id)` (an account, a domain or a URL) and list entries.
//!   A flagged account also flags its sub-accounts (only the parent can create them), and a
//!   flagged domain also flags its subdomains.
//! * **Anyone** can `dispute` an entry by attaching a small deposit. If the disputer is the
//!   flagged account itself, the entry records that. The **owner** resolves disputes: keep the
//!   entry, or clear it and refund the deposit.
//! * The **owner** can remove any entry. A removed subject is remembered as *cleared*, so a
//!   reporter cannot re-add it; only the owner can.
//!
//! Every change emits a NEP-297 event (`standard: "mimicwatch"`).

use near_sdk::json_types::U128;
use near_sdk::serde_json::json;
use near_sdk::store::{IterableMap, IterableSet, LookupMap};
use near_sdk::{
    AccountId, BorshStorageKey, NearToken, PanicOnDefault, Promise, env, near, require,
};

pub const MAX_BATCH: usize = 20;
pub const MAX_PAGE: u32 = 100;
pub const MAX_CHECK: usize = 50;
pub const MAX_NOTE: usize = 280;
pub const MAX_URL: usize = 300;
pub const MAX_REASON: usize = 500;
pub const DEFAULT_DISPUTE_DEPOSIT: NearToken = NearToken::from_millinear(50);

#[derive(BorshStorageKey)]
#[near]
enum Key {
    Reporters,
    Entries,
    Cleared,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum SubjectKind {
    Account,
    Domain,
}

impl SubjectKind {
    fn as_str(&self) -> &'static str {
        match self {
            SubjectKind::Account => "account",
            SubjectKind::Domain => "domain",
        }
    }
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "lowercase")]
pub enum Severity {
    Low,
    Medium,
    High,
    Critical,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum Category {
    /// Poses as a brand (name, branding) with no wallet-draining behaviour observed.
    Impersonation,
    /// Asks for keys or seed phrases, or sends users to a fake app.
    Phishing,
    /// Drainer code or transactions that take users' assets.
    Drainer,
    /// A token that copies an official token's name or symbol.
    FakeToken,
    /// Other confirmed scam patterns (fake support, fake airdrop).
    Scam,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Status {
    Active,
    Disputed,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Debug, PartialEq)]
pub struct Dispute {
    pub by: AccountId,
    /// True when the flagged account itself filed the dispute.
    pub by_subject: bool,
    pub reason: String,
    pub deposit: NearToken,
    pub at_ms: u64,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Debug, PartialEq)]
pub struct Entry {
    pub subject: String,
    pub kind: SubjectKind,
    pub category: Category,
    pub severity: Severity,
    pub status: Status,
    /// The brand being imitated, e.g. "rhea" (free text, optional).
    pub brand: Option<String>,
    pub evidence_url: String,
    /// sha256 of the evidence document, 64 lowercase hex characters.
    pub evidence_hash: String,
    pub note: Option<String>,
    pub reporter: AccountId,
    pub reported_at_ms: u64,
    pub updated_at_ms: u64,
    pub dispute: Option<Dispute>,
    /// How many disputes the owner rejected for this entry.
    pub disputes_rejected: u32,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Debug, PartialEq)]
pub struct Cleared {
    pub subject: String,
    pub kind: SubjectKind,
    pub by: AccountId,
    pub reason: String,
    pub at_ms: u64,
}

#[near(serializers = [json])]
#[derive(Clone, Debug)]
pub struct ReportInput {
    pub subject: String,
    pub kind: SubjectKind,
    pub category: Category,
    pub severity: Severity,
    pub evidence_url: String,
    pub evidence_hash: String,
    pub brand: Option<String>,
    pub note: Option<String>,
}

#[near(serializers = [json])]
#[derive(Clone, Debug)]
pub struct FlagResult {
    /// The query after normalisation (lowercase, URL reduced to its host).
    pub query: String,
    /// True when an active or disputed entry covers the query.
    pub flagged: bool,
    /// "exact", "parent-account" or "parent-domain" when flagged.
    pub via: Option<String>,
    pub entry: Option<Entry>,
    /// Present when the query itself was flagged before and the owner cleared it.
    pub cleared: Option<Cleared>,
}

#[near(serializers = [json])]
pub struct Stats {
    pub entries: u32,
    pub active: u32,
    pub disputed: u32,
    pub cleared: u32,
    pub reporters: u32,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Registry {
    owner: AccountId,
    reporters: IterableSet<AccountId>,
    /// Keyed by "<kind>:<subject>".
    entries: IterableMap<String, Entry>,
    cleared: LookupMap<String, Cleared>,
    cleared_count: u32,
    dispute_deposit: NearToken,
}

fn key(kind: SubjectKind, subject: &str) -> String {
    format!("{}:{}", kind.as_str(), subject)
}

/// Lowercase, trim, and reduce a URL to its host (no scheme, path, query, port, `www.` kept).
pub fn normalize(input: &str) -> String {
    let mut s = input.trim().to_lowercase();
    if let Some(i) = s.find("://") {
        s = s[i + 3..].to_string();
    }
    if let Some(i) = s.find(['/', '?', '#']) {
        s.truncate(i);
    }
    if let Some(i) = s.rfind('@') {
        // user:pass@host
        s = s[i + 1..].to_string();
    }
    if let Some(i) = s.find(':') {
        s.truncate(i);
    }
    s.trim_end_matches('.').to_string()
}

fn valid_domain(d: &str) -> bool {
    if d.len() > 253 || !d.contains('.') {
        return false;
    }
    let labels: Vec<&str> = d.split('.').collect();
    let tld = labels.last().unwrap();
    if tld.len() < 2
        || !tld
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
    {
        return false;
    }
    labels.iter().all(|l| {
        !l.is_empty()
            && l.len() <= 63
            && !l.starts_with('-')
            && !l.ends_with('-')
            && l.chars()
                .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
    })
}

fn valid_hash(h: &str) -> bool {
    h.len() == 64
        && h.chars()
            .all(|c| c.is_ascii_digit() || ('a'..='f').contains(&c))
}

fn emit(event: &str, data: near_sdk::serde_json::Value) {
    env::log_str(&format!(
        "EVENT_JSON:{}",
        json!({"standard": "mimicwatch", "version": "1.0.0", "event": event, "data": [data]})
    ));
}

#[near]
impl Registry {
    #[init]
    pub fn new(owner_id: AccountId) -> Self {
        Self {
            owner: owner_id,
            reporters: IterableSet::new(Key::Reporters),
            entries: IterableMap::new(Key::Entries),
            cleared: LookupMap::new(Key::Cleared),
            cleared_count: 0,
            dispute_deposit: DEFAULT_DISPUTE_DEPOSIT,
        }
    }

    // ---------------------------------------------------------------- reporters

    /// Adds or updates one entry. Callable by approved reporters and the owner.
    pub fn report(&mut self, entry: ReportInput) -> Entry {
        self.assert_reporter();
        self.upsert(entry)
    }

    /// Adds or updates up to 20 entries in one call.
    pub fn report_batch(&mut self, entries: Vec<ReportInput>) -> Vec<Entry> {
        self.assert_reporter();
        require!(!entries.is_empty(), "EMPTY_BATCH");
        require!(
            entries.len() <= MAX_BATCH,
            "BATCH_TOO_LARGE: at most 20 entries per call"
        );
        entries.into_iter().map(|e| self.upsert(e)).collect()
    }

    // ---------------------------------------------------------------- anyone

    /// Disputes an entry. Attach at least `get_dispute_deposit()`; it is refunded if the owner
    /// clears the entry and kept if the owner keeps it. One open dispute per entry.
    #[payable]
    pub fn dispute(&mut self, subject: String, kind: SubjectKind, reason: String) {
        let subject = normalize(&subject);
        let k = key(kind, &subject);
        let deposit = env::attached_deposit();
        require!(
            deposit >= self.dispute_deposit,
            format!(
                "DEPOSIT_TOO_LOW: attach at least {}",
                self.dispute_deposit.exact_amount_display()
            )
        );
        require!(
            !reason.trim().is_empty() && reason.len() <= MAX_REASON,
            "REASON: 1-500 characters"
        );
        let mut entry = self
            .entries
            .get(&k)
            .cloned()
            .unwrap_or_else(|| env::panic_str("NOT_FOUND"));
        require!(entry.dispute.is_none(), "ALREADY_DISPUTED");
        let by = env::predecessor_account_id();
        let by_subject = kind == SubjectKind::Account && by.as_str() == subject;
        entry.dispute = Some(Dispute {
            by: by.clone(),
            by_subject,
            reason: reason.trim().to_string(),
            deposit,
            at_ms: env::block_timestamp_ms(),
        });
        entry.status = Status::Disputed;
        entry.updated_at_ms = env::block_timestamp_ms();
        self.entries.insert(k, entry);
        emit(
            "entry_disputed",
            json!({"subject": subject, "kind": kind, "by": by, "by_subject": by_subject}),
        );
    }

    // ---------------------------------------------------------------- owner

    /// Resolves an open dispute. `keep = true`: the entry stays (deposit kept). `keep = false`:
    /// the entry is cleared and the deposit refunded to the disputer.
    #[payable]
    pub fn resolve_dispute(
        &mut self,
        subject: String,
        kind: SubjectKind,
        keep: bool,
        note: String,
    ) {
        self.assert_owner();
        let subject = normalize(&subject);
        let k = key(kind, &subject);
        let mut entry = self
            .entries
            .get(&k)
            .cloned()
            .unwrap_or_else(|| env::panic_str("NOT_FOUND"));
        let dispute = entry
            .dispute
            .take()
            .unwrap_or_else(|| env::panic_str("NO_OPEN_DISPUTE"));
        if keep {
            entry.status = Status::Active;
            entry.disputes_rejected += 1;
            entry.updated_at_ms = env::block_timestamp_ms();
            self.entries.insert(k, entry);
            emit(
                "dispute_rejected",
                json!({"subject": subject, "kind": kind, "by": dispute.by, "note": note}),
            );
        } else {
            self.entries.remove(&k);
            self.add_cleared(&subject, kind, note.clone());
            emit(
                "dispute_accepted",
                json!({"subject": subject, "kind": kind, "by": dispute.by, "note": note}),
            );
            Promise::new(dispute.by).transfer(dispute.deposit).detach();
        }
    }

    /// Removes an entry and remembers the subject as cleared. Refunds an open dispute's deposit.
    #[payable]
    pub fn remove(&mut self, subject: String, kind: SubjectKind, reason: String) {
        self.assert_owner();
        let subject = normalize(&subject);
        let k = key(kind, &subject);
        let entry = self
            .entries
            .remove(&k)
            .unwrap_or_else(|| env::panic_str("NOT_FOUND"));
        self.add_cleared(&subject, kind, reason.clone());
        emit(
            "entry_removed",
            json!({"subject": subject, "kind": kind, "reason": reason}),
        );
        if let Some(d) = entry.dispute {
            Promise::new(d.by).transfer(d.deposit).detach();
        }
    }

    /// Forgets that a subject was cleared, so reporters may report it again.
    #[payable]
    pub fn unclear(&mut self, subject: String, kind: SubjectKind) {
        self.assert_owner();
        let subject = normalize(&subject);
        if self.cleared.remove(&key(kind, &subject)).is_some() {
            self.cleared_count -= 1;
        }
    }

    #[payable]
    pub fn add_reporter(&mut self, account_id: AccountId) {
        self.assert_owner();
        self.reporters.insert(account_id.clone());
        emit("reporter_added", json!({"account_id": account_id}));
    }

    #[payable]
    pub fn remove_reporter(&mut self, account_id: AccountId) {
        self.assert_owner();
        self.reporters.remove(&account_id);
        emit("reporter_removed", json!({"account_id": account_id}));
    }

    #[payable]
    pub fn set_dispute_deposit(&mut self, deposit: U128) {
        self.assert_owner();
        self.dispute_deposit = NearToken::from_yoctonear(deposit.0);
    }

    #[payable]
    pub fn transfer_ownership(&mut self, new_owner: AccountId) {
        self.assert_owner();
        emit(
            "owner_changed",
            json!({"from": self.owner, "to": new_owner}),
        );
        self.owner = new_owner;
    }

    // ---------------------------------------------------------------- views

    /// Is this account, domain or URL flagged? Checks the exact subject, then its parents
    /// (sub-accounts of a flagged account, subdomains of a flagged domain). Accounts and domains
    /// are both checked, because `foo.tg` can be either.
    pub fn is_flagged(&self, id: String) -> FlagResult {
        let query = normalize(&id);
        let labels: Vec<&str> = query.split('.').collect();
        // Walk from the full name up to two labels ("a.b"). A bare top-level name only matches
        // exactly (implicit accounts); parents never go up to the top level.
        let last_start = if labels.len() == 1 {
            1
        } else {
            labels.len() - 1
        };
        for start in 0..last_start {
            let candidate = labels[start..].join(".");
            for kind in [SubjectKind::Account, SubjectKind::Domain] {
                if let Some(e) = self.entries.get(&key(kind, &candidate)) {
                    let via = if start == 0 {
                        "exact"
                    } else if kind == SubjectKind::Account {
                        "parent-account"
                    } else {
                        "parent-domain"
                    };
                    return FlagResult {
                        query,
                        flagged: true,
                        via: Some(via.to_string()),
                        entry: Some(e.clone()),
                        cleared: None,
                    };
                }
            }
        }
        let cleared = [SubjectKind::Account, SubjectKind::Domain]
            .iter()
            .find_map(|k| self.cleared.get(&key(*k, &query)).cloned());
        FlagResult {
            query,
            flagged: false,
            via: None,
            entry: None,
            cleared,
        }
    }

    /// `is_flagged` for up to 50 ids.
    pub fn check_many(&self, ids: Vec<String>) -> Vec<FlagResult> {
        require!(ids.len() <= MAX_CHECK, "TOO_MANY: at most 50 ids per call");
        ids.into_iter().map(|id| self.is_flagged(id)).collect()
    }

    pub fn get_entry(&self, subject: String, kind: SubjectKind) -> Option<Entry> {
        self.entries.get(&key(kind, &normalize(&subject))).cloned()
    }

    pub fn get_cleared(&self, subject: String, kind: SubjectKind) -> Option<Cleared> {
        self.cleared.get(&key(kind, &normalize(&subject))).cloned()
    }

    /// Entries in insertion order. `limit` is capped at 100.
    pub fn list_entries(&self, from_index: Option<u32>, limit: Option<u32>) -> Vec<Entry> {
        let from = from_index.unwrap_or(0) as usize;
        let limit = limit.unwrap_or(50).min(MAX_PAGE) as usize;
        self.entries
            .values()
            .skip(from)
            .take(limit)
            .cloned()
            .collect()
    }

    pub fn list_disputed(&self, from_index: Option<u32>, limit: Option<u32>) -> Vec<Entry> {
        let from = from_index.unwrap_or(0) as usize;
        let limit = limit.unwrap_or(50).min(MAX_PAGE) as usize;
        self.entries
            .values()
            .filter(|e| e.status == Status::Disputed)
            .skip(from)
            .take(limit)
            .cloned()
            .collect()
    }

    pub fn stats(&self) -> Stats {
        let disputed = self
            .entries
            .values()
            .filter(|e| e.status == Status::Disputed)
            .count() as u32;
        let entries = self.entries.len();
        Stats {
            entries,
            active: entries - disputed,
            disputed,
            cleared: self.cleared_count,
            reporters: self.reporters.len(),
        }
    }

    pub fn get_owner(&self) -> AccountId {
        self.owner.clone()
    }

    pub fn list_reporters(&self) -> Vec<AccountId> {
        self.reporters.iter().cloned().collect()
    }

    pub fn is_reporter(&self, account_id: AccountId) -> bool {
        self.reporters.contains(&account_id) || account_id == self.owner
    }

    pub fn get_dispute_deposit(&self) -> U128 {
        U128(self.dispute_deposit.as_yoctonear())
    }

    // ---------------------------------------------------------------- internal

    fn assert_owner(&self) {
        require!(env::predecessor_account_id() == self.owner, "NOT_OWNER");
        require!(
            env::attached_deposit() == NearToken::from_yoctonear(1),
            "ATTACH_1_YOCTO: owner methods need exactly 1 yoctoNEAR (proves a full-access key)"
        );
    }

    fn assert_reporter(&self) {
        let p = env::predecessor_account_id();
        require!(
            p == self.owner || self.reporters.contains(&p),
            "NOT_REPORTER"
        );
    }

    fn add_cleared(&mut self, subject: &str, kind: SubjectKind, reason: String) {
        let k = key(kind, subject);
        if !self.cleared.contains_key(&k) {
            self.cleared_count += 1;
        }
        self.cleared.insert(
            k,
            Cleared {
                subject: subject.to_string(),
                kind,
                by: env::predecessor_account_id(),
                reason,
                at_ms: env::block_timestamp_ms(),
            },
        );
    }

    fn upsert(&mut self, input: ReportInput) -> Entry {
        let subject = normalize(&input.subject);
        match input.kind {
            SubjectKind::Account => {
                let parsed: Result<AccountId, _> = subject.parse();
                require!(parsed.is_ok(), format!("INVALID_ACCOUNT: {subject}"));
                require!(
                    subject.contains('.') || subject.len() == 64,
                    format!("TOP_LEVEL_ACCOUNT: refusing to flag a top-level account ({subject})")
                );
            }
            SubjectKind::Domain => {
                require!(valid_domain(&subject), format!("INVALID_DOMAIN: {subject}"))
            }
        }
        require!(
            input.severity >= Severity::High,
            "SEVERITY_TOO_LOW: the registry only holds reviewed high and critical entries"
        );
        let url = input.evidence_url.trim().to_string();
        require!(
            (url.starts_with("https://") || url.starts_with("ipfs://")) && url.len() <= MAX_URL,
            "EVIDENCE_URL: https:// or ipfs:// URL, at most 300 characters"
        );
        let hash = input.evidence_hash.trim().to_lowercase();
        require!(
            valid_hash(&hash),
            "EVIDENCE_HASH: 64 hex characters (sha256)"
        );
        let note = input
            .note
            .map(|n| n.trim().to_string())
            .filter(|n| !n.is_empty());
        require!(
            note.as_ref().is_none_or(|n| n.len() <= MAX_NOTE),
            "NOTE_TOO_LONG: at most 280 characters"
        );
        let brand = input
            .brand
            .map(|b| b.trim().to_lowercase())
            .filter(|b| !b.is_empty());
        require!(
            brand.as_ref().is_none_or(|b| b.len() <= 64),
            "BRAND_TOO_LONG"
        );

        let k = key(input.kind, &subject);
        let reporter = env::predecessor_account_id();
        require!(
            reporter == self.owner || !self.cleared.contains_key(&k),
            "SUBJECT_CLEARED: the owner cleared this subject; only the owner can re-add it"
        );
        let now = env::block_timestamp_ms();
        let existing = self.entries.get(&k).cloned();
        let is_update = existing.is_some();
        let entry = match existing {
            Some(old) => Entry {
                category: input.category,
                severity: input.severity,
                brand,
                evidence_url: url,
                evidence_hash: hash,
                note,
                reporter,
                updated_at_ms: now,
                ..old
            },
            None => Entry {
                subject: subject.clone(),
                kind: input.kind,
                category: input.category,
                severity: input.severity,
                status: Status::Active,
                brand,
                evidence_url: url,
                evidence_hash: hash,
                note,
                reporter,
                reported_at_ms: now,
                updated_at_ms: now,
                dispute: None,
                disputes_rejected: 0,
            },
        };
        if self.cleared.remove(&k).is_some() {
            self.cleared_count -= 1;
        }
        self.entries.insert(k, entry.clone());
        emit(
            if is_update {
                "entry_updated"
            } else {
                "entry_reported"
            },
            json!({
                "subject": entry.subject, "kind": entry.kind, "category": entry.category,
                "severity": entry.severity, "evidence_hash": entry.evidence_hash, "reporter": entry.reporter
            }),
        );
        entry
    }
}

#[cfg(test)]
mod tests;
