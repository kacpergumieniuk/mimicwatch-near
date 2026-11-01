/**
 * Local state for testnet and sandbox deployments: account ids and keys in
 * .mimicwatch-local/<network>.json (gitignored, mode 0600). Keys are never printed.
 */
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Account, JsonRpcProvider, KeyPair, type KeyPairString, nearToYocto } from "near-api-js";
import { ROOT } from "../brands.ts";

export interface KeyedAccount {
  id: string;
  key: KeyPairString;
}

export interface Deployment {
  network: "testnet" | "sandbox";
  rpcUrl: string;
  owner: KeyedAccount;
  registry: KeyedAccount;
  reporter: KeyedAccount;
  /** A throwaway account used to show disputes. */
  disputer?: KeyedAccount;
  /** A lookalike-named test account under the owner, used by scripts/testnet-demo.ts. */
  testLookalike?: KeyedAccount;
  deployTx?: string;
  createdAt: string;
}

export const LOCAL_DIR = join(ROOT, ".mimicwatch-local");
export const statePath = (network: string) => join(LOCAL_DIR, `${network}.json`);

export function loadDeployment(network: string): Deployment | undefined {
  const p = statePath(network);
  return existsSync(p) ? (JSON.parse(readFileSync(p, "utf8")) as Deployment) : undefined;
}

export function saveDeployment(d: Deployment): void {
  mkdirSync(LOCAL_DIR, { recursive: true, mode: 0o700 });
  const p = statePath(d.network);
  writeFileSync(p, JSON.stringify(d, null, 2), { mode: 0o600 });
  chmodSync(p, 0o600);
}

export const FAUCET_HELPER = "https://helper.nearprotocol.com/account";

async function waitForAccount(provider: JsonRpcProvider, id: string) {
  for (let i = 0; i < 30; i++) {
    try {
      await provider.viewAccount({ accountId: id });
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  throw new Error(`account ${id} did not appear`);
}

/** Creates `<name>.testnet` with the public faucet helper (free testnet NEAR). */
export async function faucetAccount(name: string, provider: JsonRpcProvider): Promise<KeyedAccount> {
  const kp = KeyPair.fromRandom("ed25519");
  const id = `${name}.testnet`;
  const res = await fetch(FAUCET_HELPER, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ newAccountId: id, newAccountPublicKey: kp.getPublicKey().toString() }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`faucet helper refused ${id}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  await waitForAccount(provider, id);
  return { id, key: kp.toString() as KeyPairString };
}

export async function subAccount(parent: KeyedAccount, prefix: string, near: `${number}`, provider: JsonRpcProvider): Promise<KeyedAccount> {
  const kp = KeyPair.fromRandom("ed25519");
  const acc = new Account(parent.id, provider, parent.key);
  await acc.createSubAccount({ accountOrPrefix: prefix, publicKey: kp.getPublicKey().toString(), nearToTransfer: nearToYocto(near) });
  return { id: `${prefix}.${parent.id}`, key: kp.toString() as KeyPairString };
}
