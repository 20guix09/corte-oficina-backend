import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { readFileSync } from "node:fs";
import { createSystem } from "../src/app.js";
test("fluxo real: abrir, sair e reabrir, montar manualmente e otimizar com chapas do XML", async () => {
  const system = createSystem(),
    server = system.app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const base = "http://127.0.0.1:" + server.address().port,
    originalFetch = globalThis.fetch;
  let cookie = "";
  async function request(url, method = "GET", body) {
    const r = await originalFetch(base + url, {
      method,
      headers: {
        ...(cookie ? { cookie } : {}),
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (r.headers.has("set-cookie"))
      cookie = r.headers.get("set-cookie").split(";")[0];
    return r;
  }
  const dom = new JSDOM(
    readFileSync(new URL("../public/index.html", import.meta.url), "utf8"),
    { url: base },
  );
  dom.window.HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  dom.window.HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  globalThis.document = dom.window.document;
  globalThis.window = dom.window;
  globalThis.FormData = dom.window.FormData;
  globalThis.confirm = () => true;
  globalThis.fetch = (url, opts = {}) =>
    request(url, opts.method, opts.body ? JSON.parse(opts.body) : undefined);
  const el = (s) => document.querySelector(s);
  const wait = async (predicate) => {
    for (let i = 0; i < 300; i++) {
      if (predicate()) return;
      await new Promise((r) => setTimeout(r, 5));
    }
    throw new Error(
      "Fluxo não avançou: " + document.body.textContent.slice(-800),
    );
  };
  try {
    await request("/api/auth/register", "POST", {
      nome: "Teste",
      empresa: "Empresa teste",
      email: "teste@example.test",
      senha: "teste-de-fluxo-1234",
    });
    const p = (
      await (
        await request("/api/projetos", "POST", {
          nome: "Projeto que deve reabrir",
          cliente: "Cliente teste",
          pedido: "PED-1",
        })
      ).json()
    ).dados;
    let xml = readFileSync(
      new URL("../exemplos/projeto-demonstracao.xml", import.meta.url),
      "utf8",
    );
    const first = xml.match(/<ITEM UNIQUEID="PORTA"[\s\S]*?<\/ITEM>/)[0];
    xml =
      xml.slice(0, xml.indexOf('<ITEM ID="grupo">')) +
      first +
      "</ITEMS></CATEGORY></CATEGORIES></AMBIENT></AMBIENTS></LISTING>";
    assert.equal(
      (
        await request(`/api/projetos/${p.id}/importar`, "POST", {
          versao: p.versao,
          xml,
          substituir: true,
        })
      ).status,
      200,
    );
    const company =
      system.store.accounts.findByEmail("teste@example.test").company_id;
    system.store.create(
      company,
      "plan",
      { projetoId: p.id, status: "rascunho" },
      p.id,
    );
    await import("../public/app.js?workflow");
    el("[data-open]").click();
    await wait(() => el("#manual"));
    assert.match(el("h1").textContent, /deve reabrir/);
    assert.match(document.body.textContent, /Sem resumo salvo/);
    el("[data-nav=materiais]").click();
    await wait(() => el("#add-stock"));
    assert.match(document.body.textContent, /1\.830/);
    el("[data-nav=projetos]").click();
    await wait(() => el("[data-open]"));
    el("[data-open]").click();
    await wait(() => el("#manual"));
    el("#manual").click();
    await wait(() => el("#board-select"));
    assert.equal(el("#board-select").options.length, 1);
    assert.equal(el("#modal").open, false);
    el("[data-place]:not(:disabled)").click();
    el("[data-place]:not(:disabled)").click();
    assert.equal(document.querySelectorAll("#board-svg rect.part").length, 2);
    el("#save-plan").click();
    await wait(() => el("#download-pdf") && !el("#download-pdf").disabled);
    assert.ok(el("#report-preview"));
    assert.match(el("#report-preview").textContent, /Cliente teste/);
    assert.match(el("#report-preview").textContent, /275 × 183/);
    el("#back-detail").click();
    await wait(() => el("#optimize"));
    el("[data-nav=materiais]").click();
    await wait(() => el("#add-stock"));
    el("[data-nav=projetos]").click();
    await wait(() => el("[data-open]"));
    el("[data-open]").click();
    await wait(() => el("#optimize"));
    el("#optimize").click();
    el("#modal-form").requestSubmit(el("#modal-form button[type=submit]"));
    await wait(() => el("#report-preview"));
    assert.equal(el("#download-pdf").disabled, false);
  } finally {
    globalThis.fetch = originalFetch;
    dom.window.close();
    delete globalThis.document;
    delete globalThis.window;
    delete globalThis.FormData;
    delete globalThis.confirm;
    await new Promise((r) => server.close(r));
    await system.close();
  }
});
