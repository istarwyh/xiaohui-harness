import type { ReactNode } from 'react';
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment';
/** Resolve one session-authorized durable attachment to a browser-owned URL. */
export type ImageLoader = (attachment: ImageAttachmentRef) => Promise<string>;
/** Copy owned by the Codex capability locale namespace. */
export interface CodexImageLabels {
    image: string;
    open: string;
    openNamed: (label: string) => string;
    loading: string;
    loadFailed: string;
    lightbox: {
        dialog: string;
        close: string;
    };
}
interface GalleryImage {
    attachment: ImageAttachmentRef;
}
/** Render durable images without depending on another client plugin's private module exports. */
export declare function CodexImageGallery({ images, load, labels }: {
    images: readonly GalleryImage[];
    load: ImageLoader;
    labels: CodexImageLabels;
}): ReactNode;
export {};
//# sourceMappingURL=CodexImageGallery.d.ts.map