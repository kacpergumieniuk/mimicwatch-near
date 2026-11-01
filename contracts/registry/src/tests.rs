use super::*;
use near_sdk::test_utils::{VMContextBuilder, get_logs};
use near_sdk::testing_env;

const HASH: &str = "3f79bb7b435b05321651daefd374cdc681dc06faa65e374e38337b88ca046dea";

fn acc(s: &str) -> AccountId {
    s.parse().unwrap()
}

fn ctx(predecessor: &str, deposit: NearToken) {
    let mut b = VMContextBuilder::new();
    b.current_account_id(acc("registry.testnet"))
        .predecessor_account_id(acc(predecessor))
        .signer_account_id(acc(predecessor))
        .attached_deposit(deposit)
        .block_timestamp(1_700_000_000_000_000_000);
    testing_env!(b.build());
}

fn as_owner() {
    ctx("owner.testnet", NearToken::from_yoctonear(1));
}
fn as_reporter() {
    ctx("reporter.testnet", NearToken::from_yoctonear(0));
}
fn as_anyone(who: &str) {
    ctx(who, NearToken::from_yoctonear(0));
}

fn input(subject: &str, kind: SubjectKind, severity: Severity) -> ReportInput {
    ReportInput {
        subject: subject.to_string(),
        kind,
        category: Category::Impersonation,
        severity,
        evidence_url:
            "https://github.com/kacpergumieniuk/mimicwatch-near/blob/main/evidence/x.json".into(),
        evidence_hash: HASH.into(),
        brand: Some("Rhea".into()),
        note: Some("lookalike of ref-finance.near".into()),
    }
}

fn setup() -> Registry {
    as_owner();
    let mut r = Registry::new(acc("owner.testnet"));
    r.add_reporter(acc("reporter.testnet"));
    r
}

fn report_account(r: &mut Registry, subject: &str) -> Entry {
    as_reporter();
    r.report(input(subject, SubjectKind::Account, Severity::High))
}

// ------------------------------------------------------------------ reporting

#[test]
fn reporter_adds_entry_and_anyone_sees_it() {
    let mut r = setup();
    let e = report_account(&mut r, "ref-flnance.near");
    assert_eq!(e.status, Status::Active);
    assert_eq!(e.reporter, acc("reporter.testnet"));
    assert_eq!(e.brand.as_deref(), Some("rhea"));
    as_anyone("random.testnet");
    let f = r.is_flagged("ref-flnance.near".into());
    assert!(f.flagged);
    assert_eq!(f.via.as_deref(), Some("exact"));
    assert_eq!(f.entry.unwrap().severity, Severity::High);
    assert!(!r.is_flagged("ref-finance.near".into()).flagged);
}

#[test]
#[should_panic(expected = "NOT_REPORTER")]
fn stranger_cannot_report() {
    let mut r = setup();
    as_anyone("mallory.testnet");
    r.report(input(
        "ref-flnance.near",
        SubjectKind::Account,
        Severity::High,
    ));
}

#[test]
fn owner_can_report_without_being_listed() {
    let mut r = setup();
    as_owner();
    r.report(input(
        "rhea-claim.xyz",
        SubjectKind::Domain,
        Severity::Critical,
    ));
    assert!(r.is_flagged("rhea-claim.xyz".into()).flagged);
}

#[test]
#[should_panic(expected = "SEVERITY_TOO_LOW")]
fn medium_is_rejected() {
    let mut r = setup();
    as_reporter();
    r.report(input(
        "ref-flnance.near",
        SubjectKind::Account,
        Severity::Medium,
    ));
}

#[test]
#[should_panic(expected = "SEVERITY_TOO_LOW")]
fn low_is_rejected() {
    let mut r = setup();
    as_reporter();
    r.report(input(
        "ref-flnance.near",
        SubjectKind::Account,
        Severity::Low,
    ));
}

#[test]
#[should_panic(expected = "INVALID_ACCOUNT")]
fn invalid_account_is_rejected() {
    let mut r = setup();
    as_reporter();
    r.report(input(
        "ref--flnance..near",
        SubjectKind::Account,
        Severity::High,
    ));
}

#[test]
#[should_panic(expected = "TOP_LEVEL_ACCOUNT")]
fn top_level_account_is_rejected() {
    let mut r = setup();
    as_reporter();
    r.report(input("near", SubjectKind::Account, Severity::High));
}

