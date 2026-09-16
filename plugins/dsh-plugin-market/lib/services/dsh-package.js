// ============================================================
// DSH Plugin Market - resolve an installation package from anywhere
// ============================================================
// DSH resolves a profile plugin's `@deepseek-ai/*` imports through Node's
// ordinary parent walk: `<DSH_HOME>/profiles/node_modules` carries the
// installation closure (@deepseek-ai/dsh-app-boot documents this two-anchor
// layout). That holds while the plugin directory lives inside the profile — and
// stops holding the moment the profile links the plugin from elsewhere, because
// a `file:` dependency is a symlink and Node resolves a module's REAL path. A
// vendored copy then imports from the repository and never walks through
// `<DSH_HOME>/profiles`, so its peer import fails at load time.
//
// This module restores those anchors explicitly, which keeps a vendored plugin
// working exactly like a pnpm-installed one.
import { existsSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/** `<DSH_HOME>` as the Harness itself resolves it. */
export function dshHomeDir() {
    const value = process.env.DSH_HOME;
    return typeof value === 'string' && value.trim() !== '' ? value : path.join(os.homedir(), '.dsh');
}

function conditionValues(value, out) {
    if (typeof value === 'string') {
        out.push(value);
        return;
    }
    if (value === null || typeof value !== 'object')
        return;
    // `default` first: it is the condition every runtime understands.
    for (const key of ['default', 'import', 'module', 'node', 'require']) {
        if (Object.prototype.hasOwnProperty.call(value, key))
            conditionValues(value[key], out);
    }
}

/**
 * Import entries a package manifest declares, most specific first.
 *
 * Only the root export is considered: this resolves a peer the plugin imports
 * by bare package name, never a subpath.
 */
export function packageEntryCandidates(manifest) {
    const out = [];
    const root = manifest?.exports;
    if (typeof root === 'object' && root !== null && !Array.isArray(root) && Object.prototype.hasOwnProperty.call(root, '.')) {
        conditionValues(root['.'], out);
    }
    else {
        conditionValues(root, out);
    }
    if (typeof manifest?.module === 'string')
        out.push(manifest.module);
    if (typeof manifest?.main === 'string')
        out.push(manifest.main);
    out.push('index.js');
    return [...new Set(out)];
}

/**
 * Directories to try, in order, for one installation package.
 *
 * `argv1` is the booted Harness entry (`…/@deepseek-ai/dsh/lib/bin.js`), which
 * anchors the very installation that is running us.
 */
export function packageAnchors(name, options = {}) {
    const home = typeof options.home === 'string' && options.home !== '' ? options.home : dshHomeDir();
    const segments = String(name).split('/');
    const dirs = [
        path.join(home, 'profiles', 'node_modules', ...segments),
        path.join(home, 'node_modules', ...segments),
    ];
    const marker = `${path.sep}node_modules${path.sep}`;
    const argv1 = options.argv1 ?? process.argv?.[1];
    if (typeof argv1 === 'string') {
        const at = argv1.lastIndexOf(marker);
        if (at !== -1)
            dirs.push(path.join(argv1.slice(0, at + marker.length), ...segments));
    }
    return dirs;
}

function entryFileIn(dir) {
    try {
        const manifest = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8'));
        for (const relative of packageEntryCandidates(manifest)) {
            const file = path.join(dir, relative);
            if (existsSync(file))
                return file;
        }
    }
    catch {
        /* not a readable package directory */
    }
    return null;
}

/**
 * Import an installation package, falling back to the DSH anchors.
 *
 * The bare import is tried first so a normally installed plugin keeps using the
 * profile's own copy (and therefore the installation's module identity).
 */
export async function loadDshPackage(name, options = {}) {
    const failures = [];
    try {
        return await import(name);
    }
    catch (error) {
        failures.push(String(error?.message ?? error));
    }
    for (const dir of packageAnchors(name, options)) {
        const entry = entryFileIn(dir);
        if (entry === null)
            continue;
        try {
            return await import(pathToFileURL(entry).href);
        }
        catch (error) {
            failures.push(String(error?.message ?? error));
        }
    }
    throw new Error(`dsh-plugin-market: cannot resolve ${name} (${failures.join(' | ') || 'no candidate path'})`);
}
