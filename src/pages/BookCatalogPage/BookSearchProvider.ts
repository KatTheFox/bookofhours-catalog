import { map, mergeMap } from "rxjs";

import { filterItemObservations } from "@/observables";

import {
  PageSearchProviderPipe,
  elementStackMatchesQuery,
  mapElementStacksToSearchItems,
} from "@/services/search";
import { TokensSource, filterHasAspect } from "@/services/sh-game";

export const bookCatalogSearchProvider: PageSearchProviderPipe = (
  query$,
  container
) =>
  query$.pipe(
    mergeMap((query) =>
      container.get(TokensSource).visibleElementStacks$.pipe(
        filterHasAspect("readable"),
        filterItemObservations((item) => elementStackMatchesQuery(query, item)),
        mapElementStacksToSearchItems((element) =>
          element.label$.pipe(
            map((label) =>
              label ? `name=\"${encodeURIComponent(label)}\"` : null
            )
          )
        )
      )
    )
  );