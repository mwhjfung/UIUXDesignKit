/**
 * Mock implementation of the Api seam. Delete this file at handoff once the
 * real implementation exists.
 */

import type { Api } from './api'
import type { Project, Task } from './types'
import fixtureTasks from './fixtures/tasks.json'

const LATENCY_MS = 250

function delay<T>(value: T): Promise<T> {
  return new Promise((resolveDelay) => setTimeout(() => resolveDelay(value), LATENCY_MS))
}

// Mutable copy so update calls behave realistically within a session.
const tasks: Task[] = (fixtureTasks as Task[]).map((t) => ({ ...t }))

export const mockApi: Api = {
  async listTasks(filter) {
    let result = tasks
    if (filter?.status) result = result.filter((t) => t.status === filter.status)
    if (filter?.project) result = result.filter((t) => t.project === filter.project)
    return delay(result.map((t) => ({ ...t })))
  },

  async getTask(id) {
    const task = tasks.find((t) => t.id === id)
    return delay(task ? { ...task } : null)
  },

  async updateTask(id, patch) {
    const task = tasks.find((t) => t.id === id)
    if (!task) throw new Error(`Task ${id} not found`)
    Object.assign(task, patch)
    return delay({ ...task })
  },

  async listProjects() {
    const byProject = new Map<string, number>()
    for (const t of tasks) byProject.set(t.project, (byProject.get(t.project) ?? 0) + 1)
    const projects: Project[] = [...byProject.entries()].map(([name, taskCount], i) => ({
      id: `p${i + 1}`,
      name,
      taskCount,
    }))
    return delay(projects)
  },
}
