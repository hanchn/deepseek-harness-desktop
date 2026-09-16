export type SpecKind = "github" | "npm" | "local" | "other" | "unknown";

export interface ClassifiedSpec {
  kind: SpecKind;
  id?: string | null;
  owner?: string;
  repo?: string;
  name?: string;
  url?: string;
}

export interface CatalogIdentity {
  id: string;
  name?: string;
  source?: string;
}

export interface InstalledSummary {
  name: string;
  spec: string;
  kind: SpecKind;
  catalogId: string | null;
  catalogName: string | null;
  version: string | null;
  active: boolean;
}

export function classifySpec(spec: unknown): ClassifiedSpec;

export function catalogIdFromSpec(spec: unknown): string | null;

export function deriveInstalledIds(
  rows: ReadonlyArray<CatalogIdentity> | null | undefined,
  dependencies: Record<string, string> | null | undefined,
): string[];

export function summarizeInstalled(
  dependencies: Record<string, string> | null | undefined,
  rows: ReadonlyArray<CatalogIdentity> | null | undefined,
  options?: {
    bundles?: ReadonlyArray<string> | null;
    loaderNames?: ReadonlyArray<string> | null;
    versions?: Record<string, string> | null;
  },
): InstalledSummary[];
