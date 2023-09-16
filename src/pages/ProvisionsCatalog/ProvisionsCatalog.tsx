import * as React from "react";
import { map } from "rxjs";

import Box from "@mui/material/Box";

import { useDIDependency } from "@/container";

import { powerAspects, provisionsAspects } from "@/aspects";

import { observeAll, useObservation } from "@/observables";

import {
  ElementStackModel,
  GameModel,
  filterHasAnyAspect,
} from "@/services/sh-game";

import { useQueryObjectState } from "@/hooks/use-queryobject";

import { RequireRunning } from "@/components/RequireLegacy";
import ObservableDataGrid, {
  descriptionColumnDef,
  iconColumnDef,
  labelColumnDef,
  locationColumnDef,
  multiselectOptionsFilter,
  aspectsColumnDef,
  aspectsPresenceColumnDef,
} from "@/components/ObservableDataGrid";
import PageContainer from "@/components/PageContainer";
import { aspectsFilter } from "@/components/ObservableDataGrid/filters/aspects";

const ProvisionsCatalog = () => {
  const model = useDIDependency(GameModel);

  const elements$ = React.useMemo(
    () =>
      model.visibleElementStacks$.pipe(filterHasAnyAspect(provisionsAspects)),
    [model]
  );

  const locations =
    useObservation(
      () =>
        model.unlockedTerrains$.pipe(
          map((terrains) => terrains.map((terrain) => terrain.label$)),
          observeAll()
        ),
      [model]
    ) ?? [];

  const columns = React.useMemo(
    () => [
      iconColumnDef<ElementStackModel>(),
      labelColumnDef<ElementStackModel>(),
      locationColumnDef<ElementStackModel>({
        filter: multiselectOptionsFilter("location", locations),
      }),
      aspectsPresenceColumnDef<ElementStackModel>(
        provisionsAspects,
        { display: "none", orientation: "horizontal" },
        { headerName: "Type", filter: aspectsFilter("type", provisionsAspects) }
      ),
      aspectsColumnDef<ElementStackModel>(powerAspects),
      descriptionColumnDef<ElementStackModel>(),
    ],
    [locations]
  );

  const [filters, onFiltersChanged] = useQueryObjectState();

  return (
    <PageContainer title="Stores and Provisions" backTo="/">
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "100%",
        }}
      >
        <RequireRunning />
        <ObservableDataGrid
          sx={{ height: "100%" }}
          columns={columns}
          items$={elements$}
          filters={filters}
          onFiltersChanged={onFiltersChanged}
        />
      </Box>
    </PageContainer>
  );
};

export default ProvisionsCatalog;
