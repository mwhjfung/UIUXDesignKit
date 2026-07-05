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
}
