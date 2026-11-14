// A small D1-compatible wrapper over Node's built-in SQLite, so the server's real
// SQL runs in tests without Cloudflare tooling. Only the methods the server uses.

import { readFileSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";

class Statement {
  constructor(
    private readonly db: DatabaseSync,
    private readonly sql: string,
    private readonly params: SQLInputValue[] = [],
  ) {}
  bind(...params: unknown[]) {
    return new Statement(this.db, this.sql, params as SQLInputValue[]);
  }
  // D1 uses ?1, ?2… placeholders; node:sqlite accepts them as positional parameters too.
  async run() {
    const r = this.db.prepare(this.sql).run(...this.params);
    return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
  }
  async all<T>() {
    return { success: true, results: this.db.prepare(this.sql).all(...this.params) as T[] };
  }
  async first<T>() {
    return (this.db.prepare(this.sql).get(...this.params) as T | undefined) ?? null;
  }
  runSync() {
    this.db.prepare(this.sql).run(...this.params);
  }
}

export function createD1(): D1Database {
  const db = new DatabaseSync(":memory:");
  db.exec(readFileSync(new URL("../migrations/0001_init.sql", import.meta.url), "utf8"));
  const d1 = {
    prepare: (sql: string) => new Statement(db, sql),
    async batch(statements: Statement[]) {
      db.exec("BEGIN");
      try {
        for (const s of statements) s.runSync();
        db.exec("COMMIT");
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
      return statements.map(() => ({ success: true }));
    },
  };
  return d1 as unknown as D1Database;
}
