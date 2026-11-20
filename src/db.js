import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { ensure } from "./errors.js";
import { createAccountRepository } from "./repositories/accounts.js";

export function openStore(path = ":memory:") {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS companies (id TEXT PRIMARY KEY, name TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(id), name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, password TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('admin','planejador','operador')));
    CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS records (id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(id), kind TEXT NOT NULL CHECK(kind IN ('project','piece','material','scrap','machine','plan')), project_id TEXT REFERENCES records(id) ON DELETE CASCADE, data TEXT NOT NULL CHECK(json_valid(data)), version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS records_scope ON records(company_id,kind,project_id);
    CREATE TABLE IF NOT EXISTS recovery (user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, hash TEXT NOT NULL UNIQUE, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS google_accounts (subject TEXT PRIMARY KEY, user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE);
    CREATE TABLE IF NOT EXISTS onboarding (company_id TEXT PRIMARY KEY REFERENCES companies(id), phone TEXT, notice_version TEXT, accepted_at TEXT);
    PRAGMA user_version=2;`);
  function decode(row) {
    return (
      row && {
        ...JSON.parse(row.data),
        id: row.id,
        versao: row.version,
        criadoEm: row.created_at,
        atualizadoEm: row.updated_at,
      }
    );
  }
  function get(company, kind, id) {
    const result = decode(
      db
        .prepare("SELECT * FROM records WHERE company_id=? AND kind=? AND id=?")
        .get(company, kind, id),
    );
    ensure(result, "Registro não encontrado.", 404);
    return result;
  }
  function list(company, kind, projectId) {
    const rows =
      projectId === undefined
        ? db
            .prepare(
              "SELECT * FROM records WHERE company_id=? AND kind=? ORDER BY created_at,id",
            )
            .all(company, kind)
        : db
            .prepare(
              "SELECT * FROM records WHERE company_id=? AND kind=? AND project_id=? ORDER BY created_at,id",
            )
            .all(company, kind, projectId);
    return rows.map(decode);
  }
  function create(company, kind, data, projectId = null) {
    const id = randomUUID(),
      now = new Date().toISOString();
    db.prepare("INSERT INTO records VALUES (?,?,?,?,?,1,?,?)").run(
      id,
      company,
      kind,
      projectId,
      JSON.stringify(data),
      now,
      now,
    );
    return get(company, kind, id);
  }
  function update(company, kind, id, data, version) {
    integerVersion(version);
    const result = db
      .prepare(
        "UPDATE records SET data=?,version=version+1,updated_at=? WHERE company_id=? AND kind=? AND id=? AND version=?",
      )
      .run(
        JSON.stringify(data),
        new Date().toISOString(),
        company,
        kind,
        id,
        version,
      );
    ensure(
      result.changes === 1,
      "O registro mudou. Recarregue antes de salvar.",
      409,
    );
    return get(company, kind, id);
  }
  function remove(company, kind, id, version) {
    integerVersion(version);
    const result = db
      .prepare(
        "DELETE FROM records WHERE company_id=? AND kind=? AND id=? AND version=?",
      )
      .run(company, kind, id, version);
    ensure(
      result.changes === 1,
      "O registro mudou ou foi excluído. Recarregue.",
      409,
    );
  }
  function transaction(action) {
    db.exec("BEGIN IMMEDIATE");
    try {
      const result = action();
      db.exec("COMMIT");
      return result;
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
  function touchProject(company, id) {
    const project = get(company, "project", id);
    return update(
      company,
      "project",
      id,
      { ...project, status: "rascunho" },
      project.versao,
    );
  }
  return {
    db,
    accounts: createAccountRepository(db),
    get,
    list,
    create,
    update,
    remove,
    transaction,
    touchProject,
  };
}
function integerVersion(value) {
  ensure(
    Number.isSafeInteger(value) && value > 0,
    "Informe a versão atual do registro.",
  );
}
