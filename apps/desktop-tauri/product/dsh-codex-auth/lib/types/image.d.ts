import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import type { AttachmentStore } from '@deepseek-ai/dsh-attachment';
import type { FileSystem } from '@deepseek-ai/dsh-fs';
import type { LlmResolvedModelInfo } from '@deepseek-ai/dsh-llm';
import type { ToolDefinition } from '@deepseek-ai/dsh-tools';
import type { CodexAuthService } from './codex-auth-service.ts';
export declare const GENERATE_IMAGE_TOOL_NAME = "generate_image";
export declare const LIST_IMAGES_TOOL_NAME = "list_images";
export declare const CODEX_IMAGE_GENERATION_ENDPOINT = "https://chatgpt.com/backend-api/codex/images/generations";
export declare const CODEX_IMAGE_EDIT_ENDPOINT = "https://chatgpt.com/backend-api/codex/images/edits";
export declare const CODEX_IMAGE_SETTINGS_NAMESPACE: import("@deepseek-ai/dsh-settings").SettingsNamespace;
declare const IMAGE_ORIGINS: readonly ["all", "generated", "reference", "user"];
declare const IMAGE_SIZES: readonly ["auto", "1024x1024", "1536x1024", "1024x1536"];
declare const IMAGE_QUALITIES: readonly ["auto", "low", "medium", "high"];
declare const IMAGE_BACKGROUNDS: readonly ["auto", "opaque", "transparent"];
export type ImageOriginFilter = (typeof IMAGE_ORIGINS)[number];
export type ImageSize = (typeof IMAGE_SIZES)[number];
export type ImageQuality = (typeof IMAGE_QUALITIES)[number];
export type ImageBackground = (typeof IMAGE_BACKGROUNDS)[number];
/** Independently live Image Creation settings. */
export interface CodexImageSettings {
    enabled: boolean;
    model: string;
    n: number;
    size: ImageSize;
    quality: ImageQuality;
    background: ImageBackground;
}
export interface Config extends CodexImageSettings {
}
export declare const Config: z<Config>;
/** Narrow dependency surface used by both public Tool definitions. */
export interface CodexImageToolOptions {
    auth: Pick<CodexAuthService, 'credential'>;
    settings: () => CodexImageSettings;
    attachments: Pick<AttachmentStore, 'imageLimits' | 'validateImage' | 'saveImage' | 'readImage'>;
    fs: Pick<FileSystem, 'resolve' | 'contains' | 'processPath' | 'readBytes'>;
    resolveModelInfo(provider: string, model: string, signal?: AbortSignal): Promise<Pick<LlmResolvedModelInfo, 'inputModalities'>>;
    fetchImpl: typeof fetch;
}
/** Build registry-ready public Capability Tools around one dependency set. */
export declare function createCodexImageTools(options: CodexImageToolOptions): readonly ToolDefinition[];
/** Cordis plugin name for the independent Image row. */
export declare const name = "codex-image";
export declare const inject: string[];
/**
 * Register image tools only in currently eligible Agent scopes. Eligibility is
 * re-evaluated for live settings, auth facts, adapter changes, and request-route
 * snapshots; every Tool body repeats the exact guard as the authorization edge.
 */
export declare function apply(ctx: Context, config: Config): void;
export {};
//# sourceMappingURL=image.d.ts.map