import { cn } from '#/lib/utils'

export function Input({ className, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      className={cn(
        'flex min-h-11 w-full rounded-lg border bg-card px-3 py-2 text-base shadow-xs placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}

export function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      className={cn(
        'flex min-h-20 w-full rounded-lg border bg-card px-3 py-2 text-base shadow-xs placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}

export function Select({ className, ...props }: React.ComponentProps<'select'>) {
  return (
    <select
      className={cn(
        'flex min-h-11 w-full rounded-lg border bg-card px-3 py-2 text-base shadow-xs focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}
