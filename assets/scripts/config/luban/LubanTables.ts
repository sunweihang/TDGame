import { JsonAsset, error, resources } from 'cc';
import { Tables } from './code/schema.ts';

/**
 * Luban typescript-json tables.
 * Data: assets/resources/config/luban/*.json
 * Code: assets/scripts/config/luban/code/schema.ts (export.bat)
 */
export class LubanTables {
  private static _tables: Tables | null = null;
  private static _loading: Promise<Tables> | null = null;

  public static get tables(): Tables {
    if (!this._tables) {
      throw new Error('LubanTables not loaded. Call LubanTables.load() first.');
    }
    return this._tables;
  }

  public static get isLoaded(): boolean {
    return this._tables !== null;
  }

  public static load(): Promise<Tables> {
    if (this._tables) return Promise.resolve(this._tables);
    if (this._loading) return this._loading;
    this._loading = this._doLoad().then(
      (tables) => {
        this._tables = tables;
        this._loading = null;
        return tables;
      },
      (err) => {
        this._loading = null;
        throw err;
      },
    );
    return this._loading;
  }

  private static _doLoad(): Promise<Tables> {
    const names = ['tbpickrule', 'tbturretline', 'tbpickcard'];
    const cache: Record<string, unknown> = {};
    return Promise.all(
      names.map(
        (name) =>
          new Promise<void>((resolve, reject) => {
            resources.load(`config/luban/${name}`, JsonAsset, (err, asset) => {
              if (err || !asset) {
                error(`[LubanTables] load failed: config/luban/${name}`, err);
                reject(err || new Error(name));
                return;
              }
              cache[name] = asset.json;
              resolve();
            });
          }),
      ),
    ).then(
      () =>
        new Tables((file: string) => {
          const data = cache[file];
          if (data === undefined) throw new Error(`[LubanTables] missing json: ${file}`);
          return data;
        }),
    );
  }
}
