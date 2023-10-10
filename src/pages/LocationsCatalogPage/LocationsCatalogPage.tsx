import * as React from "react";

import Box from "@mui/material/Box";
import LockIcon from "@mui/icons-material/Lock";
import LockOpenIcon from "@mui/icons-material/LockOpen";

import { useDIDependency } from "@/container";

import {
  ConnectedTerrainModel,
  SituationModel,
  TokensSource,
  isSituationModel,
} from "@/services/sh-game";

import { useQueryObjectState } from "@/hooks/use-queryobject";

import PageContainer from "@/components/PageContainer";
import { RequireRunning } from "@/components/RequireLegacy";
import FocusIconButton from "@/components/FocusIconButton";
import ObservableDataGrid, {
  TextFilter,
  TextWrapCell,
  createObservableColumnHelper,
} from "@/components/ObservableDataGrid";
import { filterItems, useObservation } from "@/observables";
import VerbIcon from "@/components/VerbIcon";
import {
  RowHeight,
  RowPaddingY,
} from "@/components/ObservableDataGrid/constants";
import { CellContext } from "@tanstack/react-table";
import Typography from "@mui/material/Typography";

const columnHelper = createObservableColumnHelper<ConnectedTerrainModel>();

const LocationsCatalogPage = () => {
  const tokensSource = useDIDependency(TokensSource);
  const items$ = tokensSource.unsealedTerrains$;

  const columns = React.useMemo(
    () => [
      columnHelper.display({
        id: "focus-button",
        header: "",
        size: 50,
        cell: ({ row }) => (
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
            }}
          >
            <FocusIconButton token={row.original} />
          </Box>
        ),
      }),
      columnHelper.observe("label$", {
        header: "Location",
        size: 200,
        filterFn: "includesString",
        cell: TextWrapCell,
      }),
      columnHelper.observe("shrouded$", {
        header: "Status",
        size: 100,
        filterFn: "equals",
        cell: (props) => (props.getValue() ? <LockIcon /> : <LockOpenIcon />),
      }),
      columnHelper.observe(
        (item) => item.children$.pipe(filterItems(isSituationModel)),
        {
          header: "Workstations",
          size: 650,
          enableSorting: false,
          cell: WorkstationsCell,
        }
      ),
      columnHelper.observe("description$" as any, {
        size: Number.MAX_SAFE_INTEGER,
        header: "Description",
        enableSorting: false,
        filterFn: "includesString",
        meta: {
          filterComponent: TextFilter,
        },
        cell: TextWrapCell,
      }),
    ],
    []
  );

  const [filters, onFiltersChanged] = useQueryObjectState();

  return (
    <PageContainer title="Locations" backTo="/">
      <RequireRunning />
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "100%",
        }}
      >
        <ObservableDataGrid
          sx={{ height: "100%" }}
          columns={columns}
          items$={items$}
          filters={filters}
          onFiltersChanged={onFiltersChanged}
        />
      </Box>
    </PageContainer>
  );
};

const WorkstationsCell = (
  props: CellContext<ConnectedTerrainModel, readonly SituationModel[]>
) => {
  const workstations: readonly SituationModel[] = props.getValue();
  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        flexWrap: "wrap",
        justifyContent: "center",
        gap: 1,
        height: RowHeight - RowPaddingY * 2,
      }}
    >
      {workstations.map((workstation) => (
        <SituationLineItem key={workstation.id} model={workstation} />
      ))}
    </Box>
  );
};

interface SituationLineItemProps {
  model: SituationModel;
}
const SituationLineItem = ({ model }: SituationLineItemProps) => {
  const verbId = useObservation(model.verbId$);
  const label = useObservation(model.label$);
  if (!verbId || !label) {
    return null;
  }

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        gap: 1,
      }}
    >
      <VerbIcon verbId={model.verbId} />
      <Typography variant="body2">{label}</Typography>
    </Box>
  );
};

export default LocationsCatalogPage;
