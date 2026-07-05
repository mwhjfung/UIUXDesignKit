/**
 * Catalogue dev-server plugins.
 *
 * serveTooling()  — serves the PDK browser tooling under /tooling/* so any
 *                   prototype (any port, any framework) can load it via
 *                   tooling/pdk-prelude.js.
 * prototypesApi() — the scaffolding API behind the catalogue UI:
 *                     GET  /__api/prototypes       list prototypes
 *                     GET  /__api/stacks           list stack templates
 *                     POST /__api/create-prototype copy a stack template
 *                     POST /__api/remix-prototype  copy an existing prototype
 *
 * Scaffolding is a directory-tree copy of a stack template (or an existing
 * prototype, for remix) with placeholder-token substitution and automatic
 * port assignment.
 */
import { cpSync, existsSync, readdirSync, readFileSync, writeFileSync, } from 'node:fs';
import { extname, join, resolve } from 'node:path';
const repoRoot = resolve(__dirname, '..');
const prototypesDir = join(repoRoot, 'prototypes');
const stackTemplatesDir = join(repoRoot, 'stack-templates');
const COPY_EXCLUDES = new Set(['node_modules', 'dist', '.git', 'package-lock.json']);
const TEXT_EXTENSIONS = new Set(['.json', '.ts', '.tsx', '.vue', '.html', '.md', '.css', '.js', '.svg']);
const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;
function json(res, status, body) {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(body));
}
function readBody(req) {
    return new Promise((resolveBody) => {
        let body = '';
        req.on('data', (chunk) => {
            body += chunk.toString();
        });
        req.on('end', () => resolveBody(body));
    });
}
function readPdkJson(dir) {
    const path = join(dir, 'pdk.json');
    if (!existsSync(path))
        return null;
    try {
        return JSON.parse(readFileSync(path, 'utf8'));
    }
    catch {
        return null;
    }
}
function usedPorts() {
    const used = new Set([5170]);
    if (!existsSync(prototypesDir))
        return used;
    for (const entry of readdirSync(prototypesDir)) {
        const pdk = readPdkJson(join(prototypesDir, entry));
        const port = Number(pdk?.defaultPort);
        if (Number.isInteger(port))
            used.add(port);
    }
    return used;
}
function nextFreePort() {
    const used = usedPorts();
    let port = 5171;
    while (used.has(port))
        port++;
    return port;
}
/** Recursively copy, excluding heavy dirs, replacing placeholder tokens in text files. */
function copyWithTokens(srcDir, destDir, tokens) {
    cpSync(srcDir, destDir, {
        recursive: true,
        filter: (src) => {
            const base = src.split('/').pop() ?? '';
            return !COPY_EXCLUDES.has(base);
        },
    });
    // Second pass: token replacement in text files.
    const walk = (dir) => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            const full = join(dir, entry.name);
            if (entry.isDirectory()) {
                walk(full);
            }
            else if (TEXT_EXTENSIONS.has(extname(entry.name))) {
                let content = readFileSync(full, 'utf8');
                // Quoted port first so JSON keeps a numeric value.
                content = content.replaceAll('"PROTOTYPE_PORT"', tokens.PROTOTYPE_PORT);
                for (const [token, value] of Object.entries(tokens)) {
                    content = content.replaceAll(token, value);
                }
                writeFileSync(full, content);
            }
        }
    };
    walk(destDir);
}
function titleFromSlug(slug) {
    return slug
        .split('-')
        .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
        .join(' ');
}
export function serveTooling() {
    const sources = {
        '/pdk-prelude.js': join(repoRoot, 'tooling', 'pdk-prelude.js'),
        '/pdk-tools.js': join(repoRoot, 'pdk-core', 'dist', 'tooling', 'pdk-tools.js'),
    };
    return {
        name: 'pdk-serve-tooling',
        apply: 'serve',
        configureServer(server) {
            server.middlewares.use('/tooling', (req, res, next) => {
                const path = sources[(req.url ?? '').split('?')[0]];
                if (!path)
                    return next();
                res.setHeader('Access-Control-Allow-Origin', '*');
                if (!existsSync(path)) {
                    res.statusCode = 404;
                    res.setHeader('Content-Type', 'application/javascript');
                    res.end(`console.warn('[pdk] ${req.url} is not built yet - run: npm run build:tools');`);
                    return;
                }
                res.setHeader('Content-Type', 'application/javascript');
                res.end(readFileSync(path));
            });
        },
    };
}
export function prototypesApi() {
    return {
        name: 'pdk-prototypes-api',
        apply: 'serve',
        configureServer(server) {
            server.middlewares.use('/__api/prototypes', (req, res) => {
                if (req.method !== 'GET')
                    return json(res, 405, { error: 'Method not allowed' });
                const list = existsSync(prototypesDir)
                    ? readdirSync(prototypesDir, { withFileTypes: true })
                        .filter((e) => e.isDirectory())
                        .map((e) => {
                        const pdk = readPdkJson(join(prototypesDir, e.name));
                        return pdk ? { folder: e.name, ...pdk } : null;
                    })
                        .filter((p) => p !== null)
                    : [];
                json(res, 200, { prototypes: list });
            });
            server.middlewares.use('/__api/stacks', (req, res) => {
                if (req.method !== 'GET')
                    return json(res, 405, { error: 'Method not allowed' });
                const stacks = readdirSync(stackTemplatesDir, { withFileTypes: true })
                    .filter((e) => e.isDirectory())
                    .map((e) => {
                    const pdk = readPdkJson(join(stackTemplatesDir, e.name));
                    return pdk
                        ? {
                            name: e.name,
                            framework: pdk.framework ?? 'unknown',
                            library: pdk.library ?? 'unknown',
                            hasManifest: existsSync(join(stackTemplatesDir, e.name, 'manifest')),
                        }
                        : null;
                })
                    .filter((s) => s !== null);
                json(res, 200, { stacks });
            });
            server.middlewares.use('/__api/create-prototype', async (req, res) => {
                if (req.method !== 'POST')
                    return json(res, 405, { error: 'Method not allowed' });
                try {
                    const { stack, name, description, author } = JSON.parse(await readBody(req));
                    if (!SLUG_RE.test(name ?? '')) {
                        return json(res, 400, {
                            error: 'Name must be kebab-case: lowercase letters, digits, and dashes.',
                        });
                    }
                    const templateDir = join(stackTemplatesDir, stack ?? '');
                    if (!existsSync(templateDir)) {
                        return json(res, 400, { error: `Stack template "${stack}" not found.` });
                    }
                    const targetDir = join(prototypesDir, name);
                    if (existsSync(targetDir)) {
                        return json(res, 409, { error: `A prototype named "${name}" already exists.` });
                    }
                    const port = nextFreePort();
                    copyWithTokens(templateDir, targetDir, {
                        PROTOTYPE_TITLE: titleFromSlug(name),
                        PROTOTYPE_SLUG: name,
                        PROTOTYPE_DESCRIPTION: description?.trim() || `Prototype scaffolded from ${stack}.`,
                        PROTOTYPE_AUTHOR: author?.trim() || 'unknown',
                        PROTOTYPE_PORT: String(port),
                    });
                    // Stamp identity the tokens can't express.
                    const pdkPath = join(targetDir, 'pdk.json');
                    const pdk = JSON.parse(readFileSync(pdkPath, 'utf8'));
                    pdk.stack = stack;
                    pdk.created = new Date().toISOString().slice(0, 10);
                    writeFileSync(pdkPath, JSON.stringify(pdk, null, 2) + '\n');
                    json(res, 201, { slug: name, port });
                }
                catch (e) {
                    json(res, 500, { error: e instanceof Error ? e.message : 'Unknown error' });
                }
            });
            server.middlewares.use('/__api/remix-prototype', async (req, res) => {
                if (req.method !== 'POST')
                    return json(res, 405, { error: 'Method not allowed' });
                try {
                    const { source, name, author } = JSON.parse(await readBody(req));
                    if (!SLUG_RE.test(name ?? '')) {
                        return json(res, 400, {
                            error: 'Name must be kebab-case: lowercase letters, digits, and dashes.',
                        });
                    }
                    const sourceDir = join(prototypesDir, source ?? '');
                    const sourcePdk = readPdkJson(sourceDir);
                    if (!sourcePdk) {
                        return json(res, 400, { error: `Source prototype "${source}" not found.` });
                    }
                    const targetDir = join(prototypesDir, name);
                    if (existsSync(targetDir)) {
                        return json(res, 409, { error: `A prototype named "${name}" already exists.` });
                    }
                    const port = nextFreePort();
                    const oldPort = Number(sourcePdk.defaultPort);
                    copyWithTokens(sourceDir, targetDir, {});
                    const pdkPath = join(targetDir, 'pdk.json');
                    const pdk = JSON.parse(readFileSync(pdkPath, 'utf8'));
                    pdk.title = titleFromSlug(name);
                    pdk.slug = name;
                    pdk.author = author?.trim() || pdk.author;
                    pdk.parent = source;
                    pdk.created = new Date().toISOString().slice(0, 10);
                    pdk.defaultPort = port;
                    pdk.status = 'draft';
                    writeFileSync(pdkPath, JSON.stringify(pdk, null, 2) + '\n');
                    const pkgPath = join(targetDir, 'package.json');
                    if (existsSync(pkgPath)) {
                        const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
                        pkg.name = `pdk-prototype-${name}`;
                        for (const script of ['dev', 'preview']) {
                            if (typeof pkg.scripts?.[script] === 'string' && Number.isInteger(oldPort)) {
                                pkg.scripts[script] = pkg.scripts[script].replaceAll(String(oldPort), String(port));
                            }
                        }
                        writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
                    }
                    json(res, 201, { slug: name, port });
                }
                catch (e) {
                    json(res, 500, { error: e instanceof Error ? e.message : 'Unknown error' });
                }
            });
        },
    };
}
