/** NEAR account-id rules (nomicon "Account ID"): 2-64 chars, lowercase a-z 0-9, separators - _ . */

const ACCOUNT_RE = /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/;

export function isValidAccountId(id: string): boolean {
  return id.length >= 2 && id.length <= 64 && ACCOUNT_RE.test(id);
}

/** 64-char hex (ed25519 implicit) or 0x + 40 hex (eth-implicit). */
export function isImplicit(id: string): boolean {
  return /^[0-9a-f]{64}$/.test(id) || /^0x[0-9a-f]{40}$/.test(id);
}

/** "a.b.near" -> "b.near"; top-level -> undefined. */
export function parentOf(id: string): string | undefined {
  const i = id.indexOf(".");
  return i === -1 ? undefined : id.slice(i + 1);
}

/** "a.b.near" -> "near". */
export function topLevelOf(id: string): string {
  return id.slice(id.lastIndexOf(".") + 1);
}

/** True when `id` is `root` or any sub-account of it (only the parent can create sub-accounts). */
export function isUnder(id: string, root: string): boolean {
  return id === root || id.endsWith(`.${root}`);
}

/** The part before the top-level account: "v2.ref-finance.near" -> "v2.ref-finance". */
export function stripTopLevel(id: string): string {
  const i = id.lastIndexOf(".");
  return i === -1 ? id : id.slice(0, i);
}
