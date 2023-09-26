import {
  BehaviorSubject,
  Observable,
  combineLatest,
  distinctUntilChanged,
  firstValueFrom,
  map,
  of as observableOf,
  shareReplay,
} from "rxjs";
import { SphereSpec } from "secrethistories-api";
import { isEqual, pick, sortBy } from "lodash";

import { aspectsMagnitude, workstationFilterAspects } from "@/aspects";

import { RecipeModel } from "@/services/sh-compendium";

import { GameModel } from "../GameModel";

import { ElementStackModel } from "../token-models/ElementStackModel";
import { SituationModel } from "../token-models/SituationModel";

import {
  OrchestrationBase,
  OrchestrationSlot,
  VariableSituationOrchestration,
} from "./types";
import {
  filterItemObservations,
  mapArrayItemsCached,
  observeAll,
} from "@/observables";

import { sphereMatchesToken } from "../observables";

export class RecipeOrchestration
  implements OrchestrationBase, VariableSituationOrchestration
{
  private readonly _aspectsFilter$ = new BehaviorSubject<readonly string[]>([]);

  private readonly _situation$ = new BehaviorSubject<SituationModel | null>(
    null
  );
  private readonly _slotAssignments$ = new BehaviorSubject<
    Record<string, ElementStackModel | null>
  >({});

  constructor(
    private readonly _recipe: RecipeModel,
    private readonly _gameModel: GameModel,
    private readonly _desiredElementIds: readonly string[] = []
  ) {
    // Select a default situation.  This is hackish
    firstValueFrom(this.availableSituations$).then((situations) => {
      const situation = situations[0];
      if (!situation) {
        return;
      }

      this._situation$.next(situation);
    });
  }

  private _recipe$: Observable<RecipeModel | null> | null = null;
  get recipe$(): Observable<RecipeModel | null> {
    if (!this._recipe$) {
      this._recipe$ = observableOf(this._recipe).pipe(shareReplay(1));
    }

    return this._recipe$;
  }

  get aspectsFilter$(): Observable<readonly string[]> {
    return this._aspectsFilter$;
  }

  get situation$(): Observable<SituationModel | null> {
    return this._situation$;
  }

  private _availableSituations$: Observable<readonly SituationModel[]> | null =
    null;
  get availableSituations$(): Observable<readonly SituationModel[]> {
    if (!this._availableSituations$) {
      this._availableSituations$ = combineLatest([
        this._gameModel.unlockedWorkstations$,
        this._aspectsFilter$,
      ]).pipe(
        map(([workstations, aspectsFilter]) =>
          workstations.filter((ws) =>
            this._situationIsAvailable(ws, aspectsFilter)
          )
        ),
        shareReplay(1)
      );
    }

    return this._availableSituations$;
  }

  private _slots$: Observable<
    Readonly<Record<string, OrchestrationSlot>>
  > | null = null;
  get slots$(): Observable<Readonly<Record<string, OrchestrationSlot>>> {
    if (!this._slots$) {
      this._slots$ = this._situation$.pipe(
        map((situation) => situation?.thresholds ?? []),
        distinctUntilChanged((a, b) => isEqual(a, b)),
        map((thresholds) => {
          const result: Record<string, OrchestrationSlot> = {};
          for (const threshold of thresholds) {
            result[threshold.id] = this._createSlot(threshold);
          }

          return result;
        }),
        shareReplay(1)
      );
    }

    return this._slots$;
  }

  setAspectsFilter(aspects: readonly string[]): void {
    this._aspectsFilter$.next(aspects);
    this._tryClearSituation();
  }

  selectSituation(situation: SituationModel | null): void {
    this._situation$.next(situation);

    // TODO: Try to keep the same cards and reassign them to other slots.
    this._slotAssignments$.next({});
  }

  assignSlot(slotId: string, element: ElementStackModel): void {
    this._slotAssignments$.next({
      ...this._slotAssignments$.value,
      [slotId]: element,
    });
  }

  private async _tryClearSituation() {
    if (!this._situation$.value) {
      return;
    }

    const filter = await firstValueFrom(this._aspectsFilter$);
    if (!this._situationIsAvailable(this._situation$.value, filter)) {
      this._situation$.next(null);
      this._slotAssignments$.next({});
    }
  }

  private _createSlot(spec: SphereSpec): OrchestrationSlot {
    let availableElementStacks$: Observable<readonly ElementStackModel[]>;
    // HACK: We are currently designing around skill recipes, that have this as a common requirements.
    const requirementKeys = Object.keys(this._recipe.requirements);
    const skillRequirement = requirementKeys.find((x) => x.startsWith("s."));
    if (spec.id === "s" && skillRequirement) {
      availableElementStacks$ = this._gameModel.visibleElementStacks$.pipe(
        mapArrayItemsCached((stack) =>
          stack.elementId$.pipe(map((elementId) => ({ elementId, stack })))
        ),
        observeAll(),
        map((stacks) =>
          stacks
            .filter(({ elementId }) => elementId === skillRequirement)
            .map(({ stack }) => stack)
        ),
        shareReplay(1)
      );
    } else {
      availableElementStacks$ = this._gameModel.visibleElementStacks$.pipe(
        filterItemObservations((item) => sphereMatchesToken(spec, item)),
        map((stacks) =>
          stacks.filter((stack) =>
            Object.keys(this._recipe.requirements).some((r) =>
              // FIXME: use aspectsAndSelf$
              Object.keys(stack.aspectsAndSelf).includes(r)
            )
          )
        ),
        map((stacks) =>
          sortBy(stacks, [
            (stack) =>
              this._desiredElementIds.includes(stack.elementId) ? 1 : 0,
            (stack) => aspectsMagnitude(pick(stack.aspects, requirementKeys)),
            (stack) => aspectsMagnitude(stack.aspects),
          ]).reverse()
        ),
        shareReplay(1)
      );
    }

    // Select a default value.  This is hackish.
    firstValueFrom(availableElementStacks$).then((stacks) => {
      const item = stacks[0];
      if (!item) {
        return;
      }

      this._slotAssignments$.next({
        ...this._slotAssignments$.value,
        [spec.id]: item,
      });
    });

    return {
      spec,
      locked: false,
      assignment$: this._slotAssignments$.pipe(
        map((assignments) => assignments[spec.id] ?? null)
      ),
      availableElementStacks$,
      assign: (element) => {
        this._slotAssignments$.next({
          ...this._slotAssignments$.value,
          [spec.id]: element,
        });
      },
    };
  }

  private _situationIsAvailable(
    situation: SituationModel,
    aspectsFilter: readonly string[]
  ): boolean {
    const requiredAspects = [
      ...aspectsFilter,
      ...Object.keys(this._recipe.requirements).filter((x) =>
        workstationFilterAspects.includes(x)
      ),
    ];

    // Book reading recipes are "*consider", which is strange...
    // This doesn't fit the pattern of the workstations where it can be used.
    // I guess * at the start means any?
    // Lets special case it for now.
    if (this._recipe.actionId) {
      const comparison = new RegExp(
        `^${this._recipe.actionId.replace("*", "(?:.*)")}$`
      );
      if (!comparison.test(situation.verbId)) {
        return false;
      }
      // if (this._recipe.actionId?.endsWith("*")) {
      //   const partial = this._recipe.actionId.slice(0, -1);
      //   if (!situation.verbId.startsWith(partial)) {
      //     return false;
      //   }
      // } else if (situation.verbId != this._recipe.actionId) {
      //   return false;
      // }
    }

    // TODO: In practice we can use situations that don't match this if alternate aspects on cards are accepted.
    // This really is a special / edge case for skills, so maybe restrict the match to the skill card off-aspect.
    // Interestingly enough, this is absolutely required to 'read' phonographs and films.
    for (const aspect of requiredAspects) {
      if (
        !situation.thresholds.some(
          (t) =>
            (Object.keys(t.essential).includes(aspect) ||
              Object.keys(t.required).includes(aspect)) &&
            !Object.keys(t.forbidden).includes(aspect)
        )
      ) {
        return false;
      }
    }

    return true;
  }
}