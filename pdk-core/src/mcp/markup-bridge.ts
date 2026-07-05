import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import { getStatus, getAnnotations, resolveAnnotation } from './markup-tools.js'

const server = new Server(
  { name: 'markup', version: '1.0.0' },
  { capabilities: { tools: {} } },
)

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'markup_get_status',
      description:
        'Check if the Markup dev server is running and how many annotations are pending. Call this first to orient yourself.',
      inputSchema: { type: 'object' as const, properties: {}, required: [] },
    },
    {
      name: 'markup_get_annotations',
      description:
        'Get all pending annotations from the active Markup session. Each annotation includes CSS selector, element path, Vue component name, user comment, and position.',
      inputSchema: { type: 'object' as const, properties: {}, required: [] },
    },
    {
      name: 'markup_resolve_annotation',
      description:
        'Mark an annotation as resolved. The visual marker disappears from the browser. Call this after successfully addressing each piece of feedback.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          id: { type: 'string', description: 'The annotation ID to resolve' },
        },
        required: ['id'],
      },
    },
  ],
}))

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params

  if (name === 'markup_get_status') {
    const result = await getStatus()
    return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] }
  }

  if (name === 'markup_get_annotations') {
    const result = await getAnnotations()
    return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] }
  }

  if (name === 'markup_resolve_annotation') {
    const { id } = args as { id: string }
    const result = await resolveAnnotation(id)
    return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] }
  }

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify({ error: `Unknown tool: ${name}` }),
      },
    ],
  }
})

const transport = new StdioServerTransport()
server.connect(transport).catch(console.error)
