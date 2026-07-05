import { cva } from 'class-variance-authority'
const badgeVariants = cva('inline-flex', {
  variants: { variant: { default: 'bg-primary', secondary: 'bg-muted' } },
  defaultVariants: { variant: 'default' },
})
export function Badge({ variant }: { variant?: string }) {
  return <span data-slot="badge" className={badgeVariants({ variant })} />
}
