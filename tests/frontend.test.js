import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { optimize } from "../src/engine.js";
// Teste de DOM com API simulada: não usa credenciais nem uma sessão de navegador.
test("telas de projeto e editor: selecionar, mover, desfazer e salvar revisão", async () => {
  const dom = new JSDOM(
    readFileSync(new URL("../public/index.html", import.meta.url), "utf8"),
    { url: "http://localhost:3000" },
  );
  dom.window.HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  dom.window.HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  globalThis.DOMPoint = class {
    constructor(x, y) {
      this.x = x;
      this.y = y;
    }
    matrixTransform() {
      return this;
    }
  };
  globalThis.document = dom.window.document;
  globalThis.window = dom.window;
  globalThis.FormData = dom.window.FormData;
  globalThis.confirm = () => true;
  const project = {
      id: "pr",
      nome: "Cozinha teste",
      cliente: "Cliente teste",
      pedido: "123",
      versao: 2,
      atualizadoEm: new Date().toISOString(),
    },
    piece = {
      id: "p",
      codigo: "PORTA",
      descricao: "Porta teste",
      largura: 400,
      comprimento: 300,
      quantidade: 2,
      material: "MDF",
      acabamento: "Branco",
      espessura: 15,
      giroPermitido: false,
    };
  const material = {
    id: "m",
    versao: 1,
    material: "MDF",
    acabamento: "Branco",
    espessura: 15,
    comprimento: 2750,
    largura: 1850,
    custo: 500,
    refilos: { esquerda: 15, direita: 15, superior: 15, inferior: 15 },
  };
  const machine = {
    versao: 1,
    serra: 5,
    fases: 6,
    corteMaximo: 2800,
    minimoRetalhoLargura: 200,
    minimoRetalhoComprimento: 400,
  };
  let plans = [];
  let savedBody;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    let result;
    if (url === "/api/auth/me")
      result = {
        dados: { name: "Teste", role: "admin", company: "Oficina teste" },
      };
    else if (url === "/api/materiais") result = { dados: [material] };
    else if (url === "/api/retalhos") result = { dados: [] };
    else if (url === "/api/maquina") result = { dados: machine };
    else if (url === "/api/projetos") result = { dados: [project] };
    else if (url === "/api/projetos/pr") result = { dados: project };
    else if (url === "/api/projetos/pr/preparar-chapas")
      result = { dados: [material], criadas: 0, reutilizadas: 1 };
    else if (url === "/api/projetos/pr/pecas") result = { dados: [piece] };
    else if (url === "/api/projetos/pr/planos") result = { dados: plans };
    else if (url === "/api/projetos/pr/otimizar") {
      const p = {
        ...optimize({
          lines: [piece],
          materials: [material],
          scraps: [],
          machine,
          attempts: 2,
        }),
        id: "plan1",
        versao: 1,
        projectVersion: 2,
        status: "revisao",
      };
      plans = [p];
      result = { dados: p };
    } else if (
      url === "/api/projetos/pr/planos/plan1" &&
      options.method === "PUT"
    ) {
      savedBody = JSON.parse(options.body);
      const p = {
        ...plans[0],
        id: "plan2",
        boards: savedBody.boards.map((b) => ({
          ...b,
          stock: { ...material, source: "material" },
        })),
      };
      plans.push(p);
      result = { dados: p };
    } else throw new Error("API inesperada " + url);
    return { ok: true, status: 200, json: async () => result };
  };
  const tick = () => new Promise((r) => setTimeout(r, 20)),
    el = (s) => document.querySelector(s);
  try {
    await import("../public/app.js");
    assert.match(el("h1").textContent, /Projetos/);
    el("[data-open]").click();
    await tick();
    assert.match(el("h1").textContent, /Cozinha/);
    el("#optimize").click();
    el("#modal-form [name=tentativas]").value = "2";
    el("#modal-form").requestSubmit(el("#modal-form button[type=submit]"));
    await tick();
    assert.match(el("h1").textContent, /Editor/);
    assert.equal(document.querySelectorAll("#board-svg rect.part").length, 2);
    assert.ok(el("#save-plan"));
    const svg = el("#board-svg"),
      part = el("#board-svg rect.part");
    svg.getScreenCTM = () => ({ inverse: () => ({}) });
    svg.setPointerCapture = () => {};
    part.dispatchEvent(
      new dom.window.MouseEvent("pointerdown", {
        bubbles: true,
        clientX: 100,
        clientY: 100,
      }),
    );
    svg.dispatchEvent(
      new dom.window.MouseEvent("pointerup", {
        bubbles: true,
        clientX: 100,
        clientY: 100,
      }),
    );
    assert.ok(el("#position-form"));
    assert.equal(el("#rotate").disabled, true);
    el("#position-form [name=y]").value = "1000";
    el("#position-form").requestSubmit(el("#position-form button"));
    assert.match(document.body.textContent, /Alterações não validadas/);
    el("#undo").click();
    await tick();
    assert.notEqual(el("#position-form [name=y]").value, "1000");
    el("#redo").click();
    await tick();
    assert.equal(el("#position-form [name=y]").value, "1000");
    el("#save-plan").click();
    await tick();
    assert.ok(savedBody.boards[0].pieces.some((p) => p.y === 1000));
    assert.equal(savedBody.versao, 1);
    assert.ok(!document.body.textContent.includes("Alterações não validadas"));
    assert.equal(el("#export-plan").disabled, true);
    assert.ok(el("#print-plan"));
  } finally {
    globalThis.fetch = originalFetch;
    dom.window.close();
    delete globalThis.document;
    delete globalThis.window;
    delete globalThis.FormData;
    delete globalThis.confirm;
    delete globalThis.DOMPoint;
  }
});
