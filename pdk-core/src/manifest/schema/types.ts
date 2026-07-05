/**
 * Design-system manifest schema.
 *
 * A manifest is a per-stack-template "cheat sheet" the kit reads to be useful
 * with any design system. Scannable knowledge lives in three JSON files
 * (components, tokens, icons); tacit knowledge lives in three curated
 * markdown files (patterns, rules, voice).
 */

export type PropFieldType = 'string' | 'boolean' | 'number' | 'select'

export interface PropField {
  /** Prop name as written in source (camelCase for JSX, kebab allowed for SFC). */
  name: string
  /** Human label shown in the Tweaker panel. */
  label: string
  type: PropFieldType
  /** Legal values — required when type is 'select'. */
  options?: string[]
  /** Default value when the prop is omitted, if known. */
  default?: string | number | boolean
}

export interface DetectHints {
  /** shadcn-style `data-slot` attribute value emitted by the component. */
  dataSlot?: string
  /** Host tag name the component renders to, e.g. 'button'. */
  tag?: string
  /** A class name reliably present on the rendered root element. */
  classHint?: string
}

export interface ComponentEntry {
  /** Exported component name, e.g. 'Button'. */
  name: string
  /** Import specifier prototypes should use, e.g. '@/components/ui/button'. */
  importPath: string
  /** Hints for locating rendered instances in the DOM. */
  detect?: DetectHints
  props: PropField[]
  /** Whether the component accepts children/slot content. */
  hasChildren?: boolean
  /** Free-form usage note surfaced to skills (gotchas, pairing rules). */
  note?: string
}

export interface ComponentsManifest {
  $schema?: string
  components: ComponentEntry[]
}

export type TokenCategory =
  | 'color'
  | 'spacing'
  | 'typography'
  | 'radius'
  | 'shadow'
  | 'motion'
  | 'other'

export interface TokenEntry {
  /** Token name as addressable in code, e.g. '--primary' or 'spacing.4'. */
  name: string
  value: string
  category: TokenCategory
  /** Where the token was discovered (file path relative to the template). */
  source?: string
}

export interface TokensManifest {
  $schema?: string
  tokens: TokenEntry[]
}

export interface IconsManifest {
  $schema?: string
  /** npm package (or local path) the icons come from, e.g. 'lucide-react'. */
  pack?: string
  /** Exported icon names, e.g. 'ArrowRight'. */
  icons: string[]
}

/** Written by the scaffolder; read by /sync-manifest to detect drift. */
export interface ManifestMeta {
  stack: string
  scaffoldedAt: string
  /** Design-system package versions at scaffold time, e.g. {"lucide-react": "0.460.0"}. */
  packages: Record<string, string>
}

export interface Manifest {
  stack: string
  components: ComponentsManifest
  tokens: TokensManifest
  icons: IconsManifest
  meta: ManifestMeta | null
  /** Curated markdown bodies; empty string when the file is a stub or missing. */
  patterns: string
  rules: string
  voice: string
}

/** The three JSON files every manifest directory must contain. */
export const MANIFEST_JSON_FILES = ['components.json', 'tokens.json', 'icons.json'] as const

/** The three curated markdown files. */
export const MANIFEST_MD_FILES = ['patterns.md', 'rules.md', 'voice.md'] as const
