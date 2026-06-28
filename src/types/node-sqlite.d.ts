/**
 * Ambient types for the Node built-in `node:sqlite` (stable since Node 22.5 /
 * used at runtime under Node 26). The pinned `@types/node@20` predates it, so
 * this minimal shim covers the surface the LaunchBox index store uses. Remove
 * once `@types/node` is bumped to a version that ships `node:sqlite`.
 */
declare module "node:sqlite" {
  type SupportedValue =
    | null
    | number
    | bigint
    | string
    | Uint8Array
    | boolean;

  export class StatementSync {
    // Returns the first row (column→value), or undefined when none.
    get(...params: SupportedValue[]): any;
    all(...params: SupportedValue[]): any[];
    run(...params: SupportedValue[]): {
      changes: number | bigint;
      lastInsertRowid: number | bigint;
    };
    iterate(...params: SupportedValue[]): IterableIterator<any>;
  }

  export class DatabaseSync {
    constructor(
      path: string,
      options?: { open?: boolean; readOnly?: boolean; [key: string]: unknown },
    );
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
    close(): void;
    open(): void;
  }
}
