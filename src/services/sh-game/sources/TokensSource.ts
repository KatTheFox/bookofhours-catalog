import { startTransition } from "react";
import {
  Observable,
  Subject,
  combineLatest,
  distinctUntilChanged,
  map,
  shareReplay,
} from "rxjs";
import { inject, injectable, provides, singleton } from "microinject";
import { Token, isElementStack } from "secrethistories-api";
import { difference, sortBy } from "lodash";

import {
  distinctUntilShallowArrayChanged,
  filterItemObservations,
  filterItems,
  firstOrDefault,
} from "@/observables";

import { Scheduler, TaskUnsubscriber } from "../../scheduler";
import { API } from "../../sh-api";

import { TokenModel } from "../token-models/TokenModel";
import { TokenModelFactory } from "../token-models/TokenModelFactory";
import {
  ConnectedTerrainModel,
  isConnectedTerrainModel,
} from "../token-models/ConnectedTerrainModel";
import {
  SituationModel,
  isSituationModel,
} from "../token-models/SituationModel";
import {
  ElementStackModel,
  isElementStackModel,
} from "../token-models/ElementStackModel";

import { RunningSource } from "./RunningSource";

const spherePaths = [
  "~/portage1",
  "~/portage2",
  "~/portage3",
  "~/portage4",
  "~/portage5",
  "~/hand.abilities",
  "~/hand.skills",
  "~/hand.memories",
  "~/hand.misc",
  "~/library",
  "~/fixedverbs",
];

const supportedPayloadTypes = [
  "ConnectedTerrain",
  "ElementStack",
  "Situation",
  "WorkstationSituation",
  "RoomWorkSituation",
];

@injectable()
@singleton()
@provides(TokensSource)
export class TokensSource {
  private _tokensTaskSubsciption: TaskUnsubscriber | null = null;
  private readonly _tokenModels: Map<string, TokenModel> = new Map();

  private readonly _tokensSubject$ = new Subject<readonly TokenModel[]>();
  private readonly _tokens$ = this._tokensSubject$.pipe(
    distinctUntilShallowArrayChanged()
  );

  private readonly _visibleTokens$ = this._tokens$.pipe(
    filterItemObservations((model) => model.visible$),
    distinctUntilShallowArrayChanged(),
    shareReplay(1)
  );

  constructor(
    @inject(Scheduler) scheduler: Scheduler,
    @inject(RunningSource) runningSource: RunningSource,
    @inject(API) private readonly _api: API,
    @inject(TokenModelFactory)
    private readonly _tokenModelFactory: TokenModelFactory
  ) {
    runningSource.isRunning$.subscribe((isRunning) => {
      if (!isRunning) {
        if (this._tokensTaskSubsciption) {
          this._tokensTaskSubsciption();
          this._tokensTaskSubsciption = null;
        }
      } else {
        if (!this._tokensTaskSubsciption) {
          this._tokensTaskSubsciption = scheduler.addTask(() =>
            this._pollTokens()
          );
        }
      }
    });
  }

  get tokens$(): Observable<readonly TokenModel[]> {
    return this._tokens$;
  }

  get visibleTokens$(): Observable<readonly TokenModel[]> {
    return this._visibleTokens$;
  }

  private _considerSituation$: Observable<SituationModel | null> | null = null;
  get considerSituation$() {
    if (this._considerSituation$ == null) {
      this._considerSituation$ = this._tokens$.pipe(
        map(
          (tokens) =>
            tokens
              .filter(isSituationModel)
              .find((x) => x.path.startsWith("~/fixedverbs!consider.")) ?? null
        ),
        shareReplay(1)
      );
    }

    return this._considerSituation$;
  }

  private _unlockingTerrainSituation$: Observable<SituationModel | null> | null =
    null;
  get unlockingTerrainSituation$() {
    if (!this._unlockingTerrainSituation$) {
      this._unlockingTerrainSituation$ = this._tokens$.pipe(
        // More nasty gnarly observable chains
        filterItems(isSituationModel),
        // This isnt an observable, but the situation is created and destroyed as it is used,
        // so this is safe.
        firstOrDefault((situation) => situation.verbId === "terrain.unlock"),
        distinctUntilChanged(),
        shareReplay(1)
      );
    }

    return this._unlockingTerrainSituation$;
  }

