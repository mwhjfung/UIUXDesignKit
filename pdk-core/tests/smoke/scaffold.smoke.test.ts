/**
 * Scaffolder smoke tests against the real stack templates.
 *
 * Slow and dependent on `npm install` having run in each template — excluded
 * from the default `npm test` run; execute with `npm run test:smoke`.
 * Per the manifest design spec these gate releases: they catch scanner
 * regressions against real design systems that mocks cannot.
 */

import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { getManifest } from '../../src/manifest/read.js'
import { scaffoldManifest } from '../../src/manifest/scaffold.js'

const root = resolve(__dirname, '../../..')

function installed(stack: string): boolean {
  return existsSync(join(root, 'stack-templates', stack, 'node_modules'))
}

describe('scaffolder smoke', () => {
  it.skipIf(!installed('vue-shadcn'))('vue-shadcn: cva + tokens + lucide', async () => {
    const report = await scaffoldManifest('vue-shadcn', { root })
    expect(report.componentCount).toBeGreaterThanOrEqual(1)
    expect(report.tokenCount).toBeGreaterThanOrEqual(30)
    expect(report.iconCount).toBeGreaterThanOrEqual(1000)
    const m = getManifest('vue-shadcn', { root })
    const button = m.components.components.find((c) => c.name === 'Button')
    expect(button?.props.find((p) => p.name === 'variant')?.options).toContain('destructive')
    expect(m.tokens.tokens.some((t) => t.name === '--primary')).toBe(true)
  })

  it.skipIf(!installed('react-shadcn'))('react-shadcn: cva + tokens + lucide', async () => {
    const report = await scaffoldManifest('react-shadcn', { root })
    expect(report.componentCount).toBeGreaterThanOrEqual(10)
    expect(report.tokenCount).toBeGreaterThanOrEqual(30)
    expect(report.iconCount).toBeGreaterThanOrEqual(1000)
    const m = getManifest('react-shadcn', { root })
    const button = m.components.components.find((c) => c.name === 'Button')
    expect(button?.detect?.dataSlot).toBe('button')
    expect(button?.props.find((p) => p.name === 'variant')?.type).toBe('select')
  })

  it.skipIf(!installed('react-material'))('react-material: MUI type scan', async () => {
    const report = await scaffoldManifest('react-material', { root })
    expect(report.componentCount).toBeGreaterThanOrEqual(100)
    expect(report.iconCount).toBeGreaterThanOrEqual(5000)
    const m = getManifest('react-material', { root })
    const button = m.components.components.find((c) => c.name === 'Button')
    expect(button?.props.find((p) => p.name === 'color')?.options).toContain('primary')
  })

  it.skipIf(!installed('react-atlaskit'))('react-atlaskit: default-export scan', async () => {
    const report = await scaffoldManifest('react-atlaskit', { root })
    expect(report.componentCount).toBeGreaterThanOrEqual(4)
    const m = getManifest('react-atlaskit', { root })
    expect(m.components.components.some((c) => c.name === 'Button')).toBe(true)
  })
})
