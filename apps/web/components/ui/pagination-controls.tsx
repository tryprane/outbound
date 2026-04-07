'use client'

import { Button } from '@/components/ui/button'

type PaginationControlsProps = {
  page: number
  pages: number
  total: number
  limit: number
  onPageChange: (page: number) => void
  onLimitChange?: (limit: number) => void
  limitOptions?: number[]
  label?: string
}

export function PaginationControls({
  page,
  pages,
  total,
  limit,
  onPageChange,
  onLimitChange,
  limitOptions = [10, 25, 50, 100],
  label = 'items',
}: PaginationControlsProps) {
  const start = total === 0 ? 0 : (page - 1) * limit + 1
  const end = Math.min(total, page * limit)

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-[20px] border border-black/8 bg-white/80 px-4 py-3 text-sm">
      <div className="text-[var(--text-secondary)]">
        Showing {start}-{end} of {total} {label}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {onLimitChange ? (
          <select
            className="input-base min-w-[92px]"
            value={limit}
            onChange={(event) => onLimitChange(Number(event.target.value))}
          >
            {limitOptions.map((option) => (
              <option key={option} value={option}>
                {option} / page
              </option>
            ))}
          </select>
        ) : null}
        <Button
          variant="outline"
          className="rounded-full border-black/10 bg-white"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
        >
          Previous
        </Button>
        <div className="min-w-[88px] text-center text-[var(--text-secondary)]">
          Page {page} of {pages}
        </div>
        <Button
          variant="outline"
          className="rounded-full border-black/10 bg-white"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= pages}
        >
          Next
        </Button>
      </div>
    </div>
  )
}
