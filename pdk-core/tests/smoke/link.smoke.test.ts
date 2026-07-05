/**
 * End-to-end: inspect fixture repo → attach (generates template) →
 * scaffoldManifest scans the copied vendored ui. Proves the link path feeds
 * the existing scanner unchanged.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { scaffoldManifest } from '../../src/manifest/scaffold.js'

const FIXTURES = join(__dirname, '..', 'fixtures', 'link')
const CLI = join(__dirname, '..', '..', 'src', 'manifest', 'link.ts')

const kitRoot = mkdtempSync(join(tmpdir(), 'pdk-link-smoke-'))
afterAll(() => rmSync(kitRoot, { recursive: true, force: true }))

function run(args: string[]): string {
  return execFileSync('npx', ['tsx', CLI, ...args], { encoding: 'utf8' })
}

describe('link CLI end-to-end', () => {
  it('inspect prints a RepoReport', () => {
    const out = JSON.parse(run(['inspect', join(FIXTURES, 'vendored-app')]))
    expect(out.inferredRole).toBe('product')
    expect(out.candidates[0].vendoredUiDir).toBe('src/components/ui')
  })

  it('attach generates the template and the scanner finds the linked components', async () => {
    // Minimal chassis (same shape as the unit-test helper — repeated here so
    // the smoke file stands alone).
    const chassis = join(kitRoot, 'stack-templates', 'react-shadcn')
    mkdirSync(join(chassis, 'src', 'assets'), { recursive: true })
    mkdirSync(join(chassis, 'src', 'components', 'ui'), { recursive: true })
    writeFileSync(join(chassis, 'package.json'), JSON.stringify({ name: 'chassis', dependencies: { react: '^19.0.0' } }))
    writeFileSync(join(chassis, 'pdk.json'), JSON.stringify({ title: 'PROTOTYPE_TITLE', slug: 'PROTOTYPE_SLUG', framework: 'react', library: 'shadcn', defaultPort: 'PROTOTYPE_PORT' }))
    writeFileSync(join(chassis, 'src', 'assets', 'index.css'), ':root { --chassis: 1; }\n')
    writeFileSync(join(chassis, 'index.html'), '<html></html>')

    const out = JSON.parse(
      run(['attach', 'acme', '--repo', join(FIXTURES, 'vendored-app'), '--role', 'product', '--root', kitRoot]),
    )
    expect(out.created).toBe(true)
    expect(existsSync(join(kitRoot, 'stack-templates', 'acme', 'pdk.json'))).toBe(true)

    const report = await scaffoldManifest('acme', { root: kitRoot })
    expect(report.componentCount).toBeGreaterThanOrEqual(1)   // Button from the fixture
    const components = JSON.parse(
      readFileSync(join(kitRoot, 'stack-templates', 'acme', 'manifest', 'components.json'), 'utf8'),
    )
    expect(components.components.map((c: any) => c.name)).toContain('Button')
  })

  it('attach refuses to link into a chassis template', () => {
    expect(() =>
      run(['attach', 'react-shadcn', '--repo', join(FIXTURES, 'vendored-app'), '--role', 'product', '--root', kitRoot]),
    ).toThrow(/not link-managed|chassis/i)
  })
})
