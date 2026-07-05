import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { inspectRepo } from '../../src/manifest/link.js'

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
