/**
 * The service seam between UI and data.
 *
 * The UI only ever imports `api` from this file. During prototyping it is
 * backed by `api.mock.ts` (fixtures + latency). To ship: implement this
 * interface against real endpoints and swap the export — no UI changes.
 */

import type { Project, Task } from './types'
import { mockApi } from './api.mock'

export interface Api {
  listTasks(filter?: { status?: Task['status']; project?: string }): Promise<Task[]>
  getTask(id: string): Promise<Task | null>
  updateTask(id: string, patch: Partial<Omit<Task, 'id'>>): Promise<Task>
  listProjects(): Promise<Project[]>
}

export const api: Api = mockApi
