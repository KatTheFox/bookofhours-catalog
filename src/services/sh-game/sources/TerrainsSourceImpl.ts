import { inject, injectable, provides, singleton } from "microinject";
import { Observable, map } from "rxjs";

import { distinctUntilShallowArrayChanged, observeAll } from "@/observables";

import {
  ConnectedTerrainModel,
  isConnectedTerrainModel,
} from "../token-models/ConnectedTerrainModel";

import { TokensSource, TerrainsSource } from "./services";

@injectable()
@singleton()
@provides(TerrainsSource)
export class TerrainsSourceImpl implements TerrainsSource {
  private readonly _unlockedTerrains$: Observable<
    readonly ConnectedTerrainModel[]
  >;

  constructor(@inject(TokensSource) tokensSource: TokensSource) {
    this._unlockedTerrains$ = tokensSource.tokens$.pipe(
      map((tokens) => tokens.filter(isConnectedTerrainModel)),
      map((terrains) =>
        terrains.map((terrain) =>
          terrain.shrouded$.pipe(map((shrouded) => ({ terrain, shrouded })))
        )
      ),
      observeAll(),
      map((data) =>
        data.filter(({ shrouded }) => !shrouded).map(({ terrain }) => terrain)
      ),
      distinctUntilShallowArrayChanged()
    );
  }

  get unlockedTerrains$() {
    return this._unlockedTerrains$;
  }
}