#[test]
#[should_panic(expected = "INVALID_DOMAIN")]
fn invalid_domain_is_rejected() {
    let mut r = setup();
    as_reporter();
    r.report(input("not a domain", SubjectKind::Domain, Severity::High));
}

#[test]
#[should_panic(expected = "EVIDENCE_HASH")]
fn bad_hash_is_rejected() {
    let mut r = setup();
    as_reporter();
    let mut i = input("ref-flnance.near", SubjectKind::Account, Severity::High);
    i.evidence_hash = "abc".into();
    r.report(i);
}

#[test]
#[should_panic(expected = "EVIDENCE_URL")]
fn http_evidence_url_is_rejected() {
    let mut r = setup();
    as_reporter();
    let mut i = input("ref-flnance.near", SubjectKind::Account, Severity::High);
    i.evidence_url = "http://example.com/e.json".into();
    r.report(i);
}

#[test]
#[should_panic(expected = "NOTE_TOO_LONG")]
fn long_note_is_rejected() {
    let mut r = setup();
    as_reporter();
    let mut i = input("ref-flnance.near", SubjectKind::Account, Severity::High);
    i.note = Some("x".repeat(281));
    r.report(i);
}

#[test]
fn uppercase_hash_and_subject_are_normalised() {
    let mut r = setup();
    as_reporter();
    let mut i = input("  REF-FLNANCE.NEAR ", SubjectKind::Account, Severity::High);
    i.evidence_hash = HASH.to_uppercase();
    let e = r.report(i);
    assert_eq!(e.subject, "ref-flnance.near");
    assert_eq!(e.evidence_hash, HASH);
}

#[test]
fn rereport_updates_but_keeps_first_seen_and_dispute() {
    let mut r = setup();
    let first = report_account(&mut r, "ref-flnance.near");
    ctx("someone.testnet", DEFAULT_DISPUTE_DEPOSIT);
    r.dispute(
        "ref-flnance.near".into(),
        SubjectKind::Account,
        "this is my personal account".into(),
    );
    let mut b = VMContextBuilder::new();
    b.predecessor_account_id(acc("reporter.testnet"))
        .block_timestamp(1_800_000_000_000_000_000);
    testing_env!(b.build());
    let mut i = input("ref-flnance.near", SubjectKind::Account, Severity::Critical);
    i.category = Category::Phishing;
    let e = r.report(i);
    assert_eq!(e.reported_at_ms, first.reported_at_ms);
    assert!(e.updated_at_ms > first.updated_at_ms);
    assert_eq!(e.severity, Severity::Critical);
    assert_eq!(e.category, Category::Phishing);
    assert_eq!(
        e.status,
        Status::Disputed,
        "a reporter cannot silently close a dispute"
    );
    assert!(e.dispute.is_some());
    assert!(get_logs().iter().any(|l| l.contains("\"entry_updated\"")));
}

#[test]
fn batch_reports_many() {
    let mut r = setup();
    as_reporter();
    let out = r.report_batch(vec![
        input("ref-flnance.near", SubjectKind::Account, Severity::High),
        input("rhea-claim.xyz", SubjectKind::Domain, Severity::Critical),
    ]);
    assert_eq!(out.len(), 2);
    assert_eq!(r.stats().entries, 2);
}

#[test]
#[should_panic(expected = "BATCH_TOO_LARGE")]
fn batch_is_capped() {
    let mut r = setup();
    as_reporter();
    let many = (0..21)
        .map(|i| {
            input(
                &format!("fake{i}.near"),
                SubjectKind::Account,
                Severity::High,
            )
        })
        .collect();
    r.report_batch(many);
}

#[test]
fn removed_reporter_loses_access() {
    let mut r = setup();
    as_owner();
    r.remove_reporter(acc("reporter.testnet"));
    as_reporter();
    let res = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        r.report(input(
            "ref-flnance.near",
            SubjectKind::Account,
            Severity::High,
        ))
    }));
    assert!(res.is_err());
    assert!(!r.is_reporter(acc("reporter.testnet")));
    assert!(r.is_reporter(acc("owner.testnet")));
}

// ------------------------------------------------------------------ queries

#[test]
fn sub_accounts_of_a_flagged_account_are_flagged() {
    let mut r = setup();
    report_account(&mut r, "ref-flnance.near");
    let f = r.is_flagged("claim.v2.ref-flnance.near".into());
    assert!(f.flagged);
    assert_eq!(f.via.as_deref(), Some("parent-account"));
    assert_eq!(f.entry.unwrap().subject, "ref-flnance.near");
}

