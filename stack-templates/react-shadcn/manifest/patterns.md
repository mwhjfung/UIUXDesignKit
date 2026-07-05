# Page patterns

Copy-pasteable layout patterns for React + shadcn/ui prototypes. Component
names below are the exact exports from `components.json`.

## List page (filter + table)

Toolbar above the table: search `Input` on the left, filter `Select`s in the
middle, primary action `Button` on the right. Table fills the content width.

```tsx
<div className="space-y-4">
  <div className="flex items-center gap-2">
    <Input placeholder="Search tasks…" className="max-w-xs" />
    <Select>{/* status filter */}</Select>
    <div className="ml-auto">
      <Button>New task</Button>
    </div>
  </div>
  <div className="rounded-lg border">
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Title</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Due</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>{/* rows */}</TableBody>
    </Table>
  </div>
</div>
```

Row status renders as a `Badge` (`variant="secondary"` for neutral states,
`variant="destructive"` for blocked/error). Row actions go in a
`DropdownMenu` triggered by a ghost icon `Button` in the last cell.

## Record detail

Master–detail: clicking a row opens a `Sheet` (`side="right"`) with the
record. Use `Dialog` only for confirmations and small focused edits, never
for full records.

```tsx
<Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
  <SheetContent className="sm:max-w-lg">
    <SheetHeader>
      <SheetTitle>{selected?.title}</SheetTitle>
      <SheetDescription>{/* one-line summary */}</SheetDescription>
    </SheetHeader>
    {/* field groups: <Label> + value pairs in a two-column grid */}
  </SheetContent>
</Sheet>
```

## Form

Single column, max width `max-w-lg`. `Label` above control, 6-unit vertical
rhythm (`space-y-6` between fields). Primary `Button` bottom-left,
`variant="ghost"` cancel beside it. Required fields are the default — mark
optional ones in the label ("Notes (optional)"), not the other way round.

## Dashboard

`grid gap-4 md:grid-cols-2 lg:grid-cols-4` of `Card`s. KPI card anatomy:
`CardHeader` with `CardDescription` (metric name) + `CardTitle` (value),
optional trend line in `CardContent`. Full-width chart cards span with
`className="col-span-full"`.

## Empty / loading / error states

- Empty: centered in the content area — muted lucide icon (`size-10
  text-muted-foreground`), one-line explanation, primary action `Button`.
- Loading: skeleton rows matching the eventual layout (add the `skeleton`
  component via shadcn CLI when needed); never spinners inside tables.
- Error: inline `text-destructive` message with a retry `Button`
  (`variant="outline"`), positioned where the data would have appeared.