  private _visibleSituations$: Observable<SituationModel[]> | null = null;
  get visibleSituations$() {
    if (!this._visibleSituations$) {
      this._visibleSituations$ = combineLatest([
        this.considerSituation$,
        this.unlockingTerrainSituation$,
        this.unlockedWorkstations$,
        this.unlockedHarvestStations$,
      ]).pipe(
        map(([consider, unlock, workstations, harvestStations]) => {
          const situations = [...workstations, ...harvestStations];
          if (unlock) {
            situations.push(unlock);
          }
          if (consider) {
            situations.push(consider);
          }
          return situations;
        }),
        shareReplay(1)
      );
    }

    return this._visibleSituations$;
  }

  private _unsealedTerrains$: Observable<
    readonly ConnectedTerrainModel[]
  > | null = null;
  get unsealedTerrains$() {
    if (!this._unsealedTerrains$) {
      this._unsealedTerrains$ = this._tokens$.pipe(
        filterItems(isConnectedTerrainModel),
        filterItemObservations((t) => t.sealed$.pipe(map((sealed) => !sealed))),
        distinctUntilShallowArrayChanged(),
        shareReplay(1)
      );
    }

    return this._unsealedTerrains$;
  }

  private _unlockedTerrains$: Observable<
    readonly ConnectedTerrainModel[]
  > | null = null;
  get unlockedTerrains$(): Observable<readonly ConnectedTerrainModel[]> {
    if (!this._unlockedTerrains$) {
      this._unlockedTerrains$ = this._tokens$.pipe(
        filterItems(isConnectedTerrainModel),
        distinctUntilShallowArrayChanged(),
        shareReplay(1)
      );
    }

    return this._unlockedTerrains$;
  }

  private _visibleElementStacks$: Observable<
    readonly ElementStackModel[]
  > | null = null;
  get visibleElementStacks$() {
    if (this._visibleElementStacks$ === null) {
      this._visibleElementStacks$ = this._visibleTokens$.pipe(
        filterItems(isElementStackModel),
        distinctUntilShallowArrayChanged(),
        shareReplay(1)
      );
    }

    return this._visibleElementStacks$;
  }

  private _unlockedWorkstations$: Observable<readonly SituationModel[]> | null =
    null;
  get unlockedWorkstations$() {
    if (!this._unlockedWorkstations$) {
      this._unlockedWorkstations$ = this._visibleTokens$.pipe(
        filterItems(isSituationModel),
        map((situations) =>
          situations.filter(
            (x) =>
              !x.verbId.startsWith("library.bed.") &&
              !x.verbId.startsWith("garden.") &&
              x.verbId != "world.beachcombing"
          )
        ),
        distinctUntilShallowArrayChanged(),
        shareReplay(1)
      );
    }

    return this._unlockedWorkstations$;
  }

  private _unlockedHarvestStations$: Observable<
    readonly SituationModel[]
  > | null = null;
  get unlockedHarvestStations$() {
    if (!this._unlockedHarvestStations$) {
      this._unlockedHarvestStations$ = this._visibleTokens$.pipe(
        filterItems(isSituationModel),
        map((situations) =>
          situations.filter(
            (x) =>
              x.verbId.startsWith("garden.") || x.verbId == "world.beachcombing"
          )
        ),
        distinctUntilShallowArrayChanged(),
        shareReplay(1)
      );
    }

    return this._unlockedHarvestStations$;
  }

  private async _pollTokens() {
    const tokens = await this._api.getAllTokens({
      spherePrefix: spherePaths,
      payloadType: supportedPayloadTypes,
    });

    const existingTokenIds = Array.from(this._tokenModels.keys());
    const foundIds = tokens.map((t) => t.id);
    const tokenIdsToRemove = difference(existingTokenIds, foundIds);
    tokenIdsToRemove.forEach((id) => {
      const token = this._tokenModels.get(id);
      if (token) {
        token.retire();
        this._tokenModels.delete(id);
      }
    });

    startTransition(() => {
      const tokenModels = sortBy(
        tokens.map((token) => this._getOrUpdateTokenModel(token)),
        "id"
      );

      this._tokensSubject$.next(tokenModels);
    });
  }

  private _getOrUpdateTokenModel(token: Token): TokenModel {
    let model: TokenModel;
    if (!this._tokenModels.has(token.id)) {
      model = this._tokenModelFactory.create(token);
      this._tokenModels.set(token.id, model);
    } else {
      model = this._tokenModels.get(token.id)!;
      model.update(token);
    }

    return model;
  }
}