#[test]
fn similar_but_different_names_are_not_flagged() {
    let mut r = setup();
    report_account(&mut r, "ref-flnance.near");
    for id in [
        "ref-flnancex.near",
        "xref-flnance.near",
        "ref-flnance.tg",
        "near",
        "flnance.near",
    ] {
        assert!(!r.is_flagged(id.into()).flagged, "{id}");
    }
}

#[test]
fn urls_are_reduced_to_their_host_and_subdomains_match() {
    let mut r = setup();
    as_reporter();
    r.report(input(
        "rhea-claim.xyz",
        SubjectKind::Domain,
        Severity::Critical,
    ));
    for q in [
        "https://app.rhea-claim.xyz/connect?ref=1",
        "HTTP://RHEA-CLAIM.XYZ",
        "rhea-claim.xyz.",
        "https://user:pw@rhea-claim.xyz:8443/x",
    ] {
        let f = r.is_flagged(q.into());
        assert!(f.flagged, "{q}");
    }
    let f = r.is_flagged("https://app.rhea-claim.xyz/".into());
    assert_eq!(f.query, "app.rhea-claim.xyz");
    assert_eq!(f.via.as_deref(), Some("parent-domain"));
    assert!(!r.is_flagged("xyz".into()).flagged);
    assert!(!r.is_flagged("rhea.finance".into()).flagged);
}

#[test]
fn implicit_accounts_match_exactly() {
    let mut r = setup();
    let implicit = "a".repeat(64);
    report_account(&mut r, &implicit);
    assert!(r.is_flagged(implicit.clone()).flagged);
    assert!(!r.is_flagged("b".repeat(64)).flagged);
}

#[test]
fn check_many_and_listing() {
    let mut r = setup();
    for s in ["a-fake.near", "b-fake.near", "c-fake.near"] {
        report_account(&mut r, s);
    }
    let res = r.check_many(vec!["b-fake.near".into(), "real.near".into()]);
    assert!(res[0].flagged && !res[1].flagged);
    assert_eq!(r.list_entries(None, None).len(), 3);
    let page = r.list_entries(Some(1), Some(1));
    assert_eq!(page.len(), 1);
    assert_eq!(page[0].subject, "b-fake.near");
    assert_eq!(r.list_entries(Some(0), Some(1000)).len(), 3);
    assert!(
        r.get_entry("A-FAKE.near".into(), SubjectKind::Account)
            .is_some()
    );
    assert!(
        r.get_entry("a-fake.near".into(), SubjectKind::Domain)
            .is_none()
    );
}

#[test]
#[should_panic(expected = "TOO_MANY")]
fn check_many_is_capped() {
    let r = setup();
    r.check_many((0..51).map(|i| format!("x{i}.near")).collect());
}

// ------------------------------------------------------------------ disputes and removal

#[test]
fn subject_can_dispute_and_it_is_recorded() {
    let mut r = setup();
    report_account(&mut r, "ref-flnance.near");
    ctx("ref-flnance.near", DEFAULT_DISPUTE_DEPOSIT);
    r.dispute(
        "ref-flnance.near".into(),
        SubjectKind::Account,
        "personal account since 2024".into(),
    );
    let e = r
        .get_entry("ref-flnance.near".into(), SubjectKind::Account)
        .unwrap();
    assert_eq!(e.status, Status::Disputed);
    let d = e.dispute.unwrap();
    assert!(d.by_subject);
    assert_eq!(d.deposit, DEFAULT_DISPUTE_DEPOSIT);
    assert!(
        r.is_flagged("ref-flnance.near".into()).flagged,
        "disputed entries stay visible"
    );
    assert_eq!(r.list_disputed(None, None).len(), 1);
    assert_eq!(r.stats().disputed, 1);
    assert!(
        get_logs()
            .iter()
            .any(|l| l.contains("\"entry_disputed\"") && l.contains("\"by_subject\":true"))
    );
}

#[test]
fn third_party_dispute_is_not_by_subject() {
    let mut r = setup();
    report_account(&mut r, "ref-flnance.near");
    ctx("friend.testnet", DEFAULT_DISPUTE_DEPOSIT);
    r.dispute(
        "ref-flnance.near".into(),
        SubjectKind::Account,
        "it is my friend's".into(),
    );
    assert!(
        !r.get_entry("ref-flnance.near".into(), SubjectKind::Account)
            .unwrap()
            .dispute
            .unwrap()
            .by_subject
    );
}

