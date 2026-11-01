/**
 * npm run testnet:setup [-- --force]
 *
 * Creates one throwaway testnet account with the public faucet, plus sub-accounts:
 *   registry.<owner>  the Mimicwatch registry contract
 *   reporter.<owner>  an approved reporter (the publisher signs as this account)
 *   disputer.<owner>  a third party used to show disputes
 * deploys and initialises the contract, approves the reporter, and saves everything to
 * .mimicwatch-local/testnet.json (gitignored, 0600). Keys are never printed. Testnet only.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { JsonRpcProvider } from "near-api-js";
import { ROOT } from "../src/brands.ts";
import { deployRegistry, RegistrySigner } from "../src/registry/client.ts";
import { faucetAccount, loadDeployment, saveDeployment, statePath, subAccount } from "../src/registry/local.ts";

const RPC = process.env.MIMICWATCH_TESTNET_RPC ?? "https://test.rpc.fastnear.com";
const status = (await (await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "status", params: [] }) })).json()) as { result?: { chain_id?: string } };
if (status.result?.chain_id !== "testnet") throw new Error(`refusing to run: ${RPC} reports chain_id ${status.result?.chain_id}`);

const existing = loadDeployment("testnet");
if (existing && !process.argv.includes("--force")) {
  console.log(`testnet deployment exists (${statePath("testnet")}): registry ${existing.registry.id}. Use --force for a new one.`);
  process.exit(0);
}
const provider = new JsonRpcProvider({ url: RPC });
const name = `mimicwatch-${Math.random().toString(36).slice(2, 10)}`;
console.log(`creating ${name}.testnet with the faucet…`);
const owner = await faucetAccount(name, provider);
const registry = await subAccount(owner, "registry", "4", provider);
const reporter = await subAccount(owner, "reporter", "1", provider);
const disputer = await subAccount(owner, "disputer", "1", provider);
const wasm = new Uint8Array(readFileSync(join(ROOT, "contracts/target/near/mimicwatch_registry/mimicwatch_registry.wasm")));
const deployTx = await deployRegistry({ rpcUrl: RPC, accountId: registry.id, key: registry.key, wasm, owner: owner.id });
const asOwner = new RegistrySigner(registry.id, "testnet", RPC, owner.id, owner.key);
const add = await asOwner.addReporter(reporter.id);
saveDeployment({ network: "testnet", rpcUrl: RPC, owner, registry, reporter, disputer, deployTx, createdAt: new Date().toISOString() });
const x = (id: string) => `https://testnet.nearblocks.io/address/${id}`;
console.log(`registry  ${x(registry.id)}\nowner     ${x(owner.id)}\nreporter  ${x(reporter.id)}\ndisputer  ${x(disputer.id)}`);
console.log(`deploy tx https://testnet.nearblocks.io/txns/${deployTx}\nadd_reporter tx https://testnet.nearblocks.io/txns/${add.tx}`);
console.log(`saved to ${statePath("testnet")} (keys stay in that file)`);
