import { NextRequest } from 'next/server'

export interface PaginationParams {
  page: number
  limit: number
  skip: number
}

export interface PaginatedResult<T> {
  items: T[]
  total: number
  page: number
  pages: number
  limit: number
}

export function parsePaginationParams(
  request: NextRequest,
  options?: {
    defaultLimit?: number
    maxLimit?: number
  }
): PaginationParams {
  const defaultLimit = options?.defaultLimit ?? 25
  const maxLimit = options?.maxLimit ?? 100
  const page = Math.max(1, Number.parseInt(request.nextUrl.searchParams.get('page') || '1', 10) || 1)
  const requestedLimit = Number.parseInt(
    request.nextUrl.searchParams.get('limit') || String(defaultLimit),
    10
  )
  const limit = Math.min(maxLimit, Math.max(1, Number.isFinite(requestedLimit) ? requestedLimit : defaultLimit))

  return {
    page,
    limit,
    skip: (page - 1) * limit,
  }
}

export function buildPaginatedResult<T>(
  items: T[],
  total: number,
  params: Pick<PaginationParams, 'page' | 'limit'>
): PaginatedResult<T> {
  return {
    items,
    total,
    page: params.page,
    pages: Math.max(1, Math.ceil(total / params.limit)),
    limit: params.limit,
  }
}