#[test]
#[should_panic(expected = "DEPOSIT_TOO_LOW")]
fn dispute_needs_deposit() {
    let mut r = setup();
    report_account(&mut r, "ref-flnance.near");
    ctx("ref-flnance.near", NearToken::from_millinear(1));
    r.dispute(
        "ref-flnance.near".into(),
        SubjectKind::Account,
        "mine".into(),
    );
}

#[test]
#[should_panic(expected = "ALREADY_DISPUTED")]
fn one_open_dispute_at_a_time() {
    let mut r = setup();
    report_account(&mut r, "ref-flnance.near");
    ctx("a.testnet", DEFAULT_DISPUTE_DEPOSIT);
    r.dispute("ref-flnance.near".into(), SubjectKind::Account, "x".into());
    ctx("b.testnet", DEFAULT_DISPUTE_DEPOSIT);
    r.dispute("ref-flnance.near".into(), SubjectKind::Account, "y".into());
}

#[test]
#[should_panic(expected = "NOT_FOUND")]
fn dispute_of_unknown_subject_fails() {
    let mut r = setup();
    ctx("a.testnet", DEFAULT_DISPUTE_DEPOSIT);
    r.dispute("nothing.near".into(), SubjectKind::Account, "x".into());
}

#[test]
fn owner_keeps_entry_after_dispute() {
    let mut r = setup();
    report_account(&mut r, "ref-flnance.near");
    ctx("ref-flnance.near", DEFAULT_DISPUTE_DEPOSIT);
    r.dispute(
        "ref-flnance.near".into(),
        SubjectKind::Account,
        "mine".into(),
    );
    as_owner();
    r.resolve_dispute(
        "ref-flnance.near".into(),
        SubjectKind::Account,
        true,
        "evidence stands".into(),
    );
    let e = r
        .get_entry("ref-flnance.near".into(), SubjectKind::Account)
        .unwrap();
    assert_eq!(e.status, Status::Active);
    assert!(e.dispute.is_none());
    assert_eq!(e.disputes_rejected, 1);
    // A new dispute can be filed afterwards.
    ctx("ref-flnance.near", DEFAULT_DISPUTE_DEPOSIT);
    r.dispute(
        "ref-flnance.near".into(),
        SubjectKind::Account,
        "new evidence".into(),
    );
}

#[test]
fn owner_accepts_dispute_clears_and_refunds() {
    let mut r = setup();
    report_account(&mut r, "ref-flnance.near");
    ctx("ref-flnance.near", DEFAULT_DISPUTE_DEPOSIT);
    r.dispute(
        "ref-flnance.near".into(),
        SubjectKind::Account,
        "mine".into(),
    );
    as_owner();
    r.resolve_dispute(
        "ref-flnance.near".into(),
        SubjectKind::Account,
        false,
        "false positive".into(),
    );
    let f = r.is_flagged("ref-flnance.near".into());
    assert!(!f.flagged);
    assert_eq!(f.cleared.unwrap().reason, "false positive");
    assert_eq!(r.stats().cleared, 1);
    assert!(
        get_logs()
            .iter()
            .any(|l| l.contains("\"dispute_accepted\""))
    );
    // the refund is a transfer receipt
    let receipts = near_sdk::test_utils::get_created_receipts();
    assert_eq!(receipts.len(), 1);
    assert_eq!(receipts[0].receiver_id, acc("ref-flnance.near"));
}

#[test]
#[should_panic(expected = "NO_OPEN_DISPUTE")]
fn resolve_without_dispute_fails() {
    let mut r = setup();
    report_account(&mut r, "ref-flnance.near");
    as_owner();
    r.resolve_dispute(
        "ref-flnance.near".into(),
        SubjectKind::Account,
        true,
        "".into(),
    );
}

#[test]
#[should_panic(expected = "NOT_OWNER")]
fn reporter_cannot_resolve() {
    let mut r = setup();
    report_account(&mut r, "ref-flnance.near");
    ctx("ref-flnance.near", DEFAULT_DISPUTE_DEPOSIT);
    r.dispute(
        "ref-flnance.near".into(),
        SubjectKind::Account,
        "mine".into(),
    );
    ctx("reporter.testnet", NearToken::from_yoctonear(1));
    r.resolve_dispute(
        "ref-flnance.near".into(),
        SubjectKind::Account,
        false,
        "".into(),
    );
}

