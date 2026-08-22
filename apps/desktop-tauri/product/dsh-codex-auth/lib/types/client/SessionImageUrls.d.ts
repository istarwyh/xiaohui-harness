/** Bounded browser-owned Blob URLs over session-authorized attachment reads. */
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment';
import type { ISessions, SessionId } from '@deepseek-ai/dsh-client-runtime/client';
/** Owns only this plugin's image URLs; clearing never evicts conversation-owned URLs. */
export declare class SessionImageUrls {
    private readonly sessions;
    private readonly maxEntries;
    private readonly entries;
    constructor(sessions: Pick<ISessions, 'binding'>, maxEntries?: number);
    resolve(sessionId: SessionId, attachment: ImageAttachmentRef): Promise<string>;
    clear(): void;
    private read;
    private evictOverflow;
}
//# sourceMappingURL=SessionImageUrls.d.ts.map