/** Minimal keyed view for one Image Creation tool call. */
import type { ReactNode } from 'react';
import type { ToolCallBlock } from '@deepseek-ai/dsh-client-runtime/client';
import type { ImageLoader } from './CodexImageGallery.tsx';
import { type CodexAuthKey } from './locales.ts';
export interface CodexImageToolViewProps {
    block: ToolCallBlock;
    loadImage: ImageLoader;
    t?: (key: CodexAuthKey) => string;
}
/** Successful calls render only their durable images; status copy appears only while running or on failure. */
export declare function CodexImageToolView({ block, loadImage, t }: CodexImageToolViewProps): ReactNode;
//# sourceMappingURL=CodexImageToolView.d.ts.map