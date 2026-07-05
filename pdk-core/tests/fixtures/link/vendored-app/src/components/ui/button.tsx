import { cva } from 'class-variance-authority'

const buttonVariants = cva('inline-flex items-center', {
  variants: {
    variant: { default: 'bg-primary', outline: 'border' },
    size: { default: 'h-9', sm: 'h-8' },
  },
  defaultVariants: { variant: 'default', size: 'default' },
})

export function Button({ variant, size }: { variant?: string; size?: string }) {
  return <button data-slot="button" className={buttonVariants({ variant, size })} />
}
