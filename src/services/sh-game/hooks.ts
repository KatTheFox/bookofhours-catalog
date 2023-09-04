import { Observable } from "rxjs";

import { useDIDependency } from "@/container";

import { filterItemObservations, useObservation } from "@/observables";

import { ElementStackModel } from "./token-models/ElementStackModel";

import { GameModel } from "./GameModel";

export function useIsRunning(): boolean | undefined {
  const model = useDIDependency(GameModel);
  return useObservation(model.isRunning$) ?? model.isRunning;
}

export function useYear() {
  const model = useDIDependency(GameModel);
  return useObservation(model.year$) ?? model.year;
}

export function useSeason() {
  const model = useDIDependency(GameModel);
  return useObservation(model.season$) ?? model.season;
}

export function useVisibleElementStacks(
  filter?: (item: ElementStackModel) => Observable<boolean>,
  deps?: any[]
): readonly ElementStackModel[] {
  const model = useDIDependency(GameModel);
  return (
    useObservation(
      () =>
        filter
          ? model.visibleElementStacks$.pipe(filterItemObservations(filter))
          : model.visibleElementStacks$,
      [model, deps ? [...deps] : filter]
    ) ?? []
  );
}