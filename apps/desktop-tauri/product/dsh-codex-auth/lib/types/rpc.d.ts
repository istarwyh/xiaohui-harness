/** Host dispatcher for the codex-auth plugin's dedicated Connection RPC. */
import type { RpcResult } from '@deepseek-ai/dsh-host-apiproxy/api';
import type { CodexAuthService } from './codex-auth-service.ts';
export { CODEX_AUTH_RPC_CHANNEL } from './rpc-contract.ts';
/** Dispatch a decoded Host request without ever exposing token material. */
export declare function handleCodexAuthRpc(service: Pick<CodexAuthService, 'status' | 'usage' | 'login'>, endpoint: string, payload: unknown, signal?: AbortSignal): Promise<RpcResult<unknown>>;
//# sourceMappingURL=rpc.d.ts.map