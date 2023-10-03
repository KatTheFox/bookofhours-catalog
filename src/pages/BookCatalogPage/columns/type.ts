import {
  aspectsFilter,
  aspectsPresenceColumnDef,
} from "@/components/ObservableDataGrid";

import { BookModel } from "../BookDataSource";

export function typeColumn() {
  return aspectsPresenceColumnDef<BookModel>(
    ["film", "record.phonograph"],
    { display: "none" },
    {
      headerName: "Type",
      width: 125,
      filter: aspectsFilter("type", ["film", "record.phonograph"]),
    }
  );
}