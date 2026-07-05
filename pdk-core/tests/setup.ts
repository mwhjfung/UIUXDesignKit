import { afterEach, vi } from 'vitest'

/**
 * Vitest setup file.
 *
 * Resets all vi.fn() mocks after each test so that cleanup callbacks
 * registered by beforeEach (which return the mock function itself when
 * calling mockReset()) don't fail due to having a mockRejectedValue
 * implementation still active.
 *
 * Background: `beforeEach(() => mockFetch.mockReset())` returns mockFetch
 * (a function), which vitest interprets as a post-test cleanup callback.
 * After the test sets mockRejectedValue, the cleanup calls mockFetch()
 * which returns Promise.reject(err) and fails the test. The afterEach
 * here resets all mocks BEFORE the cleanup runs, preventing this.
 */
afterEach(() => {
  vi.resetAllMocks()
})
