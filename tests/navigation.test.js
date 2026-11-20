import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { readFileSync } from "node:fs";
import { createSystem } from "../src/app.js";
test("relatório navega entre espessuras, zoom preserva peças e reotimização usa plano base", async () => {
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
  globalThis.fetch = (url, o = {}) =>
    request(url, o.method, o.body ? JSON.parse(o.body) : undefined);
  const el = (s) => document.querySelector(s);
  const wait = async (p) => {
    for (let i = 0; i < 400; i++) {
      if (p()) return;
      await new Promise((r) => setTimeout(r, 5));
    }
    throw new Error(document.body.textContent.slice(-700));
  };
  try {
    await request("/api/auth/register", "POST", {
      nome: "Teste",
      empresa: "Oficina teste",
      email: "ui@example.test",
      senha: "teste-interface-1234",
    });
    const p = (
      await (
        await request("/api/projetos", "POST", { nome: "Marrons separados" })
      ).json()
    ).dados;
    for (const espessura of [12, 18])
      assert.equal(
        (
          await request(`/api/projetos/${p.id}/pecas`, "POST", {
            codigo: "M" + espessura,
            descricao: "Peça de " + espessura,
            material: "MDF",
            acabamento: "Marrom Claro",
            espessura,
            largura: 100,
            comprimento: 150,
            quantidade: 1,
            giroPermitido: false,
          })
        ).status,
        201,
      );
    const generated = await request(`/api/projetos/${p.id}/otimizar`, "POST", {
      tentativas: 8,
    });
    assert.equal(generated.status, 201);
    const record = (await generated.json()).dados;
    await import("../public/app.js?navigation");
    el("[data-open]").click();
    await wait(() => el("[data-plan]"));
    el("[data-plan]").click();
    await wait(() => el("#report-next"));
    assert.equal(el("#report-board-select").options.length, 2);
    assert.match(el("#report-preview summary").textContent, /1 de 2/);
    el("#report-next").click();
    assert.equal(el("#board-select").value, "1");
    assert.equal(el("#report-board-select").value, "1");
    assert.match(el("#report-preview summary").textContent, /2 de 2/);
    assert.match(
      el("#report-preview .report-meta").textContent,
      new RegExp(
        String(record.boards[1].stock.espessura / 10).replace(".", ",") + " cm",
      ),
    );
    el("#report-prev").click();
    assert.equal(el("#board-select").value, "0");
    el("#report-board-select").value = "1";
    el("#report-board-select").dispatchEvent(new dom.window.Event("change"));
    assert.equal(el("#board-select").value, "1");
    const before = [...el("#board-svg").querySelectorAll("rect.part")].map(
      (p) => p.outerHTML,
    );
    el("[data-zoom-in]").click();
    assert.equal(el("[data-zoom-label]").textContent, "125%");
    assert.deepEqual(
      [...el("#board-svg").querySelectorAll("rect.part")].map(
        (p) => p.outerHTML,
      ),
      before,
    );
    assert.equal(el("#download-pdf").disabled, false);
    assert.match(el(".material-analysis").textContent, /12 mm/);
    assert.match(el(".material-analysis").textContent, /18 mm/);
    assert.match(el(".success-note").textContent, /mínimo de 2/);
    el("#refine-plan").click();
    el("#modal-form [name=tentativas]").value = "2";
    el("#modal-form").requestSubmit(el("#modal-form button[type=submit]"));
    await wait(() => !el("#modal").open && el("#report-next"));
    const history = (
      await (await request(`/api/projetos/${p.id}/planos`)).json()
    ).dados;
    assert.equal(history.length, 2);
    assert.ok(history.some((p) => p.search?.planoBaseConsiderado));
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
