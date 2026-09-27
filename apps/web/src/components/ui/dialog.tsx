/**
 * A minimal modal on the native <dialog> element: focus trapping, the top
 * layer and Escape are the browser's job, not re-implemented here.
 */
import { useEffect, useRef } from 'react'
import { cn } from '#/lib/utils'

export function Dialog({
  open,
  onClose,
  children,
  className,
}: {
  open: boolean
  onClose: () => void
  children: React.ReactNode
  className?: string
}) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(event) => {
        // A click on the backdrop (the dialog element itself) dismisses.
        if (event.target === ref.current) onClose()
      }}
      className={cn(
        'm-auto w-[calc(100vw-2rem)] max-w-md rounded-xl border bg-card p-4 text-card-foreground shadow-lg backdrop:bg-black/40',
        className,
      )}
    >
      {children}
    </dialog>
  )
}
