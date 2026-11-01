//! End-to-end test on a local NEAR sandbox node: the real wasm, real accounts, real transactions.
//!
//! Requires `cargo near` (https://github.com/near/cargo-near) on PATH; the test builds the
//! contract before starting the sandbox.

use near_api::{AccountId, Contract, NearGas, NearToken, NetworkConfig, Signer, Tokens};
use serde_json::{Value, json};
use std::path::PathBuf;
use std::process::Command;
use std::sync::Arc;

const HASH: &str = "3f79bb7b435b05321651daefd374cdc681dc06faa65e374e38337b88ca046dea";

fn build() -> Vec<u8> {
    let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let status = Command::new("cargo")
        .args(["near", "build", "non-reproducible-wasm", "--manifest-path"])
        .arg(dir.join("Cargo.toml"))
        .status()
        .expect("`cargo near` must be installed to run sandbox tests");
    assert!(status.success(), "building the registry failed");
    std::fs::read(dir.join("../target/near/mimicwatch_registry/mimicwatch_registry.wasm")).unwrap()
}

struct Env {
    _sandbox: near_sandbox::Sandbox,
    net: NetworkConfig,
    signer: Arc<Signer>,
    registry: AccountId,
    owner: AccountId,
    reporter: AccountId,
    lookalike: AccountId,
    stranger: AccountId,
}

async fn create(sandbox: &near_sandbox::Sandbox, name: &str, near: u128) -> AccountId {
    let id: AccountId = name.parse().unwrap();
    sandbox
        .create_account(id.clone())
        .initial_balance(NearToken::from_near(near))
        .send()
        .await
        .unwrap();
    id
}

async fn setup() -> Env {
    let wasm = build();
    let sandbox = near_sandbox::Sandbox::start_sandbox().await.unwrap();
    let net = NetworkConfig::from_rpc_url("sandbox", sandbox.rpc_addr.parse().unwrap());
    // Sandbox accounts created by `create_account` share the genesis key.
    let signer = Signer::from_secret_key(
        near_sandbox::config::DEFAULT_GENESIS_ACCOUNT_PRIVATE_KEY
            .parse()
            .unwrap(),
    )
    .unwrap();
    let registry = create(&sandbox, "registry.sandbox", 20).await;
    let owner = create(&sandbox, "owner.sandbox", 10).await;
    let reporter = create(&sandbox, "reporter.sandbox", 10).await;
    let lookalike = create(&sandbox, "ref-flnance.sandbox", 10).await;
    let stranger = create(&sandbox, "stranger.sandbox", 10).await;
    Contract::deploy(registry.clone())
        .use_code(wasm)
        .with_init_call("new", json!({ "owner_id": owner }))
        .unwrap()
        .with_signer(signer.clone())
        .send_to(&net)
        .await
        .unwrap()
        .assert_success();
    Env {
        _sandbox: sandbox,
        net,
        signer,
        registry,
        owner,
        reporter,
        lookalike,
        stranger,
    }
}

impl Env {
    async fn call(
        &self,
        who: &AccountId,
        method: &str,
        args: Value,
        deposit: NearToken,
    ) -> near_api::types::transaction::result::TransactionResult {
        Contract(self.registry.clone())
            .call_function(method, args)
            .transaction()
            .deposit(deposit)
            .gas(NearGas::from_tgas(100))
            .with_signer(who.clone(), self.signer.clone())
            .send_to(&self.net)
            .await
            .unwrap()
    }

    async fn view(&self, method: &str, args: Value) -> Value {
        Contract(self.registry.clone())
            .call_function(method, args)
            .read_only()
            .fetch_from(&self.net)
            .await
            .unwrap()
            .data
    }

    async fn balance(&self, who: &AccountId) -> u128 {
        Tokens::account(who.clone())
            .near_balance()
            .fetch_from(&self.net)
            .await
            .unwrap()
            .total
            .as_yoctonear()
    }
}

fn report(subject: &AccountId, severity: &str) -> Value {
    json!({ "entry": {
        "subject": subject, "kind": "account", "category": "impersonation", "severity": severity,
        "evidence_url": "https://github.com/kacpergumieniuk/mimicwatch-near/blob/main/evidence/x.json",
        "evidence_hash": HASH, "brand": "rhea", "note": "lookalike of ref-finance"
    }})
}

