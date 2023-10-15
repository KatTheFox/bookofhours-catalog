import * as React from "react";
import { Container } from "microinject";

import { pick, first } from "lodash";
import { Observable, combineLatest, map, mergeMap } from "rxjs";
import { Aspects } from "secrethistories-api";

import { useDIContainer } from "@/container";
import { powerAspects } from "@/aspects";
import { decorateObjectInstance } from "@/object-decorator";

import {
  Null$,
  mapArrayItemsCached,
  mergeMapIfNotNull,
  observableObjectOrEmpty,
} from "@/observables";

import { Compendium } from "@/services/sh-compendium";

import {
  ElementStackModel,
  Orchestrator,
  TokensSource,
  filterHasAnyAspect,
} from "@/services/sh-game";

export interface BookModelDecorations {
  id: string;
  memoryElementId$: Observable<string | null>;
  memoryLabel$: Observable<string | null>;
  memoryAspects$: Observable<Aspects>;
  read(): void;
}

export type BookModel = ElementStackModel & BookModelDecorations;

function elementStackToBook(
  elementStack: ElementStackModel,
  compendium: Compendium,
  orchestrator: Orchestrator
): BookModel {
  const memory$ = combineLatest([
    elementStack.aspects$,
    elementStack.element$,
  ]).pipe(
    mergeMap(([aspects, element]) => {
      const mastery = Object.keys(aspects).find((aspectId) =>
        aspectId.startsWith("mastery.")
      );
      if (!mastery || aspects[mastery] < 1) {
        return Null$;
      }

      return element.xtriggers$.pipe(
        map((xtriggers) => {
          const readingTrigger = Object.keys(xtriggers).find((x) =>
            x.startsWith("reading.")
          );

          if (readingTrigger) {
            return first(xtriggers[readingTrigger])?.id ?? null;
          }

          return null;
        })
      );
    }),
    map((memoryId) => (memoryId ? compendium.getElementById(memoryId) : null))
  );

  const memoryElementId$ = memory$.pipe(
    map((memory) => memory?.elementId ?? null)
  );
  const memoryLabel$ = memory$.pipe(
    mergeMapIfNotNull((memory) => memory.label$)
  );

  const memoryAspects$ = memory$.pipe(
    mergeMap((memory) =>
      observableObjectOrEmpty(memory?.aspects$).pipe(
        map((aspects) => pick(aspects, powerAspects))
      )
    )
  );

  return decorateObjectInstance(elementStack, {
    get id() {
      return elementStack.id;
    },
    memoryElementId$,
    memoryLabel$,
    memoryAspects$,
    read() {
      if (isUncat(elementStack.aspects)) {
        orchestrator.requestOrchestration({
          recipeId: `catalogue.book.${elementStack.elementId.substring(10)}`,
          desiredElementIds: [elementStack.elementId],
        });
      } else {
        const mystery = extractMysteryAspect(elementStack.aspects);
        const isMastered = Object.keys(elementStack.aspects).some((aspectId) =>
          aspectId.startsWith("mastery.")
        );
        orchestrator.requestOrchestration({
          recipeId: isMastered
            ? `study.mystery.${mystery}.mastered`
            : `study.mystery.${mystery}.mastering.begin`,
          desiredElementIds: [elementStack.elementId],
        });
      }
    },
  });
}

function extractMysteryAspect(aspects: Aspects): string | null {
  let mystery = Object.keys(aspects).find((aspectId) =>
    aspectId.startsWith("mystery.")
  );
  if (!mystery) {
    return null;
  }

  return mystery.substring(8);
}

function isUncat(aspects: Aspects): boolean {
  return (
    Object.keys(aspects).find((aspect) => aspect.startsWith("uncatalogued")) !=
    undefined
  );
}

export function getBooksObservable(
  container: Container
): Observable<BookModel[]> {
  const compendium = container.get(Compendium);
  const orchestrator = container.get(Orchestrator);
  const tokensSource = container.get(TokensSource);

  return tokensSource.visibleElementStacks$.pipe(
    filterHasAnyAspect("readable"),
    mapArrayItemsCached((item) =>
      elementStackToBook(item, compendium, orchestrator)
    )
  );
}

export function useBooks() {
  const container = useDIContainer();
  return React.useMemo(() => getBooksObservable(container), [container]);
}
