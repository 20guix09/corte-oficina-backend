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
      const pdf = r.headers.get("content-type")?.startsWith("application/pdf");
      const bytes = pdf ? Buffer.from(await r.arrayBuffer()) : undefined;
      return {
        bytes,
        status: r.status,
        headers: r.headers,
        body: r.status === 204 || pdf ? {} : await r.json(),
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

test("XML cadastra chapas e reutiliza configuração existente em outro pedido", async (t) => {
  const { client } = await start(t),
    c = client();
  await register(c);
  const xml = readFileSync(
    new URL("../exemplos/projeto-demonstracao.xml", import.meta.url),
    "utf8",
  );
  const create = async (nome) =>
    (await c("/api/projetos", "POST", { nome })).body.dados;
  const a = await create("Pedido A");
  const imported = await c(`/api/projetos/${a.id}/importar`, "POST", {
    versao: a.versao,
    xml,
    substituir: true,
  });
  assert.equal(imported.status, 200);
  assert.equal(imported.body.chapasCriadas, 1);
  const stocks = (await c("/api/materiais")).body.dados;
  assert.equal(stocks.length, 1);
  assert.equal(stocks[0].largura, 1830);
  assert.equal(stocks[0].comprimento, 2750);
  assert.equal(stocks[0].giroPadrao, true);
  await c("/api/materiais/" + stocks[0].id, "PUT", {
    ...stocks[0],
    custo: 500,
    refilos: { esquerda: 10, direita: 10, superior: 10, inferior: 10 },
  });
  const b = await create("Pedido B");
  const next = await c(`/api/projetos/${b.id}/importar`, "POST", {
    versao: b.versao,
    xml,
    substituir: true,
  });
  assert.equal(next.body.chapasCriadas, 0);
  assert.equal(next.body.chapasReutilizadas, 1);
  const reused = (await c("/api/materiais")).body.dados;
  assert.equal(reused.length, 1);
  assert.equal(reused[0].id, stocks[0].id);
  assert.equal(reused[0].custo, 500);
  assert.equal(reused[0].refilos.esquerda, 10);
  const parts = (await c(`/api/projetos/${b.id}/pecas`)).body.dados;
  assert.ok(parts.every((p) => p.giroPermitido && p.giroOrigem === "material"));
  const calculated = await c(`/api/projetos/${b.id}/otimizar`, "POST", {
    tentativas: 4,
  });
  assert.equal(calculated.status, 201, JSON.stringify(calculated.body));
  assert.equal(calculated.body.dados.metrics.custoChapas, 500);
});
test("histórico antigo sem resumo não bloqueia projeto e resumo válido é recuperado", async (t) => {
  const { client, system } = await start(t),
    c = client();
  await register(c);
  const { url, p } = await prepare(c);
  const plan = (await c(url + "/otimizar", "POST", { tentativas: 2 })).body
      .dados,
    company =
      system.store.accounts.findByEmail("admin@example.test").company_id;
  const stored = system.store.get(company, "plan", plan.id);
  delete stored.metrics;
  system.store.update(company, "plan", plan.id, stored, stored.versao);
  const incomplete = system.store.create(
    company,
    "plan",
    { projetoId: p.id, status: "rascunho" },
    p.id,
  );
  const history = await c(url + "/planos");
  assert.equal(history.status, 200);
  assert.equal(
    history.body.dados.find((x) => x.id === plan.id).metrics.chapasNovas,
    1,
  );
  assert.equal(
    history.body.dados.find((x) => x.id === incomplete.id).relatorioDisponivel,
    false,
  );
  assert.equal((await c(url)).status, 200);
});
test("relatório PDF e origem de sobras por chapa, sem criar estoque só ao otimizar", async (t) => {
  const { client } = await start(t),
    c = client();
  await register(c);
  const { url } = await prepare(c);
  let p = (await c(url + "/otimizar", "POST", { tentativas: 2 })).body.dados;
  assert.equal((await c("/api/retalhos")).body.dados.length, 0);
  const report = (await c(url + `/planos/${p.id}/relatorio`)).body.dados;
  assert.equal(report.boards.length, p.boards.length);
  assert.equal(report.boards[0].summary.pecas, 3);
  assert.equal(
    report.boards[0].summary.quantidadeSobras,
    p.boards[0].retalhos.length,
  );
  const pdf = await c(url + `/planos/${p.id}/relatorio.pdf`);
  assert.equal(pdf.status, 200);
  assert.equal(pdf.bytes.subarray(0, 5).toString(), "%PDF-");
  assert.ok(pdf.headers.get("content-disposition").includes(".pdf"));
  p = (await c(url + `/planos/${p.id}/aprovar`, "POST", { versao: p.versao }))
    .body.dados;
  const scraps = (
    await c(url + `/planos/${p.id}/retalhos`, "POST", {
      versao: p.versao,
      produzidos: true,
      local: "Estante A",
    })
  ).body.dados;
  assert.ok(scraps.length);
  assert.ok(
    scraps.every(
      (s) =>
        s.origemProjeto === "Cozinha" &&
        s.origemChapaNumero === 1 &&
        s.origemPlanoId === p.id,
    ),
  );
  const second = (await c("/api/projetos", "POST", { nome: "Reuso" })).body
    .dados;
  await c(`/api/projetos/${second.id}/pecas`, "POST", {
    ...piece,
    largura: 200,
    comprimento: 200,
    quantidade: 1,
  });
  const reused = await c(`/api/projetos/${second.id}/otimizar`, "POST", {
    tentativas: 2,
  });
  assert.equal(reused.status, 201, JSON.stringify(reused.body));
  assert.equal(reused.body.dados.metrics.retalhosUsados, 1);
  assert.equal(reused.body.dados.metrics.chapasNovas, 0);
});
test("cores com veio mantêm giro bloqueado e fornecedores distintos não se misturam", async (t) => {
  const { client } = await start(t),
    c = client();
  await register(c);
  let xml = readFileSync(
    new URL("../exemplos/projeto-demonstracao.xml", import.meta.url),
    "utf8",
  ).replaceAll('REFERENCE="Branco"', 'REFERENCE="Carvalho"');
  for (const supplier of ["Fornecedor A", "Fornecedor B"]) {
    const p = (await c("/api/projetos", "POST", { nome: supplier })).body.dados;
    const withSupplier = xml.replaceAll(
      "<THICKNESS",
      '<SUPPLIER REFERENCE="' + supplier + '"/><THICKNESS',
    );
    assert.equal(
      (
        await c(`/api/projetos/${p.id}/importar`, "POST", {
          versao: p.versao,
          xml: withSupplier,
          substituir: true,
        })
      ).status,
      200,
    );
    assert.ok(
      (await c(`/api/projetos/${p.id}/pecas`)).body.dados.every(
        (x) => !x.giroPermitido,
      ),
    );
  }
  const materials = (await c("/api/materiais")).body.dados;
  assert.equal(materials.length, 2);
  assert.notEqual(materials[0].fornecedor, materials[1].fornecedor);
});

test("projeto importado na versão anterior é preparado sem perder conta e peças", async (t) => {
  const { client, system } = await start(t),
    c = client();
  await register(c);
  const p = (await c("/api/projetos", "POST", { nome: "Legado" })).body.dados;
  const xml = readFileSync(
    new URL("../exemplos/projeto-demonstracao.xml", import.meta.url),
    "utf8",
  );
  await c(`/api/projetos/${p.id}/importar`, "POST", {
    versao: p.versao,
    xml,
    substituir: true,
  });
  const company =
    system.store.accounts.findByEmail("admin@example.test").company_id;
  for (const row of system.store.list(company, "piece", p.id)) {
    delete row.giroOrigem;
    row.giroPermitido = false;
    system.store.update(company, "piece", row.id, row, row.versao);
  }
  const prepared = await c(`/api/projetos/${p.id}/preparar-chapas`, "POST", {});
  assert.equal(prepared.body.pecasAtualizadas, 3);
  const again = await c(`/api/projetos/${p.id}/preparar-chapas`, "POST", {});
  assert.equal(again.body.pecasAtualizadas, 0);
  assert.equal((await c(`/api/projetos/${p.id}/pecas`)).body.dados.length, 3);
  assert.equal((await c("/api/auth/me")).status, 200);
});

test("relatório histórico preserva ficha original das peças após revisão do projeto", async (t) => {
  const { client } = await start(t),
    c = client();
  await register(c);
  const { url } = await prepare(c);
  const p = (await c(url + "/otimizar", "POST", { tentativas: 4 })).body.dados;
  assert.ok(p.pecasSnapshot?.length);
  const original = (await c(url + "/pecas")).body.dados[0];
  await c(url + "/pecas/" + original.id, "PUT", {
    ...original,
    descricao: "Outra descrição",
    largura: 100,
    comprimento: 100,
  });
  const report = (await c(url + `/planos/${p.id}/relatorio`)).body.dados;
  assert.equal(report.boards[0].pieces[0].descricao, "Porta");
  assert.equal(
    report.boards[0].pieces[0].w * report.boards[0].pieces[0].h,
    600 * 400,
  );
  assert.equal(
    report.boards[0].legend[0].w * report.boards[0].legend[0].h,
    600 * 400,
  );
});

test("edição manual recalcula análise de materiais e não mantém pesquisa antiga", async (t) => {
  const { client } = await start(t),
    c = client();
  await register(c);
  const { url } = await prepare(c);
  const p = (await c(url + "/otimizar", "POST", { tentativas: 8 })).body.dados;
  assert.equal(p.analysis.chapasNovas, 1);
  const boards = p.boards.map((b) => ({
    id: b.id,
    source: b.stock.source,
    sourceId: b.stock.id,
    pieces: structuredClone(b.pieces),
  }));
  const moved = boards[0].pieces.pop();
  boards.push({
    id: "chapa-extra",
    source: boards[0].source,
    sourceId: boards[0].sourceId,
    pieces: [moved],
  });
  const edited = await c(url + `/planos/${p.id}`, "PUT", {
    versao: p.versao,
    boards,
  });
  assert.equal(edited.status, 201, JSON.stringify(edited.body));
  const next = edited.body.dados;
  assert.equal(next.metrics.chapasNovas, 2);
  assert.equal(next.analysis.chapasNovas, 2);
  assert.equal(next.analysis.minimoChapasComprovado, false);
  assert.deepEqual(
    next.analysis.grupos[0].chapas,
    boards.map((b) => b.id),
  );
  assert.match(next.search.metodo, /manual/);
  assert.equal(next.search.tentativas, undefined);
});

test("melhorar plano aprovado reutiliza só as reservas do mesmo pedido", async (t) => {
  const { client } = await start(t),
    c = client();
  await register(c);
  const { url } = await prepare(c);
  const scrap = (
    await c("/api/retalhos", "POST", { ...material, codigo: "S1", local: "A" })
  ).body.dados;
  const first = (await c(url + "/otimizar", "POST", { tentativas: 8 })).body
    .dados;
  const approved = await c(url + `/planos/${first.id}/aprovar`, "POST", {
    versao: first.versao,
  });
  assert.equal(approved.status, 200);
  const reservedBefore = (await c("/api/retalhos")).body.dados.find(
    (s) => s.id === scrap.id,
  );
  const secondProject = (
    await c("/api/projetos", "POST", { nome: "Outro pedido" })
  ).body.dados;
  await c(`/api/projetos/${secondProject.id}/pecas`, "POST", piece);
  const other = (
    await c(`/api/projetos/${secondProject.id}/otimizar`, "POST", {
      tentativas: 8,
    })
  ).body.dados;
  assert.equal(other.metrics.retalhosUsados, 0);
  const refined = await c(url + "/otimizar", "POST", {
    tentativas: 8,
    planoBaseId: first.id,
  });
  assert.equal(refined.status, 201, JSON.stringify(refined.body));
  const next = refined.body.dados;
  assert.equal(next.search.planoBaseConsiderado, true);
  assert.equal(next.metrics.chapasNovas, 0);
  assert.equal(next.metrics.retalhosUsados, 1);
  assert.equal(next.analysis.limiteInferiorChapasNovas, 0);
  assert.equal(next.analysis.minimoChapasComprovado, true);
  assert.deepEqual(
    (await c("/api/retalhos")).body.dados.find((s) => s.id === scrap.id),
    reservedBefore,
  );
  const final = await c(url + `/planos/${next.id}/aprovar`, "POST", {
    versao: next.versao,
  });
  assert.equal(final.status, 200, JSON.stringify(final.body));
  assert.equal(
    (await c("/api/retalhos")).body.dados.find((s) => s.id === scrap.id)
      .reservadoPor,
    next.id,
  );
});

test("mudar fornecedor da sobra depois do cálculo impede aprovação antiga", async (t) => {
  const { client } = await start(t),
    c = client();
  await register(c);
  const { url } = await prepare(c);
  const scrap = (
    await c("/api/retalhos", "POST", { ...material, codigo: "S1", local: "A" })
  ).body.dados;
  const p = (await c(url + "/otimizar", "POST", { tentativas: 4 })).body.dados;
  assert.equal(p.metrics.retalhosUsados, 1);
  assert.equal(
    (
      await c(`/api/retalhos/${scrap.id}`, "PUT", {
        ...scrap,
        fornecedor: "Outro fornecedor",
      })
    ).status,
    200,
  );
  assert.equal(
    (await c(url + `/planos/${p.id}/aprovar`, "POST", { versao: p.versao }))
      .status,
    409,
  );
});
