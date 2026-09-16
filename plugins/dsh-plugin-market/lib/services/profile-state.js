// ============================================================
// DSH Plugin Market - Installed-state derivation (pure)
// ============================================================
// Why the profile manifest is the authority:
//
// The previous heuristic collected `name`s from the loader and from
// `dsh plugin list`, then matched a catalog row when the name equalled the row
// name / id, or when the row id merely ENDED WITH the name. Two consequences,
// both user-visible:
//
//   * false positives: a loader entry named `dsh-market` (a local `file:`
//     plugin) marked every catalog row named `dsh-market` installed, including
//     `github:dsh-market/dsh-market` and `github:2BingLing/dsh-market`; an
//     entry named `dsh-web` matched `github:zhu1090093659/dsh-web`.
//   * false negatives: `refreshInstalledFlags()` ran immediately after a
//     successful install and *wiped every flag* before re-deriving them from a
//     loader that cannot know about a plugin until the next restart, so a just
//     installed plugin showed as not installed — and therefore never offered
//     the uninstall button, which only renders for installed rows.
//
// The profile's own `package.json` records exactly which package is installed
// and from where (`github:owner/repo`, a registry spec, `file:…`), so it is the
// one source that can tell two same-named plugins apart. Matching is therefore
// by SOURCE IDENTITY, never by bare name.
//
// Everything in this module is pure: no fs, no database, no harness. The host
// wrapper (`installer.js`) does the reading and hands the parsed data in, which
// keeps the decision testable on its own.

/** GitHub hosts whose `owner/repo` is a catalog identity. */
const GITHUB_HOSTS = new Set(["github.com", "www.github.com"]);

/** Spec protocols that mean "a local directory", i.e. never a catalog entry. */
const LOCAL_PROTOCOL = /^(file|link|portal|workspace):/i;

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function stripRef(value) {
  const hash = value.indexOf("#");
  return hash === -1 ? value : value.slice(0, hash);
}

function githubId(owner, repo) {
  const cleanOwner = text(owner);
  const cleanRepo = text(repo).replace(/\.git$/i, "");
  if (cleanOwner === "" || cleanRepo === "") return null;
  return `github:${cleanOwner}/${cleanRepo}`;
}

/**
 * Classify one dependency spec into the identity it installs.
 *
 * @returns {{kind: 'github'|'npm'|'local'|'other'|'unknown', id?: string|null,
 *   owner?: string, repo?: string, name?: string, url?: string}}
 */
export function classifySpec(spec) {
  const raw = text(spec);
  if (raw === "") return { kind: "unknown" };
  if (LOCAL_PROTOCOL.test(raw)) return { kind: "local" };

  const bare = stripRef(raw);

  // git+https://github.com/owner/repo(.git), git://…, git+ssh://git@github.com/…
  const url = /^(?:git\+)?(?:https?|git|ssh):\/\/(?:[^@/]*@)?([^/]+)\/(.+)$/i.exec(bare);
  if (url !== null) {
    const host = url[1].toLowerCase();
    const rest = url[2].replace(/^\/+|\/+$/g, "");
    const parts = rest.split("/");
    if (GITHUB_HOSTS.has(host) && parts.length === 2) {
      const id = githubId(parts[0], parts[1]);
      if (id !== null) return { kind: "github", id, owner: parts[0], repo: parts[1].replace(/\.git$/i, "") };
    }
    return { kind: "other", url: bare };
  }

  if (/^github:/i.test(bare)) {
    const rest = bare.slice("github:".length).replace(/^\/+|\/+$/g, "");
    const parts = rest.split("/");
    if (parts.length >= 2) {
      const id = githubId(parts[0], parts[1]);
      if (id !== null) return { kind: "github", id, owner: parts[0], repo: parts[1].replace(/\.git$/i, "") };
    }
    return { kind: "other" };
  }

  // pnpm / Bun GitHub shorthand: `owner/repo` (no scheme, exactly one slash).
  const shorthand = /^([A-Za-z0-9._-]+)\/([A-Za-z0-9._-]+)$/.exec(bare);
  if (shorthand !== null) {
    const id = githubId(shorthand[1], shorthand[2]);
    if (id !== null) return { kind: "github", id, owner: shorthand[1], repo: shorthand[2] };
  }

  if (/^https?:\/\//i.test(bare)) return { kind: "other", url: bare };

  // `pkg`, `pkg@1.2.3`, `@scope/pkg@^1`, `npm:pkg@1`
  const registry = /^(?:npm:)?(@[^/@]+\/[^/@]+|[^@/]+)(?:@(.+))?$/.exec(bare);
  if (registry !== null) return { kind: "npm", id: `npm:${registry[1]}`, name: registry[1] };

  return { kind: "other" };
}

/** The catalog id a spec installs, or null when it names no catalog source. */
export function catalogIdFromSpec(spec) {
  const classified = classifySpec(spec);
  if (classified.kind === "github" || classified.kind === "npm") return classified.id ?? null;
  return null;
}

/**
 * Catalog ids that the profile's dependency specs actually install.
 *
 * `rows` are catalog identities (`{ id, name, source }`); only exact,
 * case-insensitive identity matches count, so a `file:` copy of `dsh-market`
 * never claims the `github:dsh-market/dsh-market` row.
 */
export function deriveInstalledIds(rows, dependencies) {
  const wanted = new Set();
  for (const spec of Object.values(dependencies ?? {})) {
    const id = catalogIdFromSpec(spec);
    if (id !== null) wanted.add(id.toLowerCase());
  }
  const ids = [];
  for (const row of rows ?? []) {
    const id = text(row?.id);
    if (id !== "" && wanted.has(id.toLowerCase())) ids.push(id);
  }
  return ids;
}

/**
 * One row per profile dependency, for the Market page's "installed" tab.
 *
 * `active` means the profile mounts it as a bundle or the loader currently
 * carries it; a dependency that is downloaded but not mounted stays visible and
 * is labelled inactive instead of disappearing.
 */
export function summarizeInstalled(dependencies, rows, options = {}) {
  const bundles = new Set((options.bundles ?? []).map((value) => String(value).toLowerCase()));
  const loader = new Set((options.loaderNames ?? []).map((value) => String(value).toLowerCase()));
  const versions = options.versions ?? {};
  const index = new Map();
  for (const row of rows ?? []) index.set(text(row?.id).toLowerCase(), row);

  const out = [];
  for (const [name, spec] of Object.entries(dependencies ?? {})) {
    const classified = classifySpec(spec);
    const catalogId = classified.kind === "github" || classified.kind === "npm" ? classified.id ?? null : null;
    const row = catalogId === null ? undefined : index.get(catalogId.toLowerCase());
    out.push({
      name,
      spec: String(spec ?? ""),
      kind: classified.kind,
      catalogId,
      catalogName: row === undefined ? null : text(row.name),
      version: typeof versions[name] === "string" ? versions[name] : null,
      active: bundles.has(name.toLowerCase()) || loader.has(name.toLowerCase()),
    });
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}
