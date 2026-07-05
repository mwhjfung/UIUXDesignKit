/**
 * Domain types for this prototype.
 *
 * Replace the example Task/Project domain with your own. Keep every type the
 * UI consumes in this file — the /handoff skill derives the developer's
 * endpoint checklist from these contracts.
 */

export type TaskStatus = 'todo' | 'in-progress' | 'blocked' | 'done'
export type TaskPriority = 'low' | 'medium' | 'high'

export interface Task {
  id: string
  title: string
  status: TaskStatus
  priority: TaskPriority
  assignee: string | null
  project: string
  dueDate: string | null
  createdAt: string
}

export interface Project {
  id: string
  name: string
  taskCount: number
}
