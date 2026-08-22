//#region src/invariant.ts
const PACKAGE_NAME = "dsh-codex-auth";
/** Cordis companion plugin name. */
const name = "llm-codex-auth-invariant";
/** Service required before the companion can reserve package ownership. */
const inject = ["invariants"];
/**
* No runtime invariant: adapter/RPC registrations are fiber-owned and tested
* through their real registries; token secrecy is a structural wire contract.
*/
const install = () => {};
/** Register this package's invariant companion. */
const apply = (ctx) => Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install));
//#endregion
export { apply, inject, name };
