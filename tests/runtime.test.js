import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { once } from "node:events";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// Os testes de API em memória não ativam o canal de dependências do --watch.
// Este teste inicia o mesmo modo usado por npm run dev em um banco isolado.
test(
  "servidor --watch ignora avisos internos, calcula, refina e recupera após falha",
  { timeout: 25000 },
  async () => {
    const root = fileURLToPath(new URL("../", import.meta.url)),
      temp = mkdtempSync(join(tmpdir(), "corte-watch-")),
      probe = createServer();
    await new Promise((resolve) => probe.listen(0, "127.0.0.1", resolve));
    const port = probe.address().port;
    await new Promise((resolve) => probe.close(resolve));
    const child = spawn(
      process.execPath,
      ["--watch", "src/server.js", "--port", String(port)],
      {
        cwd: root,
        env: {
          ...process.env,
          DB_PATH: join(temp, "test.sqlite"),
          APP_ORIGIN: "",
          COOKIE_SECURE: "false",
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    const exit = once(child, "exit");
    let logs = "",
      cookie = "";
    child.stdout.on("data", (data) => {
      logs += data;
    });
    child.stderr.on("data", (data) => {
      logs += data;
    });
    const base = `http://127.0.0.1:${port}`;
    async function request(path, method = "GET", body) {
      const response = await fetch(base + path, {
        method,
        headers: {
          ...(cookie ? { cookie } : {}),
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(10000),
      });
      if (response.headers.has("set-cookie"))
        cookie = response.headers.get("set-cookie").split(";")[0];
      return { status: response.status, body: await response.json() };
    }
    try {
      let ready = false;
      for (let attempt = 0; attempt < 100; attempt++) {
        try {
          if ((await request("/health")).status === 200) {
            ready = true;
            break;
          }
        } catch {}
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      assert.ok(ready, logs);
      assert.equal(
        (
          await request("/api/auth/register", "POST", {
            nome: "Teste",
            empresa: "Oficina teste",
            email: "watch@example.test",
            senha: "teste-watch-1234",
          })
        ).status,
        201,
      );
      const project = (
          await request("/api/projetos", "POST", {
            nome: "Plano em desenvolvimento",
          })
        ).body.dados,
        url = `/api/projetos/${project.id}`;
      assert.equal(
        (
          await request(url + "/importar", "POST", {
            xml: readFileSync(
              new URL("../exemplos/projeto-demonstracao.xml", import.meta.url),
              "utf8",
            ),
            versao: project.versao,
            substituir: true,
          })
        ).status,
        200,
      );
      const first = await request(url + "/otimizar", "POST", { tentativas: 8 });
      assert.equal(first.status, 201, JSON.stringify(first.body) + logs);
      assert.equal(first.body.dados.boards.flatMap((b) => b.pieces).length, 9);
      assert.ok(first.body.dados.steps.length > 0);
      const refined = await request(url + "/otimizar", "POST", {
        tentativas: 8,
        planoBaseId: first.body.dados.id,
      });
      assert.equal(refined.status, 201, JSON.stringify(refined.body) + logs);
      assert.equal(refined.body.dados.search.planoBaseConsiderado, true);
      const piece = (await request(url + "/pecas")).body.dados[0];
      assert.equal(
        (
          await request(url + `/pecas/${piece.id}`, "PUT", {
            ...piece,
            largura: 9000,
          })
        ).status,
        200,
      );
      const failed = await request(url + "/otimizar", "POST", {
        tentativas: 2,
      });
      assert.equal(failed.status, 422, JSON.stringify(failed.body) + logs);
      assert.match(failed.body.erro, /não coube/);
      const current = (await request(url + "/pecas")).body.dados.find(
        (p) => p.id === piece.id,
      );
      assert.equal(
        (
          await request(url + `/pecas/${piece.id}`, "PUT", {
            ...current,
            largura: piece.largura,
          })
        ).status,
        200,
      );
      assert.equal(
        (await request(url + "/otimizar", "POST", { tentativas: 8 })).status,
        201,
      );
      assert.doesNotMatch(logs, /TypeError|reading 'boards'/);
    } finally {
      child.kill("SIGTERM");
      const force = setTimeout(() => child.kill("SIGKILL"), 4000);
      try {
        await exit;
      } finally {
        clearTimeout(force);
        rmSync(temp, { recursive: true, force: true });
      }
    }
  },
);
