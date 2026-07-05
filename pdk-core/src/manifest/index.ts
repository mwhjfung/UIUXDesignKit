export * from './schema/types.js'
export {
  validateComponents,
  validateTokens,
  validateIcons,
  type ValidationResult,
} from './schema/validate.js'
export { getManifest, manifestDir, isStubMd, ManifestError, type ReadOptions } from './read.js'
export {
  scaffoldManifest,
  stackConfig,
  type ScaffoldReport,
  type StackConfig,
  type DesignSystemConfig,
} from './scaffold.js'
export { syncManifest, diffComponents, findStaleReferences, type SyncReport } from './sync.js'
export {
  inspectRepo,
  generateTemplate,
  attachRepo,
  linkedRepos,
  syncLink,
  gitHead,
} from './link.js'
export type {
  RepoRole,
  AppCandidate,
  RepoReport,
  LinkInput,
  GenerateResult,
  LinkedRepo,
  LinkSyncEntry,
} from './link.js'
