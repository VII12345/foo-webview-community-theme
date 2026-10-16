/** `sql.js` 的内联构建（wasm 以 base64 打包进同一个文件），只声明本页用到的那几项。 */
declare module 'sql.js/dist/sql-wasm-inline.js' {
  export interface SqlJsStatement {
    bind(values?: readonly unknown[]): boolean;
    step(): boolean;
    getAsObject(): Record<string, unknown>;
    free(): void;
  }
  export interface SqlJsDatabase {
    run(sql: string, params?: readonly unknown[]): void;
    exec(sql: string): { columns: string[]; values: unknown[][] }[];
    prepare(sql: string): SqlJsStatement;
    close(): void;
  }
  export interface SqlJsStatic {
    Database: new (data?: Uint8Array) => SqlJsDatabase;
  }
  const initSqlJs: (config?: { locateFile?: (file: string) => string }) => Promise<SqlJsStatic>;
  export default initSqlJs;
}
