import { join } from 'node:path'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { describe, expect, it, afterEach } from 'vitest'
import { inspectRepo, generateTemplate } from '../../src/manifest/link.js'

const FIXTURES = join(__dirname, '..', 'fixtures', 'link')

describe('inspectRepo', () => {
  it('detects a vendored-shadcn product app', () => {
    const report = inspectRepo(join(FIXTURES, 'vendored-app'))
    expect(report.candidates).toHaveLength(1)
    const c = report.candidates[0]
    expect(c.framework).toBe('react')
    expect(c.frameworkVersion).toBe('^18.3.0')
    expect(c.hasScreens).toBe(true)
    expect(c.vendoredUiDir).toBe('src/components/ui')
    expect(c.tokenFiles).toContain('src/styles/globals.css')
    expect(c.iconPackages).toEqual(['lucide-react'])
    expect(report.inferredRole).toBe('product')
    expect(report.suggestedStackName).toBe('vendored-app')
  })

  it('detects a standalone design-system repo', () => {
    const report = inspectRepo(join(FIXTURES, 'ds-repo'))
    const c = report.candidates[0]
    expect(c.framework).toBe('react')          // via peerDependencies
    expect(c.hasScreens).toBe(false)
    expect(c.vendoredUiDir).toBe('src/components/ui')
    expect(report.inferredRole).toBe('design-system')
  })

  it('lists every workspace candidate in a monorepo and stays ambiguous', () => {
    const report = inspectRepo(join(FIXTURES, 'monorepo'))
    const dirs = report.candidates.map((c) => c.dir).sort()
    expect(dirs).toEqual(['apps/web', 'packages/ds'])
    expect(report.inferredRole).toBeNull()
    const web = report.candidates.find((c) => c.dir === 'apps/web')!
    expect(web.hasScreens).toBe(true)
    expect(web.dsPackages).toContain('@acme/design-system')
  })

  it('throws a clear error for a path with no package.json anywhere', () => {
    expect(() => inspectRepo(join(FIXTURES, 'nope'))).toThrow(/package\.json/)
  })
})

/** Minimal chassis standing in for stack-templates/react-shadcn. */
function makeKitRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'pdk-link-'))
  const chassis = join(root, 'stack-templates', 'react-shadcn')
  mkdirSync(join(chassis, 'src', 'assets'), { recursive: true })
  mkdirSync(join(chassis, 'src', 'components', 'ui'), { recursive: true })
  mkdirSync(join(chassis, 'src', 'services'), { recursive: true })
  writeFileSync(
    join(chassis, 'package.json'),
    JSON.stringify(
      {
        name: 'react-shadcn-template',
        dependencies: { react: '^19.0.0', 'react-dom': '^19.0.0', 'lucide-react': '^0.500.0' },
        devDependencies: { '@pdk/core': 'file:../../pdk-core', vite: '^6.0.0' },
      },
      null,
      2,
    ),
  )
  writeFileSync(
    join(chassis, 'pdk.json'),
    JSON.stringify(
      { title: 'PROTOTYPE_TITLE', slug: 'PROTOTYPE_SLUG', description: 'PROTOTYPE_DESCRIPTION',
        author: 'PROTOTYPE_AUTHOR', status: 'draft', framework: 'react', library: 'shadcn',
        defaultPort: 'PROTOTYPE_PORT', tags: [] },
      null,
      2,
    ),
  )
  writeFileSync(join(chassis, 'index.html'), '<script src="http://localhost:5170/tooling/pdk-prelude.js" async></script>')
  writeFileSync(join(chassis, 'vite.config.ts'), 'export default {}')
  writeFileSync(join(chassis, 'src', 'assets', 'index.css'), '@import "tailwindcss";\n:root { --chassis: 1; }\n')
  writeFileSync(join(chassis, 'src', 'components', 'ui', 'button.tsx'), '// chassis button — must NOT survive when vendored ui is linked')
  writeFileSync(join(chassis, 'src', 'services', 'api.ts'), 'export const api = {}')
  mkdirSync(join(chassis, 'node_modules', 'junk'), { recursive: true })
  mkdirSync(join(chassis, 'manifest'), { recursive: true })
  writeFileSync(join(chassis, 'manifest', 'components.json'), '{"components":[]}')
  return root
}

let kitRoot: string | undefined
afterEach(() => {
  if (kitRoot) rmSync(kitRoot, { recursive: true, force: true })
  kitRoot = undefined
})

