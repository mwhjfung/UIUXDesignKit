import { MoreHorizontal, Plus, Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { api } from '@/services/api'
import type { Task, TaskStatus } from '@/services/types'

const STATUS_LABEL: Record<TaskStatus, string> = {
  'todo': 'To do',
  'in-progress': 'In progress',
  'blocked': 'Blocked',
  'done': 'Done',
}

function StatusBadge({ status }: { status: TaskStatus }) {
  const variant =
    status === 'blocked' ? 'destructive' : status === 'done' ? 'outline' : 'secondary'
  return <Badge variant={variant}>{STATUS_LABEL[status]}</Badge>
}

function formatDue(dueDate: string | null): string {
  if (!dueDate) return '—'
  return new Date(dueDate).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export default function App() {
  const [tasks, setTasks] = useState<Task[] | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | TaskStatus>('all')
  const [selected, setSelected] = useState<Task | null>(null)

  useEffect(() => {
    api.listTasks().then(setTasks)
  }, [])

  const visible = useMemo(() => {
    if (!tasks) return []
    return tasks.filter((t) => {
      if (statusFilter !== 'all' && t.status !== statusFilter) return false
      if (search && !t.title.toLowerCase().includes(search.toLowerCase())) return false
      return true
    })
  }, [tasks, search, statusFilter])

  async function markDone(task: Task): Promise<void> {
    const updated = await api.updateTask(task.id, { status: 'done' })
    setTasks((prev) => prev?.map((t) => (t.id === updated.id ? updated : t)) ?? null)
    setSelected((prev) => (prev?.id === updated.id ? updated : prev))
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto px-6 py-8 space-y-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tasks</h1>
          <p className="text-muted-foreground">
            Everything your team is working on, in one place.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative max-w-xs w-full">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Search tasks…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v as 'all' | TaskStatus)}
          >
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {(Object.keys(STATUS_LABEL) as TaskStatus[]).map((s) => (
                <SelectItem key={s} value={s}>
                  {STATUS_LABEL[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="ml-auto">
            <Button>
              <Plus /> New task
            </Button>
          </div>
        </div>

        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Assignee</TableHead>
                <TableHead>Project</TableHead>
                <TableHead className="text-right">Due</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {tasks === null ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                    Loading tasks…
                  </TableCell>
                </TableRow>
              ) : visible.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                    No tasks match. Clear the search or filters to see everything.
                  </TableCell>
                </TableRow>
              ) : (
                visible.map((task) => (
                  <TableRow
                    key={task.id}
                    className="cursor-pointer"
                    onClick={() => setSelected(task)}
                  >
                    <TableCell className="font-medium">{task.title}</TableCell>
                    <TableCell>
                      <StatusBadge status={task.status} />
                    </TableCell>
                    <TableCell className={task.assignee ? '' : 'text-muted-foreground'}>
                      {task.assignee ?? 'Unassigned'}
                    </TableCell>
                    <TableCell>{task.project}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatDue(task.dueDate)}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" aria-label="Task actions">
                            <MoreHorizontal />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setSelected(task)}>
                            View details
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={task.status === 'done'}
                            onClick={() => void markDone(task)}
                          >
                            Mark done
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <Sheet open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
          <SheetContent className="sm:max-w-lg">
            {selected && (
              <>
                <SheetHeader>
                  <SheetTitle>{selected.title}</SheetTitle>
                  <SheetDescription>
                    {selected.project} · created{' '}
                    {new Date(selected.createdAt).toLocaleDateString()}
                  </SheetDescription>
                </SheetHeader>
                <div className="grid grid-cols-2 gap-x-4 gap-y-5 px-4 text-sm">
                  <div>
                    <p className="text-muted-foreground mb-1">Status</p>
                    <StatusBadge status={selected.status} />
                  </div>
                  <div>
                    <p className="text-muted-foreground mb-1">Priority</p>
                    <p className="capitalize">{selected.priority}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground mb-1">Assignee</p>
                    <p>{selected.assignee ?? 'Unassigned'}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground mb-1">Due</p>
                    <p className="tabular-nums">{formatDue(selected.dueDate)}</p>
                  </div>
                </div>
                <div className="px-4 pt-2">
                  <Button
                    disabled={selected.status === 'done'}
                    onClick={() => void markDone(selected)}
                  >
                    Mark done
                  </Button>
                </div>
              </>
            )}
          </SheetContent>
        </Sheet>
      </div>
    </div>
  )
}
