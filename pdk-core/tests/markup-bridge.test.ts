import { describe, it, expect, vi, beforeEach } from 'vitest'

// Must stub fetch BEFORE importing the module so the stub is in place at module load
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// Pin discovery to a single deterministic endpoint; without this the tools
// would scan prototypes/*/pdk.json for candidate ports.
process.env.MARKUP_PORT = '5173'

const { getStatus, getAnnotations, resolveAnnotation } = await import('../src/mcp/markup-tools')

describe('markup_get_status', () => {
  beforeEach(() => mockFetch.mockReset())

  it('returns not running when server is unreachable', async () => {
    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'))
    const result = await getStatus()
    expect(result).toEqual({ running: false, sessionId: null, pendingCount: 0, hasPendingAction: false })
  })

  it('returns running=true with pending count from lastAction', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => [
        {
          id: 'session-1',
          url: 'http://localhost:5173/prototypes/test',
          annotations: [],
          lastAction: {
            output: '## Feedback',
            annotations: [
              { id: 'a1', status: 'pending' },
              { id: 'a2', status: 'pending' },
            ],
            timestamp: Date.now(),
          },
        },
      ],
    })
    const result = await getStatus()
    expect(result).toEqual({ running: true, sessionId: 'session-1', pendingCount: 2, hasPendingAction: true })
  })

  it('returns hasPendingAction=false when no lastAction', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => [
        {
          id: 'session-1',
          url: 'http://localhost:5173/prototypes/test',
          annotations: [{ id: 'a1', status: 'pending' }],
          lastAction: null,
        },
      ],
    })
    const result = await getStatus()
    expect(result).toMatchObject({ running: true, pendingCount: 0, hasPendingAction: false })
  })
})

describe('markup_get_annotations', () => {
  beforeEach(() => mockFetch.mockReset())

  it('returns error object when server is unreachable', async () => {
    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'))
    const result = await getAnnotations()
    expect(result).toMatchObject({ error: expect.stringContaining('not running') })
  })

  it('returns empty annotations when no sessions exist', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => [] })
    const result = await getAnnotations()
    expect(result).toMatchObject({ annotations: [], sessionUrl: '' })
  })

  it('returns annotations from lastAction snapshot', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => [
        {
          id: 'session-1',
          url: 'http://localhost:5173/prototypes/test',
          annotations: [],
          lastAction: {
            output: '## Feedback',
            annotations: [{ id: 'a1', comment: 'Fix button', status: 'pending' }],
            timestamp: Date.now(),
          },
        },
      ],
    })
    const result = await getAnnotations()
    expect(result).toMatchObject({
      annotations: [{ id: 'a1', comment: 'Fix button' }],
      sessionUrl: 'http://localhost:5173/prototypes/test',
    })
  })

  it('returns empty when session exists but no lastAction', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => [
        {
          id: 'session-1',
          url: 'http://localhost:5173/prototypes/test',
          annotations: [{ id: 'a1', comment: 'Fix button', status: 'pending' }],
          lastAction: null,
        },
      ],
    })
    const result = await getAnnotations()
    expect(result).toMatchObject({ annotations: [], sessionUrl: 'http://localhost:5173/prototypes/test' })
  })
})

describe('markup_resolve_annotation', () => {
  beforeEach(() => mockFetch.mockReset())

  it('returns error when server is unreachable', async () => {
    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'))
    const result = await resolveAnnotation('a1')
    expect(result).toMatchObject({ error: expect.any(String) })
  })

  it('PATCHes the annotation and returns success', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'a1', status: 'resolved' }),
    })
    const result = await resolveAnnotation('a1')
    expect(result).toEqual({ success: true, id: 'a1' })
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:5173/markup/annotations/a1',
      expect.objectContaining({ method: 'PATCH' }),
    )
  })
})
