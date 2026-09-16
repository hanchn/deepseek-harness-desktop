// ============================================================
// DSH Plugin Market - Database Schema & Cache Layer
// ============================================================
// 使用 sql.js (纯 JavaScript SQLite 实现)，无需原生编译
// 支持所有平台 (Windows/macOS/Linux)，零依赖安装
// ============================================================
import fs from 'node:fs';
import path from 'node:path';
import initSqlJs from 'sql.js';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { CATEGORIES } from '../utils/categories.js';
const require = createRequire(import.meta.url);
const SCHEMA_VERSION = 1;
export class PluginCache {
    db;
    dbPath;
    dbDir;
    saveTimeout = null;
    pendingSave = false;
    readyPromise = null;
    constructor(dbPath) {
        this.dbPath = dbPath;
        this.dbDir = path.dirname(dbPath);
        // 数据库延迟初始化，通过 ready() 方法触发
    }
    /**
     * 等待数据库就绪（异步初始化 sql.js WASM）
     * 多次调用安全，只会初始化一次
     */
    async ready() {
        if (!this.readyPromise) {
            this.readyPromise = this.initDatabase();
        }
        return this.readyPromise;
    }
    async initDatabase() {
        // 确保目录存在
        if (!fs.existsSync(this.dbDir)) {
            fs.mkdirSync(this.dbDir, { recursive: true });
        }
        let wasmPath;
        try {
            wasmPath = path.join(path.dirname(require.resolve('sql.js')), 'sql-wasm.wasm');
        }
        catch {
            try {
                wasmPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../node_modules/sql.js/dist/sql-wasm.wasm');
            }
            catch {
                wasmPath = undefined;
            }
        }
        const SQL = await initSqlJs(wasmPath ? { locateFile: () => wasmPath } : undefined);
        // 如果数据库文件存在，从文件加载
        if (fs.existsSync(this.dbPath)) {
            try {
                const fileBuffer = fs.readFileSync(this.dbPath);
                this.db = new SQL.Database(fileBuffer);
            }
            catch (error) {
                console.warn('[plugin-market] Failed to load database, creating new one:', error);
                this.db = new SQL.Database();
            }
        }
        else {
            this.db = new SQL.Database();
        }
        // sql.js 默认开启外键
        this.db.run('PRAGMA foreign_keys = ON');
        this.initSchema();
    }
    initSchema() {
        const versionRow = this.db.exec('PRAGMA user_version');
        const version = versionRow.length > 0 && versionRow[0].values.length > 0
            ? Number(versionRow[0].values[0][0])
            : 0;
        if (version === 0) {
            this.createTables();
            this.insertDefaultCategories();
            this.db.run(`PRAGMA user_version = ${SCHEMA_VERSION}`);
            this.scheduleSave();
        }
    }
    createTables() {
        this.db.run(`
      CREATE TABLE IF NOT EXISTS plugins (
        id TEXT PRIMARY KEY,
        source TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT DEFAULT '',
        category TEXT DEFAULT 'other',
        author TEXT DEFAULT '',
        url TEXT DEFAULT '',
        stars INTEGER DEFAULT 0,
        downloads INTEGER DEFAULT 0,
        version TEXT DEFAULT '',
        license TEXT DEFAULT '',
        language TEXT DEFAULT '',
        topics TEXT DEFAULT '[]',
        keywords TEXT DEFAULT '[]',
        readme TEXT DEFAULT '',
        readme_url TEXT DEFAULT '',
        install_cmd TEXT DEFAULT '',
        permission_level TEXT DEFAULT 'unknown',
        compatibility TEXT DEFAULT '',
        updated_at TEXT NOT NULL,
        cached_at TEXT NOT NULL,
        installed_version TEXT,
        is_installed INTEGER DEFAULT 0
      );
    `);
        this.db.run(`
      CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        name_en TEXT,
        icon TEXT,
        description TEXT,
        plugin_count INTEGER DEFAULT 0
      );
    `);
        this.db.run(`
      CREATE TABLE IF NOT EXISTS plugin_categories (
        plugin_id TEXT NOT NULL,
        category_id TEXT NOT NULL,
        PRIMARY KEY (plugin_id, category_id)
      );
    `);
        this.db.run(`
      CREATE TABLE IF NOT EXISTS install_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        plugin_id TEXT NOT NULL,
        action TEXT NOT NULL,
        version TEXT,
        status TEXT NOT NULL,
        error_message TEXT,
        created_at TEXT NOT NULL
      );
    `);
        this.db.run(`
      CREATE TABLE IF NOT EXISTS sync_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source TEXT NOT NULL,
        status TEXT NOT NULL,
        plugin_count INTEGER DEFAULT 0,
        error_message TEXT,
        started_at TEXT NOT NULL,
        finished_at TEXT
      );
    `);
        // 索引
        this.db.run('CREATE INDEX IF NOT EXISTS idx_plugins_category ON plugins(category)');
        this.db.run('CREATE INDEX IF NOT EXISTS idx_plugins_stars ON plugins(stars DESC)');
        this.db.run('CREATE INDEX IF NOT EXISTS idx_plugins_updated ON plugins(updated_at DESC)');
        this.db.run('CREATE INDEX IF NOT EXISTS idx_plugins_installed ON plugins(is_installed)');
        this.db.run('CREATE INDEX IF NOT EXISTS idx_plugins_name ON plugins(name)');
        this.db.run('CREATE INDEX IF NOT EXISTS idx_plugins_source ON plugins(source)');
        this.db.run('CREATE INDEX IF NOT EXISTS idx_plugins_permission ON plugins(permission_level)');
    }
    // ---------- 持久化（防抖保存到文件） ----------
    scheduleSave() {
        this.pendingSave = true;
        if (this.saveTimeout)
            return;
        this.saveTimeout = setTimeout(() => {
            this.saveToFile();
            this.saveTimeout = null;
            if (this.pendingSave) {
                this.pendingSave = false;
                this.scheduleSave();
            }
        }, 500);
    }
    saveToFile() {
        try {
            const data = this.db.export();
            const buffer = Buffer.from(data);
            fs.writeFileSync(this.dbPath, buffer);
        }
        catch (error) {
            console.error('[plugin-market] Failed to save database:', error);
        }
    }
    // ---------- 插件 CRUD ----------
    upsertPlugin(plugin) {
        const stmt = `
      INSERT INTO plugins (
        id, source, name, description, category, author, url, stars, downloads,
        version, license, language, topics, keywords, readme, readme_url,
        install_cmd, permission_level, compatibility, updated_at, cached_at,
        is_installed, installed_version
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        source = excluded.source,
        name = excluded.name,
        description = excluded.description,
        category = excluded.category,
        author = excluded.author,
        url = excluded.url,
        stars = excluded.stars,
        downloads = excluded.downloads,
        version = excluded.version,
        license = excluded.license,
        language = excluded.language,
        topics = excluded.topics,
        keywords = excluded.keywords,
        readme = CASE WHEN excluded.readme != '' THEN excluded.readme ELSE plugins.readme END,
        readme_url = excluded.readme_url,
        install_cmd = excluded.install_cmd,
        permission_level = excluded.permission_level,
        compatibility = excluded.compatibility,
        updated_at = excluded.updated_at,
        cached_at = excluded.cached_at
    `;
        this.db.run(stmt, [
            plugin.id,
            plugin.source,
            plugin.name,
            plugin.description,
            plugin.category,
            plugin.author,
            plugin.url,
            plugin.stars,
            plugin.downloads,
            plugin.version,
            plugin.license,
            plugin.language,
            JSON.stringify(plugin.topics),
            JSON.stringify(plugin.keywords),
            '', // readme 单独更新
            plugin.readmeUrl || '',
            plugin.installCmd,
            plugin.permissionLevel,
            plugin.compatibility || '',
            plugin.updatedAt,
            plugin.cachedAt,
            plugin.isInstalled ? 1 : 0,
            plugin.installedVersion || null,
        ]);
        this.scheduleSave();
    }
    updatePluginReadme(pluginId, readme) {
        this.db.run('UPDATE plugins SET readme = ? WHERE id = ?', [readme, pluginId]);
        this.scheduleSave();
    }
    getPlugin(pluginId) {
        const result = this.db.exec('SELECT * FROM plugins WHERE id = ?', [pluginId]);
        if (result.length === 0 || result[0].values.length === 0)
            return null;
        const row = this.rowToObject(result[0].columns, result[0].values[0]);
        return this.rowToPlugin(row);
    }
    getPluginDetail(pluginId) {
        const result = this.db.exec('SELECT * FROM plugins WHERE id = ?', [pluginId]);
        if (result.length === 0 || result[0].values.length === 0)
            return null;
        const row = this.rowToObject(result[0].columns, result[0].values[0]);
        const plugin = this.rowToPlugin(row);
        return {
            ...plugin,
            readme: row.readme || '',
        };
    }
    searchPlugins(query, options) {
        const conditions = [];
        const params = [];
        if (query && query.trim()) {
            conditions.push('(name LIKE ? OR description LIKE ? OR keywords LIKE ? OR topics LIKE ? OR author LIKE ?)');
            const like = `%${query}%`;
            params.push(like, like, like, like, like);
        }
        if (options.category && options.category !== 'all') {
            conditions.push('category = ?');
            params.push(options.category);
        }
        if (options.installedOnly) {
            conditions.push('is_installed = 1');
        }
        if (options.riskLevel && options.riskLevel !== 'all') {
            conditions.push('permission_level = ?');
            params.push(options.riskLevel);
        }
        if (options.source && options.source !== 'all') {
            conditions.push('source = ?');
            params.push(options.source);
        }
        const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
        // Count total
        const countResult = this.db.exec(`SELECT COUNT(*) as count FROM plugins ${where}`, params);
        const total = countResult.length > 0 && countResult[0].values.length > 0
            ? Number(countResult[0].values[0][0])
            : 0;
        // Sort
        const sortBy = options.sortBy || 'stars';
        const sortOrder = options.sortOrder || 'desc';
        const sortMap = {
            stars: 'stars',
            updated: 'updated_at',
            updated_at: 'updated_at',
            name: 'name',
            downloads: 'downloads',
        };
        const sortColumn = sortMap[sortBy] || 'stars';
        const order = sortOrder === 'asc' ? 'ASC' : 'DESC';
        // Pagination
        const page = options.page || 1;
        const pageSize = options.pageSize || 50;
        const offset = (page - 1) * pageSize;
        const result = this.db.exec(`SELECT * FROM plugins ${where} ORDER BY ${sortColumn} ${order} LIMIT ? OFFSET ?`, [...params, pageSize, offset]);
        let plugins = [];
        if (result.length > 0) {
            const columns = result[0].columns;
            plugins = result[0].values.map((row) => {
                const obj = this.rowToObject(columns, row);
                return this.rowToPlugin(obj);
            });
        }
        return { plugins, total };
    }
    getTrendingPlugins(limit = 20) {
        const result = this.db.exec('SELECT * FROM plugins ORDER BY stars DESC LIMIT ?', [limit]);
        if (result.length === 0)
            return [];
        const columns = result[0].columns;
        return result[0].values.map((row) => {
            const obj = this.rowToObject(columns, row);
            return this.rowToPlugin(obj);
        });
    }
    getRecentPlugins(limit = 20) {
        const result = this.db.exec('SELECT * FROM plugins ORDER BY updated_at DESC LIMIT ?', [limit]);
        if (result.length === 0)
            return [];
        const columns = result[0].columns;
        return result[0].values.map((row) => {
            const obj = this.rowToObject(columns, row);
            return this.rowToPlugin(obj);
        });
    }
    getInstalledPlugins() {
        const result = this.db.exec('SELECT * FROM plugins WHERE is_installed = 1 ORDER BY name ASC');
        if (result.length === 0)
            return [];
        const columns = result[0].columns;
        return result[0].values.map((row) => {
            const obj = this.rowToObject(columns, row);
            return this.rowToPlugin(obj);
        });
    }
    setInstalled(pluginId, installed, version) {
        this.db.run('UPDATE plugins SET is_installed = ?, installed_version = ? WHERE id = ?', [installed ? 1 : 0, version || null, pluginId]);
        this.scheduleSave();
    }
    /** Catalog identities (`{ id, name, source }`) for authoritative matching. */
    listIdentities() {
        const result = this.db.exec('SELECT id, name, source FROM plugins');
        if (result.length === 0)
            return [];
        const columns = result[0].columns;
        return result[0].values.map((row) => {
            const obj = this.rowToObject(columns, row);
            return {
                id: String(obj.id ?? ''),
                name: String(obj.name ?? ''),
                source: String(obj.source ?? ''),
            };
        });
    }
    /**
     * Set the installed flags to EXACTLY these catalog ids.
     *
     * The caller derives them from the profile manifest, so replacing the whole
     * set is deliberate: a plugin removed outside this page must stop showing as
     * installed. The name/suffix matching that used to live here marked
     * unrelated same-named rows installed — see `services/profile-state.js`.
     */
    applyInstalledIds(ids) {
        if (!Array.isArray(ids))
            return 0;
        this.db.run('UPDATE plugins SET is_installed = 0');
        let applied = 0;
        for (const id of ids) {
            this.db.run('UPDATE plugins SET is_installed = 1 WHERE id = ?', [String(id)]);
            applied += 1;
        }
        this.scheduleSave();
        return applied;
    }
    getTotalCount() {
        const result = this.db.exec('SELECT COUNT(*) as count FROM plugins');
        if (result.length === 0 || result[0].values.length === 0)
            return 0;
        return Number(result[0].values[0][0]);
    }
    // ---------- 分类 ----------
    getCategories() {
        const result = this.db.exec(`
      SELECT c.id, c.name, c.name_en, c.icon, c.description,
             (SELECT COUNT(*) FROM plugins p WHERE p.category = c.id) as plugin_count
      FROM categories c
      ORDER BY c.id = 'other' ASC, plugin_count DESC
    `);
        if (result.length === 0)
            return [];
        const columns = result[0].columns;
        return result[0].values.map((row) => {
            const r = this.rowToObject(columns, row);
            return {
                id: r.id,
                name: r.name,
                nameEn: r.name_en,
                icon: r.icon,
                description: r.description,
                pluginCount: Number(r.plugin_count) || 0,
            };
        });
    }
    insertDefaultCategories() {
        const categories = CATEGORIES.map((c) => ({
            id: c.id,
            name: c.name,
            nameEn: c.nameEn,
            icon: '',
            description: c.description,
        }));
        const stmt = this.db.prepare('INSERT OR IGNORE INTO categories (id, name, name_en, icon, description) VALUES (?, ?, ?, ?, ?)');
        for (const c of categories) {
            stmt.run([c.id, c.name, c.nameEn, c.icon, c.description]);
        }
    }
    // ---------- 安装日志 ----------
    addInstallLog(entry) {
        this.db.run(`INSERT INTO install_log (plugin_id, action, version, status, error_message, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`, [
            entry.pluginId,
            entry.action,
            entry.version || null,
            entry.status,
            entry.errorMessage || null,
            entry.createdAt,
        ]);
        // sql.js 没有 lastInsertRowid 的直接 API，用查询获取
        const result = this.db.exec('SELECT last_insert_rowid() as id');
        const id = result.length > 0 && result[0].values.length > 0
            ? Number(result[0].values[0][0])
            : 0;
        this.scheduleSave();
        return id;
    }
    updateInstallLog(id, status, errorMessage) {
        this.db.run('UPDATE install_log SET status = ?, error_message = ? WHERE id = ?', [status, errorMessage || null, id]);
        this.scheduleSave();
    }
    // ---------- 同步日志 ----------
    addSyncLog(source, status, startedAt) {
        this.db.run(`INSERT INTO sync_log (source, status, started_at) VALUES (?, ?, ?)`, [source, status, startedAt]);
        const result = this.db.exec('SELECT last_insert_rowid() as id');
        const id = result.length > 0 && result[0].values.length > 0
            ? Number(result[0].values[0][0])
            : 0;
        this.scheduleSave();
        return id;
    }
    finishSyncLog(id, status, pluginCount, finishedAt, errorMessage) {
        this.db.run('UPDATE sync_log SET status = ?, plugin_count = ?, finished_at = ?, error_message = ? WHERE id = ?', [status, pluginCount, finishedAt, errorMessage || null, id]);
        this.scheduleSave();
    }
    getLastSyncTime(source) {
        let result;
        if (source) {
            result = this.db.exec("SELECT finished_at FROM sync_log WHERE source = ? AND status = 'success' ORDER BY finished_at DESC LIMIT 1", [source]);
        }
        else {
            result = this.db.exec("SELECT finished_at FROM sync_log WHERE status = 'success' ORDER BY finished_at DESC LIMIT 1");
        }
        if (result.length === 0 || result[0].values.length === 0)
            return null;
        return String(result[0].values[0][0]) || null;
    }
    // ---------- 缓存状态 ----------
    getCacheStatus() {
        const total = this.getTotalCount();
        const lastSync = this.getLastSyncTime();
        const githubResult = this.db.exec("SELECT COUNT(*) as count FROM plugins WHERE source = 'github'");
        const npmResult = this.db.exec("SELECT COUNT(*) as count FROM plugins WHERE source = 'npm'");
        const githubCount = githubResult.length > 0 && githubResult[0].values.length > 0
            ? Number(githubResult[0].values[0][0]) : 0;
        const npmCount = npmResult.length > 0 && npmResult[0].values.length > 0
            ? Number(npmResult[0].values[0][0]) : 0;
        const lastGithubSync = this.getLastSyncTime('github');
        const lastNpmSync = this.getLastSyncTime('npm');
        const sixHoursAgo = Date.now() - 6 * 60 * 60 * 1000;
        const isStale = !lastSync || new Date(lastSync).getTime() < sixHoursAgo;
        return {
            totalPlugins: total,
            lastSyncAt: lastSync || undefined,
            isStale,
            sourceStats: {
                github: { count: githubCount, lastSync: lastGithubSync || undefined },
                npm: { count: npmCount, lastSync: lastNpmSync || undefined },
            },
        };
    }
    // ---------- 工具方法 ----------
    rowToObject(columns, values) {
        const obj = {};
        for (let i = 0; i < columns.length; i++) {
            obj[columns[i]] = values[i];
        }
        return obj;
    }
    rowToPlugin(row) {
        return {
            id: row.id,
            source: row.source,
            name: row.name,
            description: row.description || '',
            category: row.category || 'other',
            author: row.author || '',
            url: row.url || '',
            stars: Number(row.stars) || 0,
            downloads: Number(row.downloads) || 0,
            version: row.version || '',
            license: row.license || '',
            language: row.language || '',
            topics: this.safeJsonParse(row.topics, []),
            keywords: this.safeJsonParse(row.keywords, []),
            readmeUrl: row.readme_url || undefined,
            installCmd: row.install_cmd || '',
            permissionLevel: row.permission_level || 'unknown',
            compatibility: row.compatibility || undefined,
            updatedAt: row.updated_at,
            cachedAt: row.cached_at,
            isInstalled: row.is_installed === 1 || row.is_installed === true,
            installedVersion: row.installed_version || undefined,
        };
    }
    safeJsonParse(str, fallback) {
        try {
            return JSON.parse(str);
        }
        catch {
            return fallback;
        }
    }
    close() {
        if (this.saveTimeout) {
            clearTimeout(this.saveTimeout);
            this.saveTimeout = null;
        }
        this.saveToFile();
        this.db.close();
    }
}
//# sourceMappingURL=cache.js.map