#[test]
fn removal_clears_and_blocks_rereport_by_reporters() {
    let mut r = setup();
    report_account(&mut r, "ref-flnance.near");
    as_owner();
    r.remove(
        "ref-flnance.near".into(),
        SubjectKind::Account,
        "brand confirmed it is theirs".into(),
    );
    assert!(!r.is_flagged("ref-flnance.near".into()).flagged);
    as_reporter();
    let res = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        r.report(input(
            "ref-flnance.near",
            SubjectKind::Account,
            Severity::High,
        ))
    }));
    assert!(res.is_err(), "reporter must not re-add a cleared subject");
    // The owner can re-add it, which drops the cleared mark.
    as_owner();
    r.report(input(
        "ref-flnance.near",
        SubjectKind::Account,
        Severity::High,
    ));
    assert!(r.is_flagged("ref-flnance.near".into()).flagged);
    assert_eq!(r.stats().cleared, 0);
}

#[test]
fn unclear_lets_reporters_report_again() {
    let mut r = setup();
    report_account(&mut r, "ref-flnance.near");
    as_owner();
    r.remove(
        "ref-flnance.near".into(),
        SubjectKind::Account,
        "oops".into(),
    );
    r.unclear("ref-flnance.near".into(), SubjectKind::Account);
    assert!(
        r.get_cleared("ref-flnance.near".into(), SubjectKind::Account)
            .is_none()
    );
    report_account(&mut r, "ref-flnance.near");
    assert!(r.is_flagged("ref-flnance.near".into()).flagged);
}

#[test]
fn removal_refunds_open_dispute() {
    let mut r = setup();
    report_account(&mut r, "ref-flnance.near");
    ctx("friend.testnet", DEFAULT_DISPUTE_DEPOSIT);
    r.dispute("ref-flnance.near".into(), SubjectKind::Account, "x".into());
    as_owner();
    r.remove(
        "ref-flnance.near".into(),
        SubjectKind::Account,
        "cleared".into(),
    );
    let receipts = near_sdk::test_utils::get_created_receipts();
    assert_eq!(receipts.len(), 1);
    assert_eq!(receipts[0].receiver_id, acc("friend.testnet"));
}

#[test]
#[should_panic(expected = "ATTACH_1_YOCTO")]
fn owner_methods_need_one_yocto() {
    let mut r = setup();
    report_account(&mut r, "ref-flnance.near");
    ctx("owner.testnet", NearToken::from_yoctonear(0));
    r.remove("ref-flnance.near".into(), SubjectKind::Account, "x".into());
}

#[test]
#[should_panic(expected = "NOT_OWNER")]
fn stranger_cannot_add_reporter() {
    let mut r = setup();
    ctx("mallory.testnet", NearToken::from_yoctonear(1));
    r.add_reporter(acc("mallory.testnet"));
}

#[test]
fn ownership_transfer_and_deposit_setting() {
    let mut r = setup();
    as_owner();
    r.set_dispute_deposit(U128(10));
    assert_eq!(r.get_dispute_deposit().0, 10);
    r.transfer_ownership(acc("new-owner.testnet"));
    assert_eq!(r.get_owner(), acc("new-owner.testnet"));
    let res = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        as_owner();
        r.add_reporter(acc("x.testnet"));
    }));
    assert!(res.is_err());
}

#[test]
fn events_follow_nep297() {
    let mut r = setup();
    report_account(&mut r, "ref-flnance.near");
    let log = get_logs()
        .into_iter()
        .find(|l| l.contains("entry_reported"))
        .unwrap();
    let v: near_sdk::serde_json::Value =
        near_sdk::serde_json::from_str(log.strip_prefix("EVENT_JSON:").unwrap()).unwrap();
    assert_eq!(v["standard"], "mimicwatch");
    assert_eq!(v["version"], "1.0.0");
    assert_eq!(v["data"][0]["subject"], "ref-flnance.near");
    assert_eq!(v["data"][0]["severity"], "high");
    assert_eq!(v["data"][0]["kind"], "account");
}

#[test]
fn normalize_cases() {
    assert_eq!(
        normalize(" HTTPS://App.Rhea-Claim.xyz/a/b?c#d "),
        "app.rhea-claim.xyz"
    );
    assert_eq!(normalize("ref-flnance.near"), "ref-flnance.near");
    assert_eq!(normalize("rhea-claim.xyz:443"), "rhea-claim.xyz");
    assert_eq!(normalize("https://a:b@rhea-claim.xyz/"), "rhea-claim.xyz");
}
