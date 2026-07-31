import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
  getPaginationRowModel,
  getSortedRowModel,
  SortingState,
  ColumnFiltersState,
  getFilteredRowModel,
} from "@tanstack/react-table"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "./button"
import { Input } from "./input"
import * as React from "react"
import { useState } from "react"
import { EmptyState } from "./empty-state"
import { cn } from "@/lib/utils"

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
  emptyStateTitle?: string
  emptyStateDescription?: string
  searchKey?: string
  searchPlaceholder?: string
  /**
   * Como o registro aparece no CELULAR. Passando isto, a tabela some abaixo de
   * `md` e cada linha vira um card (use `ListCard`); a tabela volta no desktop.
   *
   * É uma prop, e não algo derivado das `columns`, de propósito: derivar
   * produziria um empilhado de "rótulo: valor" para todas as colunas, incluindo
   * as que só existem para ordenar. No celular a tela é pequena demais para
   * mostrar tudo — o card é uma ESCOLHA do que importa ali, e quem escolhe é a
   * tela.
   */
  mobileCard?: (row: TData) => React.ReactNode
}

export function DataTable<TData, TValue>({
  columns,
  data,
  emptyStateTitle = "Nenhum resultado encontrado",
  emptyStateDescription = "Não há dados para exibir no momento.",
  searchKey,
  searchPlaceholder = "Buscar...",
  mobileCard,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onSortingChange: setSorting,
    getSortedRowModel: getSortedRowModel(),
    onColumnFiltersChange: setColumnFilters,
    getFilteredRowModel: getFilteredRowModel(),
    state: {
      sorting,
      columnFilters,
    },
  })

  const rows = table.getRowModel().rows

  return (
    <div>
      {searchKey && (
        <div className="flex items-center p-4">
          <Input
            placeholder={searchPlaceholder}
            value={(table.getColumn(searchKey)?.getFilterValue() as string) ?? ""}
            onChange={(event) =>
              table.getColumn(searchKey)?.setFilterValue(event.target.value)
            }
            className="max-w-sm"
          />
        </div>
      )}
      {/* Celular: um card por registro. A tabela some — não rola na horizontal. */}
      {mobileCard && (
        <div className="space-y-3 md:hidden">
          {rows.length ? (
            rows.map((row) => (
              <React.Fragment key={row.id}>{mobileCard(row.original)}</React.Fragment>
            ))
          ) : (
            <EmptyState title={emptyStateTitle} description={emptyStateDescription} />
          )}
        </div>
      )}

      {/* Sem borda nem fundo próprios: quem os dá é a superfície que envolve a
          tabela. Ter os dois aqui empilhava caixa dentro de caixa. */}
      <div className={cn(mobileCard && "hidden md:block")}>
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  return (
                    <TableHead key={header.id}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                    </TableHead>
                  )
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {rows.length ? (
              rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-64 text-center">
                  <EmptyState title={emptyStateTitle} description={emptyStateDescription} />
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      {/* Some quando tudo cabe numa página: dois botões desabilitados embaixo de
          uma lista de três itens são ruído, e ruído é o que estamos tirando. */}
      {table.getPageCount() > 1 && (
        <div className="flex items-center justify-between gap-2 pt-4">
          <span className="txt-nota text-muted-foreground">
            Página {table.getState().pagination.pageIndex + 1} de {table.getPageCount()}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              Próximo
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
