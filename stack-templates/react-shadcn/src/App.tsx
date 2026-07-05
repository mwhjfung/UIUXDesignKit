import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { api } from '@/services/api'
import type { Task } from '@/services/types'

export default function App() {
  const [tasks, setTasks] = useState<Task[]>([])

  useEffect(() => {
    api.listTasks().then(setTasks)
  }, [])

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto px-6 py-8">
        <h1 className="text-2xl font-semibold tracking-tight mb-2">PROTOTYPE_TITLE</h1>
        <p className="text-muted-foreground mb-8">PROTOTYPE_DESCRIPTION</p>
        <div className="flex gap-2 flex-wrap mb-8">
          <Button>Primary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
        </div>
        <p className="text-sm text-muted-foreground">
          {tasks.length > 0
            ? `Mock service layer connected — ${tasks.length} tasks loaded.`
            : 'Loading mock data…'}
        </p>
      </div>
    </div>
  )
}
