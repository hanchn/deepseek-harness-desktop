export function dshHomeDir(): string;

export function packageEntryCandidates(manifest: unknown): string[];

export function packageAnchors(
  name: string,
  options?: { home?: string; argv1?: string },
): string[];

export function loadDshPackage(
  name: string,
  options?: { home?: string; argv1?: string },
): Promise<Record<string, unknown>>;
