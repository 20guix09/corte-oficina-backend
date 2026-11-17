import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSystem } from "../src/app.js";
async function start(t, dbPath = ":memory:", options = {}) {
  const system = createSystem({ dbPath, ...options }),
    server = system.app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const base = "http://127.0.0.1:" + server.address().port;
  let stopped = false;
  async function close() {
    if (stopped) return;
    stopped = true;
    await new Promise((r) => server.close(r));
    await system.close();
  }
  t.after(close);
  function client() {
    let cookie = "";
    return async (url, method = "GET", body) => {
      const r = await fetch(base + url, {
        method,
        headers: {
          ...(cookie ? { Cookie: cookie } : {}),
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (r.headers.has("set-cookie"))
        cookie = r.headers.get("set-cookie").split(";")[0];
      return {
        status: r.status,
        headers: r.headers,
        body: r.status === 204 ? {} : await r.json(),
      };
    };
  }
  return { client, close, system, base };
}
async function register(c, email = "admin@example.test") {
  assert.equal(
    (
      await c("/api/auth/register", "POST", {
        nome: "Administrador",
        empresa: "Oficina teste",
        email,
        senha: "senha-teste-1234",
      })
    ).status,
    201,
  );
}
const piece = {
  codigo: "A",
  descricao: "Porta",
  largura: 600,
  comprimento: 400,
  espessura: 15,
  quantidade: 3,
  material: "MDF",
  acabamento: "Branco",
  giroPermitido: false,
};
const material = {
  material: "MDF",
  acabamento: "Branco",
  espessura: 15,
  comprimento: 2750,
  largura: 1850,
  custo: 500,
  refilos: { esquerda: 15, direita: 15, superior: 15, inferior: 15 },
};
async function prepare(c) {
  const p = (await c("/api/projetos", "POST", { nome: "Cozinha" })).body.dados;
  await c(`/api/projetos/${p.id}/pecas`, "POST", piece);
  const m = (await c("/api/materiais", "POST", material)).body.dados;
  return {
    p: (await c("/api/projetos/" + p.id)).body.dados,
    m,
    url: "/api/projetos/" + p.id,
  };
}
test("login, isolamento de empresas e perfis de consulta", async (t) => {
  const { client } = await start(t),
    a = client(),
    b = client(),
    op = client();
  assert.equal((await a("/api/projetos")).status, 401);
  await register(a);
  await register(b, "b@example.test");
  const { p, url } = await prepare(a);
  assert.equal((await b(url)).status, 404);
  assert.equal((await b("/api/projetos")).body.dados.length, 0);
  assert.equal(
    (
      await a("/api/equipe", "POST", {
        nome: "Operador",
        email: "op@example.test",
        senha: "senha-teste-1234",
        perfil: "operador",
      })
    ).status,
    201,
  );
  assert.equal(
    (
      await op("/api/auth/login", "POST", {
        email: "op@example.test",
        senha: "senha-teste-1234",
      })
    ).status,
    200,
  );
  assert.equal((await op(url)).body.dados.id, p.id);
  assert.equal(
    (await op("/api/projetos", "POST", { nome: "Negado" })).status,
    403,
  );
  assert.equal((await op("/api/equipe")).status, 403);
  assert.equal((await a("/api/auth/logout", "POST")).status, 204);
  assert.equal((await a(url)).status, 401);
});
test("persistência real após reiniciar SQLite e senha não fica em texto", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "corte-test-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const db = join(dir, "db.sqlite");
  const first = await start(t, db),
    a = first.client();
  await register(a);
  const { p } = await prepare(a);
  const stored = first.system.store.db
    .prepare("SELECT password FROM users")
    .get().password;
  assert.notEqual(stored, "senha-teste-1234");
  assert.ok(stored.includes(":"));
  await first.close();
  const second = await start(t, db),
    b = second.client();
  await b("/api/auth/login", "POST", {
    email: "admin@example.test",
    senha: "senha-teste-1234",
  });
  assert.equal((await b("/api/projetos/" + p.id)).body.dados.nome, "Cozinha");
});
test("importação inválida é atômica e edição controla versões", async (t) => {
  const { client } = await start(t),
    c = client();
  await register(c);
  const { p, url } = await prepare(c);
  const bad = await c(url + "/importar", "POST", {
    versao: p.versao,
    xml: "<errado/>",
    substituir: true,
  });
  assert.equal(bad.status, 400);
  assert.equal((await c(url + "/pecas")).body.dados.length, 1);
  const current = (await c(url)).body.dados;
  assert.equal(
    (await c(url, "PUT", { nome: "Novo", versao: current.versao - 1 })).status,
    409,
  );
  assert.equal(
    (await c(url, "PUT", { nome: "Novo", versao: current.versao })).status,
    200,
  );
  assert.equal(
    (await c(url, "PUT", { nome: "Stale", versao: current.versao })).status,
    409,
  );
  assert.equal(
    (await c(url + "/pecas", "POST", { ...piece, largura: 0 })).status,
    400,
  );
  assert.equal(
    (await c(url + "/pecas", "POST", { ...piece, quantidade: 1.5 })).status,
    400,
  );
  const xml = readFileSync(
      new URL("../exemplos/projeto-demonstracao.xml", import.meta.url),
      "utf8",
    ),
    version = (await c(url)).body.dados.versao;
  const imported = await c(url + "/importar", "POST", {
    versao: version,
    xml,
    substituir: true,
  });
  assert.equal(imported.status, 200);
  assert.equal(imported.body.unidades, 9);
});
test("otimização, edição manual inválida, aprovação e registro único de sobras", async (t) => {
  const { client } = await start(t),
    c = client();
  await register(c);
  const { url, p } = await prepare(c);
  const generated = await c(url + "/otimizar", "POST", {
    confirmado: true,
    tentativas: 4,
  });
  assert.equal(generated.status, 201, JSON.stringify(generated.body));
  let plan = generated.body.dados;
  assert.equal((await c(url + `/planos/${plan.id}/exportar`)).status, 409);
  const boards = plan.boards.map((b) => ({
    id: b.id,
    source: b.stock.source,
    sourceId: b.stock.id,
    pieces: b.pieces.map((q) => ({
      unitId: q.unitId,
      x: q.x,
      y: q.y,
      w: q.w,
      h: q.h,
    })),
  }));
  const bad = structuredClone(boards);
  bad[0].pieces[0].x = -1;
  assert.equal(
    (
      await c(url + `/planos/${plan.id}`, "PUT", {
        versao: plan.versao,
        boards: bad,
      })
    ).status,
    400,
  );
  const manual = await c(url + "/planos/manual", "POST", {
    projectVersion: p.versao,
    boards,
  });
  assert.equal(manual.status, 201, JSON.stringify(manual.body));
  let approved = await c(url + `/planos/${plan.id}/aprovar`, "POST", {
    versao: plan.versao,
  });
  assert.equal(approved.status, 200, JSON.stringify(approved.body));
  plan = approved.body.dados;
  assert.equal(
    (await c(url + `/planos/${plan.id}/exportar`)).body.formato,
    "plano-interno-corte-oficina-v1",
  );
  const produced = await c(url + `/planos/${plan.id}/retalhos`, "POST", {
    versao: plan.versao,
    produzidos: true,
    local: "Prateleira A",
  });
  assert.equal(produced.status, 201, JSON.stringify(produced.body));
  assert.ok(produced.body.dados.length > 0);
  assert.equal(
    (
      await c(url + `/planos/${plan.id}/retalhos`, "POST", {
        versao: plan.versao,
        produzidos: true,
        local: "A",
      })
    ).status,
    409,
  );
  const final = (await c(url + "/planos")).body.dados.find(
    (q) => q.id === plan.id,
  );
  assert.equal(
    (
      await c(url + `/planos/${plan.id}`, "PUT", {
        versao: final.versao,
        boards,
      })
    ).status,
    409,
  );
});
test("reserva de sobra é transacional e mudar peças libera reserva", async (t) => {
  const { client } = await start(t),
    c = client();
  await register(c);
  const { url } = await prepare(c);
  const scrap = (
    await c("/api/retalhos", "POST", {
      ...material,
      codigo: "S1",
      local: "Estante A",
    })
  ).body.dados;
  const plan = (
    await c(url + "/otimizar", "POST", { confirmado: true, tentativas: 3 })
  ).body.dados;
  assert.equal(plan.metrics.retalhosUsados, 1);
  const approved = (
    await c(url + `/planos/${plan.id}/aprovar`, "POST", { versao: plan.versao })
  ).body.dados;
  assert.equal(approved.status, "aprovado");
  const reserved = (await c("/api/retalhos")).body.dados.find(
    (s) => s.id === scrap.id,
  );
  assert.equal(reserved.status, "reservado");
  assert.equal(
    (await c(`/api/retalhos/${scrap.id}`, "DELETE", undefined)).status,
    409,
  );
  const lines = (await c(url + "/pecas")).body.dados;
  await c(url + `/pecas/${lines[0].id}`, "PUT", { ...lines[0], quantidade: 2 });
  assert.equal(
    (await c("/api/retalhos")).body.dados.find((s) => s.id === scrap.id).status,
    "disponivel",
  );
  assert.equal((await c(url + `/planos/${plan.id}/exportar`)).status, 409);
});
test("duas empresas não podem montar plano com estoque de outra", async (t) => {
  const { client } = await start(t),
    a = client(),
    b = client();
  await register(a);
  await register(b, "b@example.test");
  const pa = await prepare(a),
    pb = await prepare(b);
  const parts = (await b(pb.url + "/pecas")).body.dados;
  const result = await b(pb.url + "/planos/manual", "POST", {
    projectVersion: pb.p.versao,
    boards: [
      {
        id: "s",
        source: "material",
        sourceId: pa.m.id,
        pieces: [{ unitId: parts[0].id + ":1", x: 15, y: 15, w: 600, h: 400 }],
      },
    ],
  });
  assert.equal(result.status, 404);
});
test("conteúdo inválido, origem cruzada e alteração de senha", async (t) => {
  const { client, base } = await start(t),
    c = client();
  await register(c);
  assert.equal(
    (
      await fetch(base + "/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await fetch(base + "/api/auth/login", {
        method: "POST",
        headers: {
          Origin: "https://other.invalid",
          "Content-Type": "application/json",
        },
        body: "{}",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await c("/api/auth/password", "PUT", {
        atual: "senha-teste-1234",
        nova: "nova-senha-123456",
      })
    ).status,
    200,
  );
  assert.equal((await c("/api/auth/me")).status, 401);
  assert.equal(
    (
      await c("/api/auth/login", "POST", {
        email: "admin@example.test",
        senha: "nova-senha-123456",
      })
    ).status,
    200,
  );
});
test("editar um plano aprovado cria revisão e revoga aprovação antiga", async (t) => {
  const { client } = await start(t),
    c = client();
  await register(c);
  const { url } = await prepare(c);
  let p = (
    await c(url + "/otimizar", "POST", { confirmado: true, tentativas: 2 })
  ).body.dados;
  p = (await c(url + `/planos/${p.id}/aprovar`, "POST", { versao: p.versao }))
    .body.dados;
  const boards = p.boards.map((b) => ({
    id: b.id,
    source: b.stock.source,
    sourceId: b.stock.id,
    pieces: b.pieces,
  }));
  const edited = await c(url + `/planos/${p.id}`, "PUT", {
    versao: p.versao,
    boards,
  });
  assert.equal(edited.status, 201);
  assert.notEqual(edited.body.dados.id, p.id);
  assert.equal(edited.body.dados.status, "revisao");
  assert.equal((await c(url + `/planos/${p.id}/exportar`)).status, 409);
});
test("mudança de parâmetros após cálculo exige nova revisão antes de aprovar", async (t) => {
  const { client } = await start(t),
    c = client();
  await register(c);
  const { url } = await prepare(c);
  const p = (
    await c(url + "/otimizar", "POST", { confirmado: true, tentativas: 2 })
  ).body.dados;
  const m = (await c("/api/maquina")).body.dados;
  await c("/api/maquina", "PUT", { ...m, serra: 4.5 });
  assert.equal(
    (await c(url + `/planos/${p.id}/aprovar`, "POST", { versao: p.versao }))
      .status,
    409,
  );
});

test("origem pública configurada permite proxy e rejeita origem diferente", async (t) => {
  const { base } = await start(t, ":memory:", {
    appOrigin: "https://oficina.example.test",
  });
  const request = (origin) =>
    fetch(base + "/api/auth/login", {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify({ email: "a@example.test", senha: "inexistente" }),
    });
  assert.equal((await request("https://oficina.example.test")).status, 401);
  assert.equal((await request("https://outra.example.test")).status, 403);
});
