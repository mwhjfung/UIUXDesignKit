import { cva } from 'class-variance-authority'
const v = cva('x', { variants: { variant: { default: 'a' } }, defaultVariants: { variant: 'default' } })
export function Button() { return <button data-slot="button" className={v({})} /> }
