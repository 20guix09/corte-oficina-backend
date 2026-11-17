// Acesso a empresas, pessoas e sessões. Nenhuma regra HTTP nesta camada.
export function createAccountRepository(db) {
  return {
    findByEmail: (email) =>
      db.prepare("SELECT * FROM users WHERE email=?").get(email),
    createCompany: (id, name) =>
      db.prepare("INSERT INTO companies VALUES (?,?)").run(id, name),
    createUser: (id, company, name, email, password, role) =>
      db
        .prepare("INSERT INTO users VALUES (?,?,?,?,?,?)")
        .run(id, company, name, email, password, role),
    listUsers: (company) =>
      db
        .prepare("SELECT id,name,email,role FROM users WHERE company_id=?")
        .all(company),
    getPassword: (id) =>
      db.prepare("SELECT password FROM users WHERE id=?").get(id).password,
    updatePassword: (id, password) =>
      db.prepare("UPDATE users SET password=? WHERE id=?").run(password, id),
    clearExpired: (now) =>
      db.prepare("DELETE FROM sessions WHERE expires<=?").run(now),
    addSession: (hash, userId, expires) =>
      db
        .prepare("INSERT INTO sessions VALUES (?,?,?)")
        .run(hash, userId, expires),
    removeSession: (hash) =>
      db.prepare("DELETE FROM sessions WHERE hash=?").run(hash),
    removeUserSessions: (id) =>
      db.prepare("DELETE FROM sessions WHERE user_id=?").run(id),
    findSession: (hash, now) =>
      db
        .prepare(
          "SELECT u.id,u.company_id,u.name,u.email,u.role,c.name AS company FROM sessions s JOIN users u ON u.id=s.user_id JOIN companies c ON c.id=u.company_id WHERE s.hash=? AND s.expires>?",
        )
        .get(hash, now),
  };
}
