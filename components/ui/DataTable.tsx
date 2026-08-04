import React from 'react'
import { cn } from '@/lib/utils'
import { Card, type CardProps } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

export interface Column<T> {
  key: string
  header: string
  render: (item: T) => React.ReactNode
  className?: string
  headerClassName?: string
}

export interface DataTableProps<T> {
  data: T[]
  columns: Column<T>[]
  keyExtractor: (item: T) => string | number
  loading?: boolean
  onRowClick?: (item: T) => void
  emptyState?: {
    icon?: React.ElementType
    title: string
    description?: string
  }
  pagination?: {
    total: number
    current: number
    pageSize: number
    onPageChange: (page: number) => void
  }
  cardProps?: Omit<CardProps, 'children' | 'variant'>
  headerClassName?: string
  className?: string
}

export function DataTable<T extends Record<string, any>>({
  data,
  columns,
  keyExtractor,
  loading,
  onRowClick,
  emptyState,
  pagination,
  cardProps,
  headerClassName,
  className,
}: DataTableProps<T>) {
  const totalPages = pagination ? Math.ceil(pagination.total / pagination.pageSize) : 0

  const renderBody = () => {
    if (loading) {
      return (
        <TableRow>
          <TableCell colSpan={columns.length} className="text-center py-12">
            <div className="flex flex-col items-center gap-3">
              <div className="w-6 h-6 border-2 border-role-primary border-t-transparent rounded-full animate-spin" />
              <span className="text-sm text-muted-foreground">Chargement...</span>
            </div>
          </TableCell>
        </TableRow>
      )
    }

    if (data.length === 0) {
      const EmptyIcon = emptyState?.icon
      return (
        <TableRow>
          <TableCell colSpan={columns.length} className="text-center py-12">
            <div className="flex flex-col items-center gap-2">
              {EmptyIcon && <EmptyIcon className="w-10 h-10 text-muted-foreground/30" />}
              <span className="text-sm font-medium text-foreground/80">{emptyState?.title || 'Aucune donnée'}</span>
              {emptyState?.description && (
                <span className="text-xs text-muted-foreground">{emptyState.description}</span>
              )}
            </div>
          </TableCell>
        </TableRow>
      )
    }

    return data.map((item) => (
      <TableRow
        key={keyExtractor(item)}
        className={cn(onRowClick && 'cursor-pointer')}
        onClick={() => onRowClick?.(item)}
      >
        {columns.map((col) => (
          <TableCell key={col.key} className={col.className}>
            {col.render(item)}
          </TableCell>
        ))}
      </TableRow>
    ))
  }

  return (
    <Card variant="glass" {...cardProps}>
      <Table>
        <TableHeader className={headerClassName}>
          <TableRow>
            {columns.map((col) => (
              <TableHead key={col.key} className={cn('text-xs uppercase tracking-wider font-semibold', col.headerClassName)}>
                {col.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>{renderBody()}</TableBody>
      </Table>

      {pagination && totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-border">
          <span className="text-xs text-muted-foreground">
            {pagination.total} résultat{pagination.total !== 1 ? 's' : ''}
          </span>
          <div className="flex items-center gap-1">
            <button
              className="px-2.5 py-1 text-xs rounded-md border border-border hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              disabled={pagination.current <= 1}
              onClick={() => pagination.onPageChange(pagination.current - 1)}
            >
              ←
            </button>
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
              const start = Math.max(1, pagination.current - 2)
              const page = start + i
              if (page > totalPages) return null
              return (
                <button
                  key={page}
                  className={cn(
                    'px-2.5 py-1 text-xs rounded-md border transition-colors',
                    page === pagination.current
                      ? 'border-role-primary bg-role-primary-soft text-role-primary font-semibold'
                      : 'border-border hover:bg-muted'
                  )}
                  onClick={() => pagination.onPageChange(page)}
                >
                  {page}
                </button>
              )
            })}
            <button
              className="px-2.5 py-1 text-xs rounded-md border border-border hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              disabled={pagination.current >= totalPages}
              onClick={() => pagination.onPageChange(pagination.current + 1)}
            >
              →
            </button>
          </div>
        </div>
      )}
    </Card>
  )
}
