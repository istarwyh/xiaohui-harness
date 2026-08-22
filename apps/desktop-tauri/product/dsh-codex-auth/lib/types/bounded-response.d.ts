/** Shared bounded UTF-8 response reader for private Codex capability endpoints. */
export interface BoundedResponseErrors {
    tooLarge: () => Error;
    cancelled?: () => Error;
}
export declare function readBoundedResponseText(response: Response, maxBytes: number, signal: AbortSignal | undefined, errors: BoundedResponseErrors): Promise<string>;
//# sourceMappingURL=bounded-response.d.ts.map