describe('generateTemplate', () => {
  it('builds a template from a single vendored product repo', () => {
    kitRoot = makeKitRoot()
    const report = inspectRepo(join(FIXTURES, 'vendored-app'))
    const result = generateTemplate({
      kitRoot,
      stackName: 'acme',
      inputs: [{ report, candidate: report.candidates[0], role: 'product' }],
    })
    const t = result.templateDir
    expect(result.chassis).toBe('react-shadcn')
    // chassis plumbing copied, junk excluded
    expect(existsSync(join(t, 'vite.config.ts'))).toBe(true)
    expect(existsSync(join(t, 'src', 'services', 'api.ts'))).toBe(true)
    expect(existsSync(join(t, 'node_modules'))).toBe(false)
    expect(existsSync(join(t, 'manifest'))).toBe(false)
    // linked vendored ui replaced the chassis copy
    const button = readFileSync(join(t, 'src', 'components', 'ui', 'button.tsx'), 'utf8')
    expect(button).toContain('buttonVariants')
    // linked tokens imported ahead of chassis css
    expect(readFileSync(join(t, 'src', 'assets', 'linked-tokens.css'), 'utf8')).toContain('--primary')
    expect(readFileSync(join(t, 'src', 'assets', 'index.css'), 'utf8')).toMatch(/^@import '\.\/linked-tokens\.css';/)
    // deps pinned from the linked repo where it declares them
    const pkg = JSON.parse(readFileSync(join(t, 'package.json'), 'utf8'))
    expect(pkg.name).toBe('acme-template')
    expect(pkg.dependencies.react).toBe('^18.3.0')
    expect(pkg.dependencies['lucide-react']).toBe('^0.400.0')
    expect(pkg.devDependencies['@pdk/core']).toBe('file:../../pdk-core')
    // pdk.json contract
    const pdk = JSON.parse(readFileSync(join(t, 'pdk.json'), 'utf8'))
    expect(pdk.framework).toBe('react')
    expect(pdk.library).toBe('acme')
    expect(pdk.designSystem).toEqual({
      type: 'local-cva',
      iconPackages: ['lucide-react'],
      tokenFiles: ['src/assets/linked-tokens.css', 'src/assets/index.css'],
    })
    expect(pdk.title).toBe('PROTOTYPE_TITLE')
  })

  it('merges DS repo (scan sources) with product repo (version pins)', () => {
    kitRoot = makeKitRoot()
    const ds = inspectRepo(join(FIXTURES, 'ds-repo'))
    const app = inspectRepo(join(FIXTURES, 'vendored-app'))
    const result = generateTemplate({
      kitRoot,
      stackName: 'acme',
      inputs: [
        { report: ds, candidate: ds.candidates[0], role: 'design-system' },
        { report: app, candidate: app.candidates[0], role: 'product' },
      ],
    })
    const t = result.templateDir
    // vendored ui came from the DS repo, not the product repo
    expect(existsSync(join(t, 'src', 'components', 'ui', 'badge.tsx'))).toBe(true)
    expect(existsSync(join(t, 'src', 'components', 'ui', 'button.tsx'))).toBe(false)
    // tokens came from the DS repo
    expect(readFileSync(join(t, 'src', 'assets', 'linked-tokens.css'), 'utf8')).toContain('--secondary')
    // versions came from the product repo
    const pkg = JSON.parse(readFileSync(join(t, 'package.json'), 'utf8'))
    expect(pkg.dependencies.react).toBe('^18.3.0')
  })

  it('refuses an existing template dir', () => {
    kitRoot = makeKitRoot()
    const report = inspectRepo(join(FIXTURES, 'vendored-app'))
    const inputs = [{ report, candidate: report.candidates[0], role: 'product' as const }]
    generateTemplate({ kitRoot, stackName: 'acme', inputs })
    expect(() => generateTemplate({ kitRoot, stackName: 'acme', inputs })).toThrow(/already exists/)
  })

  it('refuses an unsupported framework', () => {
    kitRoot = makeKitRoot()
    const report = inspectRepo(join(FIXTURES, 'vendored-app'))
    const candidate = { ...report.candidates[0], framework: null }
    expect(() =>
      generateTemplate({ kitRoot, stackName: 'x', inputs: [{ report, candidate, role: 'product' }] }),
    ).toThrow(/React or Vue/)
  })
})
