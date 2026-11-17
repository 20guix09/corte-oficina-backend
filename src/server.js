import { createSystem } from "./app.js";
const portIndex = process.argv.indexOf("--port");
const port = Number(
  portIndex >= 0 ? process.argv[portIndex + 1] : process.env.PORT || 3000,
);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("PORT inválida.");
const system = createSystem({
  dbPath: process.env.DB_PATH || "./data/corte.sqlite",
  secureCookie: process.env.COOKIE_SECURE === "true",
  appOrigin: process.env.APP_ORIGIN || "",
});
const server = system.app.listen(port, "0.0.0.0", () =>
  console.log(
    `Corte Oficina em http://localhost:${port} — banco SQLite persistente.`,
  ),
);
server.on("error", (error) => {
  console.error(error.message);
  system.close();
  process.exitCode = 1;
});
for (const signal of ["SIGTERM", "SIGINT"])
  process.once(signal, () =>
    server.close(async () => {
      await system.close();
      process.exit(0);
    }),
  );
