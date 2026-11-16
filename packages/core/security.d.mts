export function inlineScriptHashes(html: string): Promise<string[]>;
export function securityHeaders(scriptHashes?: string[]): Record<string, string>;
