export interface PrototypeInfo {
  folder: string
  title: string
  slug: string
  description: string
  author: string
  status: string
  framework: string
  library: string
  stack?: string
  parent?: string
  created?: string
  defaultPort: number | string
  tags?: string[]
}

export interface StackInfo {
  name: string
  framework: string
  library: string
  hasManifest: boolean
  productRepo?: { path: string; appDir: string }
}

export interface ScreenOption {
  repoPath: string
  appDir: string
  file: string
  name: string
  stack: string
}

export interface CatalogueRequest {
  id: string
  type: 'import-screen' | 'handoff'
  status: 'pending' | 'in-progress' | 'done' | 'failed'
  createdAt: string
  updatedAt: string
  note?: string
  screen?: { repoPath: string; appDir: string; file: string; title: string; stack: string }
  handoff?: { slug: string; targetRepo: string; targetSubdir?: string }
}