const ZERO: NearToken = NearToken::from_yoctonear(0);
const ONE_YOCTO: NearToken = NearToken::from_yoctonear(1);

#[tokio::test]
async fn registry_end_to_end() {
    let e = setup().await;

    // A reporter that is not approved cannot write.
    let r = e
        .call(&e.reporter, "report", report(&e.lookalike, "high"), ZERO)
        .await;
    assert!(format!("{}", r.assert_failure()).contains("NOT_REPORTER"));

    // The owner approves the reporter (1 yoctoNEAR proves a full-access key).
    e.call(
        &e.owner,
        "add_reporter",
        json!({ "account_id": e.reporter }),
        ONE_YOCTO,
    )
    .await
    .assert_success();

    // Medium findings are refused on chain: the registry only takes reviewed high/critical.
    let r = e
        .call(&e.reporter, "report", report(&e.lookalike, "medium"), ZERO)
        .await;
    assert!(format!("{}", r.assert_failure()).contains("SEVERITY_TOO_LOW"));

    // A high entry is stored and emits a NEP-297 event.
    let ok = e
        .call(&e.reporter, "report", report(&e.lookalike, "high"), ZERO)
        .await
        .assert_success();
    assert!(
        ok.logs()
            .iter()
            .any(|l| l.starts_with("EVENT_JSON:") && l.contains("entry_reported"))
    );

    // Anyone can query: exact, sub-account, URL-shaped input, and a clean account.
    let f = e
        .view("is_flagged", json!({ "id": e.lookalike.to_string() }))
        .await;
    assert_eq!(f["flagged"], true);
    assert_eq!(f["via"], "exact");
    assert_eq!(f["entry"]["severity"], "high");
    let sub = format!("claim.{}", e.lookalike);
    let f = e.view("is_flagged", json!({ "id": sub })).await;
    assert_eq!(f["via"], "parent-account");
    let f = e
        .view("is_flagged", json!({ "id": "stranger.sandbox" }))
        .await;
    assert_eq!(f["flagged"], false);
    let many = e
        .view(
            "check_many",
            json!({ "ids": [e.lookalike, "stranger.sandbox"] }),
        )
        .await;
    assert_eq!(many[0]["flagged"], true);
    assert_eq!(many[1]["flagged"], false);

    // The flagged account disputes it itself, with the deposit.
    let deposit = NearToken::from_millinear(50);
    e.call(
        &e.lookalike,
        "dispute",
        json!({ "subject": e.lookalike, "kind": "account", "reason": "this is my personal account" }),
        deposit,
    )
    .await
    .assert_success();
    let entry = e
        .view(
            "get_entry",
            json!({ "subject": e.lookalike, "kind": "account" }),
        )
        .await;
    assert_eq!(entry["status"], "disputed");
    assert_eq!(entry["dispute"]["by_subject"], true);

    // A stranger cannot resolve it; the owner accepts it, the entry is cleared, the deposit refunded.
    let r = e
        .call(
            &e.stranger,
            "resolve_dispute",
            json!({ "subject": e.lookalike, "kind": "account", "keep": false, "note": "x" }),
            ONE_YOCTO,
        )
        .await;
    assert!(format!("{}", r.assert_failure()).contains("NOT_OWNER"));
    let before = e.balance(&e.lookalike).await;
    e.call(
        &e.owner,
        "resolve_dispute",
        json!({ "subject": e.lookalike, "kind": "account", "keep": false, "note": "personal account, not an impersonator" }),
        ONE_YOCTO,
    )
    .await
    .assert_success();
    assert_eq!(e.balance(&e.lookalike).await, before + deposit.as_yoctonear());
    let f = e
        .view("is_flagged", json!({ "id": e.lookalike.to_string() }))
        .await;
    assert_eq!(f["flagged"], false);
    assert_eq!(
        f["cleared"]["reason"],
        "personal account, not an impersonator"
    );

    // The reporter cannot re-add a cleared subject.
    let r = e
        .call(&e.reporter, "report", report(&e.lookalike, "critical"), ZERO)
        .await;
    assert!(format!("{}", r.assert_failure()).contains("SUBJECT_CLEARED"));

    let stats = e.view("stats", json!({})).await;
    assert_eq!(stats["entries"], 0);
    assert_eq!(stats["cleared"], 1);
    assert_eq!(stats["reporters"], 1);
}
