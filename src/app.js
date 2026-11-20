import express from "express";
import { registerApi } from "./routes/api.js";
import { fileURLToPath } from "node:url";
import { openStore } from "./db.js";
import { ApiError, ensure } from "./errors.js";
import * as v from "./validation.js";

export function createSystem({
  dbPath = ":memory:",
  secureCookie = false,
  appOrigin = "",
  providers = {},
} = {}) {
  const store = openStore(dbPath),
    app = express();
  const expectedOrigin = appOrigin ? new URL(appOrigin).origin : null;
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    res.set({
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "same-origin",
      "Content-Security-Policy":
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'; object-src 'none'; base-uri 'self'",
    });
    if (req.path.startsWith("/api")) res.set("Cache-Control", "no-store");
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      req.headers.origin
    ) {
      let same = false;
      try {
        const received = new URL(req.headers.origin);
        same = expectedOrigin
          ? received.origin === expectedOrigin
          : received.host === req.get("host");
      } catch {}
      if (!same)
        return res
          .status(403)
          .json({ erro: "Origem da requisição não autorizada." });
    }
    next();
  });
  app.use(express.json({ limit: "5mb", strict: false }));
  app.use("/api", (req, res, next) => {
    if (["POST", "PUT"].includes(req.method) && req.path !== "/auth/logout") {
      ensure(
        req.is("application/json"),
        "Envie Content-Type application/json.",
        415,
      );
      v.object(req.body);
    }
    next();
  });
  app.get("/health", (req, res) =>
    res.json({ status: "ok", versao: "1.4.0-piloto", armazenamento: "sqlite" }),
  );
  const attempts = new Map();
  app.use("/api/auth", (req, res, next) => {
    if (!(req.method === "POST" && ["/login", "/register", "/forgot", "/reset"].includes(req.path)) && req.path !== "/google/start")
      return next();
    const key = req.ip,
      now = Date.now();
    if (attempts.size > 1000)
      for (const [id, row] of attempts)
        if (row.until < now) attempts.delete(id);
    const row = attempts.get(key) || { n: 0, until: now + 900000 };
    if (row.until < now) {
      row.n = 0;
      row.until = now + 900000;
    }
    row.n++;
    attempts.set(key, row);
    if (row.n > 30)
      return res
        .status(429)
        .json({ erro: "Muitas tentativas. Aguarde 15 minutos." });
    next();
  });
  const api = registerApi(app, store, { secureCookie, appOrigin:expectedOrigin, providers });
  app.use("/api", (req, res) =>
    res.status(404).json({ erro: "Rota não encontrada." }),
  );
  app.use(express.static(fileURLToPath(new URL("../public", import.meta.url))));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error instanceof ApiError)
      return res
        .status(error.status)
        .json({ erro: error.message, detalhes: error.details });
    if (error.type === "entity.parse.failed")
      return res.status(400).json({ erro: "JSON inválido." });
    if (error.type === "entity.too.large")
      return res.status(413).json({ erro: "Arquivo ou JSON excede 5 MB." });
    console.error(error);
    res
      .status(500)
      .json({ erro: "Erro interno. Consulte o terminal do servidor." });
  });
  return {
    app,
    store,
    close: async () => {
      await api.close();
      store.db.close();
    },
  };
}
