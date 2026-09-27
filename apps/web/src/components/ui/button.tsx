import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '#/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg font-medium transition-colors focus-visible:outline-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        outline: 'border bg-transparent hover:bg-secondary',
        ghost: 'hover:bg-secondary',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
      },
      size: {
        // 44px+ tap targets: this app is used one-thumbed in a store aisle.
        default: 'min-h-11 px-4 py-2 text-sm',
        sm: 'min-h-9 px-3 text-sm',
        lg: 'min-h-13 px-6 text-base',
        icon: 'size-11',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
)

export function Button({
  className,
  variant,
  size,
  type = 'button',
  ...props
}: React.ComponentProps<'button'> & VariantProps<typeof buttonVariants>) {
  return <button type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />
}
