import * as React from "react";
import { Observable, combineLatest, map, of as observableOf } from "rxjs";
import { omit } from "lodash";

import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import Table from "@mui/material/Table";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import Popover from "@mui/material/Popover";

import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import FilterAlt from "@mui/icons-material/FilterAlt";

import { useTheme, type SxProps } from "@mui/material/styles";

import {
  Column,
  ColumnDef,
  ColumnFiltersState,
  Header,
  SortingState,
  TableState,
  Updater,
  flexRender,
  getCoreRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";

import {
  Null$,
  mapArrayItemsCached,
  observeAll,
  useObservation,
} from "@/observables";
import { decorateObjectInstance } from "@/object-decorator";

import {
  ObservableColumnDef,
  isObservableAccessorFnColumnDef,
  isObservableAccessorKeyColumnDef,
} from "./types";

// TODO: Virtual
// https://tanstack.com/virtual/v3/docs/examples/react/table
// TODO: Pagination.  MUI has a component for this, and I bet tanstack has that functionality as well.

export interface ObservableDataGridProps<T extends {}> {
  sx?: SxProps;
  filters?: Record<string, any>;
  defaultSortColumn?: string;
  columns: ObservableColumnDef<T, any>[];
  items$: Observable<readonly T[]>;
  onFiltersChanged?(filters: Record<string, any>): void;
}

function autoColumnProperty<T>(
  column: ObservableColumnDef<T>,
  index: number
): string {
  if (column.id) {
    return `col::${column.id}:${index}`;
  } else if (typeof column.header === "string") {
    return `col::${column.header}:${index}`;
  } else {
    return `col::unknown:${index}`;
  }
}

function observableToColumnDef<T extends {}>(
  observableColumn: ObservableColumnDef<T>,
  index: number
): ColumnDef<Record<string, any>> {
  if (
    isObservableAccessorKeyColumnDef(observableColumn) ||
    isObservableAccessorFnColumnDef(observableColumn)
  ) {
    const accessorKey = autoColumnProperty(observableColumn, index);
    return {
      ...omit(observableColumn, ["observationKey", "observationFn"]),
      accessorKey,
    } as any;
  }

  return observableColumn as any;
}

function observeColumn<TData extends {}>(
  column: ObservableColumnDef<TData>,
  item: TData,
  itemIndex: number
): Observable<any> {
  if (isObservableAccessorFnColumnDef(column)) {
    return column.observationFn(item, itemIndex);
  } else if (isObservableAccessorKeyColumnDef(column)) {
    return item[column.observationKey] as Observable<any>;
  } else if ("accessorKey" in column) {
    return observableOf((item as any)[column.accessorKey]);
  } else if ("accessorFn" in column) {
    return observableOf(column.accessorFn(item, itemIndex));
  }

  return Null$;
}

function itemToRow<T extends {}>(
  item: T,
  itemIndex: number,
  columns: ObservableColumnDef<T>[]
): Observable<Record<string, any>> {
  function flattenColumn(
    column: ObservableColumnDef<T>
  ): ObservableColumnDef<T>[] {
    if ("columns" in column && Array.isArray(column.columns)) {
      return column.columns.flatMap(flattenColumn);
    }

    return [column];
  }

  columns = columns.flatMap(flattenColumn);

  return combineLatest(
    columns.map((column) => observeColumn(column, item, itemIndex))
  ).pipe(
    map((values) => {
      const decoration: Record<string, any> = {};

      for (let i = 0; i < columns.length; i++) {
        const property = autoColumnProperty(columns[i], i);
        const value = values[i];
        decoration[property] = value;
      }

      return decorateObjectInstance(item, decoration);
    })
  );
}

function recordToFilter(record: Record<string, any>): ColumnFiltersState {
  return Object.keys(record).map((key) => ({
    id: key,
    value: record[key],
  }));
}
function filterToRecord(filter: ColumnFiltersState): Record<string, any> {
  const result = {} as Record<string, any>;
  for (const { id, value } of filter) {
    if (value) {
      result[id] = value;
    }
  }

  return result;
}

function ObservableDataGrid<T extends {}>({
  sx,
  filters,
  defaultSortColumn,
  columns,
  items$,
  onFiltersChanged,
}: ObservableDataGridProps<T>) {
  const tableColumns = React.useMemo(
    // FIXME: These columns can be nested, which will throw off ID calculation.
    () => columns.map(observableToColumnDef),
    [columns]
  );

  const [sorting, setSorting] = React.useState<SortingState>(
    defaultSortColumn
      ? [
          {
            id: defaultSortColumn,
            desc: false,
          },
        ]
      : []
  );

  const state = React.useMemo<Partial<TableState>>(
    () => ({
      sorting,
      columnFilters:
        onFiltersChanged && filters ? recordToFilter(filters) : undefined,
    }),
    [sorting, onFiltersChanged, filters]
  );

  const data = useObservation(
    () =>
      items$.pipe(
        mapArrayItemsCached((item, index) => itemToRow(item, index, columns)),
        observeAll()
      ),
    [items$, columns]
  );

  const onTableFiltersChanged = React.useCallback(
    (value: Updater<ColumnFiltersState>) => {
      if (filters == null || onFiltersChanged == null) {
        return;
      }

      if (typeof value === "function") {
        value = value(recordToFilter(filters));
      }

      onFiltersChanged(filterToRecord(value));
    },
    [onFiltersChanged, filters]
  );

  const table = useReactTable({
    data: data ?? [],
    columns: tableColumns,
    state,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onColumnFiltersChange: onTableFiltersChanged,
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: setSorting,
    getFacetedUniqueValues: getFacetedUniqueValues(),
  });

  return (
    <TableContainer sx={sx}>
      {!data && (
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "100%",
            height: "100%",
          }}
        >
          <CircularProgress />
        </Box>
      )}
      {data && (
        <Table
          sx={{
            tableLayout: "fixed",
          }}
          stickyHeader
        >
          <TableHead>
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id}>
                {group.headers.map((header) => (
                  <HeaderCell key={header.id} header={header} />
                ))}
              </TableRow>
            ))}
          </TableHead>
          <TableBody>
            {table.getRowModel().rows.map((row) => {
              return (
                <TableRow key={row.id} sx={{ height: "40px" }}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </TableContainer>
  );
}

const HeaderCell = ({
  header,
}: {
  header: Header<Record<string, any>, unknown>;
}) => {
  const isSorted = header.column.getIsSorted();
  return (
    <TableCell
      colSpan={header.colSpan}
      // TODO: Figure out flex.  It was supported at one point but seems to have been lost with v8.
      sx={{
        width:
          header.getSize() === Number.MAX_SAFE_INTEGER
            ? "100%"
            : header.getSize(),
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center" }}>
        <Typography variant="h6" sx={{ mr: 1 }}>
          {!header.isPlaceholder &&
            flexRender(header.column.columnDef.header, header.getContext())}
        </Typography>
        {header.column.getCanSort() && (
          <IconButton
            sx={{
              opacity: isSorted === false ? 0.4 : 1,
            }}
            onClick={header.column.getToggleSortingHandler()}
          >
            {isSorted === false || isSorted === "asc" ? (
              <ArrowUpwardIcon />
            ) : (
              <ArrowDownwardIcon />
            )}
          </IconButton>
        )}
        {header.column.getCanFilter() && (
          <HeaderFilter column={header.column} />
        )}
      </Box>
    </TableCell>
  );
};

const HeaderFilter = ({ column }: { column: Column<any, unknown> }) => {
  const [anchorEl, setAnchorEl] = React.useState<HTMLElement | null>(null);
  const onOpen = React.useCallback((e: React.MouseEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setAnchorEl(e.currentTarget);
  }, []);

  const Filter = column.columnDef.meta?.filterComponent;

  if (!Filter) {
    return null;
  }

  const uniqueValues =
    anchorEl != null ? Array.from(column.getFacetedUniqueValues().keys()) : [];

  return (
    <>
      <IconButton
        aria-label={`Filter ${column.columnDef.header}`}
        onClick={onOpen}
      >
        <FilterAlt
          sx={{
            opacity:
              // Not sure how to reset the filter, so we just pass null for now.
              column.getIsFiltered() && column.getFilterValue() != null
                ? 1
                : 0.4,
          }}
        />
      </IconButton>
      {anchorEl && (
        <Popover
          open
          anchorEl={anchorEl}
          anchorOrigin={{
            vertical: "bottom",
            horizontal: "center",
          }}
          onClose={() => {
            setAnchorEl(null);
          }}
        >
          <Filter
            columnValues={uniqueValues}
            filterValue={column.getFilterValue()}
            onChange={column.setFilterValue}
          />
        </Popover>
      )}
    </>
  );
};

export default ObservableDataGrid;