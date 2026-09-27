/**
 * Which tote the app is currently showing.
 *
 * Persisted so reopening the PWA in the store aisle lands on the list that was
 * open, not on a picker. The id may point at a tote the user has since left or
 * deleted — views must treat a missing tote as "none chosen".
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface ActiveToteState {
  activeToteId: string | null
  setActiveTote: (id: string | null) => void
}

export const useActiveTote = create<ActiveToteState>()(
  persist(
    (set) => ({
      activeToteId: null,
      setActiveTote: (id) => set({ activeToteId: id }),
    }),
    { name: 'tote:active-tote' },
  ),
)
