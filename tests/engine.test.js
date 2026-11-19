import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { optimize, validatePlan, cuttingTree, useful } from "../src/engine.js";
import { parsePromob } from "../src/xml.js";
const machine = {
  serra: 5,
  fases: 6,
  corteMaximo: 2800,
  minimoRetalhoLargura: 200,
  minimoRetalhoComprimento: 400,
};
const stock = {
  id: "m",
  source: "material",
  material: "MDF",
  acabamento: "Branco",
  espessura: 15,
  comprimento: 1000,
  largura: 800,
  custo: 500,
  refilos: { esquerda: 15, direita: 15, superior: 15, inferior: 15 },
};
const line = {
  id: "p",
  codigo: "P",
  descricao: "Porta",
  largura: 400,
  comprimento: 300,
  espessura: 15,
  quantidade: 2,
  material: "MDF",
  acabamento: "Branco",
  giroPermitido: false,
};
function sample() {
  return optimize({
    lines: [line],
    materials: [stock],
    scraps: [],
    machine,
    attempts: 4,
  });
}
test("otimizador conserva peças, refilos, kerf e área dos retalhos", () => {
  const p = sample();
  assert.equal(p.boards.length, 1);
  assert.equal(p.boards[0].pieces.length, 2);
  const region = useful(stock),
    parts = p.boards[0].pieces.reduce((n, q) => n + q.w * q.h, 0),
    waste = p.boards[0].retalhos.reduce((n, q) => n + q.w * q.h, 0),
    sawdust = p.steps.reduce(
      (n, s) => n + machine.serra * (s.eixo === "x" ? s.bloco.h : s.bloco.w),
      0,
    );
  assert.ok(Math.abs(region.w * region.h - parts - waste - sawdust) < 1e-6);
  assert.equal(p.metrics.custoChapas, 500);
  assert.ok(p.metrics.aproveitamento > 0);
});
test("giro proibido, sobreposição e unidade faltante são rejeitados", () => {
  const p = sample();
  const a = structuredClone(p);
  [a.boards[0].pieces[0].w, a.boards[0].pieces[0].h] = [300, 400];
  assert.throws(() => validatePlan(a, [line]), /giro/);
  const b = structuredClone(p);
  b.boards[0].pieces[1] = { ...b.boards[0].pieces[0], unitId: "p:2" };
  assert.throws(() => validatePlan(b, [line]), /sobrepostas/);
  const c = structuredClone(p);
  c.boards[0].pieces.pop();
  assert.throws(() => validatePlan(c, [line]), /todas as unidades/);
});
test("cabe só girando quando a peça permite", () => {
  const l = { ...line, largura: 700, comprimento: 900, quantidade: 1 };
  assert.throws(() =>
    optimize({
      lines: [l],
      materials: [stock],
      scraps: [],
      machine,
      attempts: 2,
    }),
  );
  const p = optimize({
    lines: [{ ...l, giroPermitido: true }],
    materials: [stock],
    scraps: [],
    machine,
    attempts: 2,
  });
  assert.equal(p.boards[0].pieces[0].w, 900);
});
test("fases e alcance de corte são respeitados", () => {
  const p = sample();
  assert.throws(
    () => validatePlan({ ...p, machine: { ...machine, fases: 1 } }, [line]),
    /fases/,
  );
  assert.throws(
    () =>
      validatePlan({ ...p, machine: { ...machine, corteMaximo: 10 } }, [line]),
    /máximo/,
  );
});
test("layout pinwheel sem separador não ganha sequência de guilhotina", () => {
  const parts = [
    [0, 0, 4, 2],
    [4, 0, 2, 4],
    [2, 4, 4, 2],
    [0, 2, 2, 4],
    [2, 2, 2, 2],
  ].map(([x, y, w, h], i) => ({ x, y, w, h, unitId: String(i) }));
  assert.equal(cuttingTree({ x: 0, y: 0, w: 6, h: 6 }, parts, 0, 6), null);
});
test("usa sobra disponível antes de abrir chapa nova e não duplica sobra", () => {
  const scrap = { ...stock, id: "r", source: "scrap", status: "disponivel" };
  const p = optimize({
    lines: [line],
    materials: [stock],
    scraps: [scrap],
    machine,
    attempts: 5,
  });
  assert.equal(p.metrics.chapasNovas, 0);
  assert.equal(p.metrics.retalhosUsados, 1);
  const many = { ...line, quantidade: 8 };
  const q = optimize({
    lines: [many],
    materials: [stock],
    scraps: [scrap],
    machine,
    attempts: 2,
  });
  assert.equal(q.boards.filter((b) => b.stock.source === "scrap").length, 1);
});
test("importação preserva repetição, unidade e orientação desconhecida bloqueada", () => {
  const xml = readFileSync(
      new URL("../exemplos/projeto-demonstracao.xml", import.meta.url),
      "utf8",
    ),
    pieces = parsePromob(xml);
  assert.equal(pieces.length, 3);
  assert.equal(
    pieces.reduce((n, p) => n + p.quantidade, 0),
    9,
  );
  assert.ok(pieces.every((p) => p.giroPermitido === false));
  assert.equal(pieces[0].chapaXml.largura, "1830");
  assert.throws(
    () => parsePromob(xml.replace('UNIT="MM"', 'UNIT="CM"')),
    /milímetros/,
  );
  assert.throws(
    () => parsePromob('<!DOCTYPE x [<!ENTITY a "bad">]>' + xml),
    /DTD/,
  );
  assert.throws(() => parsePromob("<LISTING>"), /inválido/);
  assert.throws(
    () => parsePromob(xml.replace('REPETITION="2"', 'REPETITION="0"')),
    /Quantidade/,
  );
});

test("atributo vazio de mesmo nome não sobrescreve os nós do XML real", () => {
  const xml = readFileSync(
    new URL("../exemplos/projeto-demonstracao.xml", import.meta.url),
    "utf8",
  )
    .replace('UNIT="MM"', 'UNIT="MM" AMBIENTS=""')
    .replace('ID="grupo"', 'ID="grupo" ITEMS=""');
  assert.equal(parsePromob(xml).length, 3);
});

test("testa divisões horizontais e evita abrir segunda chapa desnecessária", () => {
  const m = {
      ...machine,
      serra: 1,
      corteMaximo: 200,
      minimoRetalhoLargura: 2,
      minimoRetalhoComprimento: 2,
    },
    s = {
      ...stock,
      comprimento: 100,
      largura: 100,
      refilos: { esquerda: 0, direita: 0, superior: 0, inferior: 0 },
    };
  const ls = [
    [60, 60],
    [70, 39],
    [39, 60],
  ].map(([largura, comprimento], i) => ({
    ...line,
    id: "p" + i,
    codigo: String(i),
    largura,
    comprimento,
    quantidade: 1,
  }));
  const p = optimize({
    lines: ls,
    materials: [s],
    scraps: [],
    machine: m,
    attempts: 24,
  });
  assert.equal(p.boards.length, 1);
  assert.equal(p.analysis.minimoChapasComprovado, true);
  assert.equal(p.boards[0].pieces.length, 3);
});
test("cor igual não mistura 12, 15 e 18 mm nem linhas diferentes", () => {
  const ls = [12, 15, 18].map((espessura, i) => ({
    ...line,
    id: "e" + i,
    acabamento: "Marrom Claro",
    espessura,
    quantidade: 1,
    largura: 100,
    comprimento: 100,
  }));
  const materials = ls.map((p, i) => ({
    ...stock,
    id: "m" + i,
    acabamento: p.acabamento,
    espessura: p.espessura,
  }));
  const p = optimize({
    lines: ls,
    materials,
    scraps: [],
    machine,
    attempts: 8,
  });
  assert.equal(p.boards.length, 3);
  assert.equal(p.analysis.limiteInferiorChapasNovas, 3);
  assert.ok(p.analysis.grupos.every((g) => g.minimoChapasComprovado));
  const mixed = structuredClone(p);
  mixed.boards[1].stock.espessura = 12;
  assert.throws(() => validatePlan(mixed, ls), /espessura/);
  const a = { ...line, id: "a", linha: "Linha A", quantidade: 1 },
    b = { ...a, id: "b", linha: "Linha B" };
  const q = optimize({
    lines: [a, b],
    materials: [
      { ...stock, id: "a", linha: "Linha A" },
      { ...stock, id: "b", linha: "Linha B" },
    ],
    scraps: [],
    machine,
    attempts: 4,
  });
  assert.equal(q.boards.length, 2);
});
test("validade da árvore de corte é conferida; sequência adulterada é rejeitada", async () => {
  const { verifyCutTree } = await import("../src/engine.js"),
    p = sample(),
    board = p.boards[0],
    region = useful(board.stock);
  assert.ok(verifyCutTree(board.tree, region, board.pieces, machine));
  const bad = structuredClone(board.tree);
  bad.posicao = board.pieces[0].x + 10;
  assert.equal(verifyCutTree(bad, region, board.pieces, machine), null);
  const missing = structuredClone(board.tree);
  missing.filhos = [];
  assert.equal(verifyCutTree(missing, region, board.pieces, machine), null);
});
test("plano base válido é considerado sem piorar sobras de cada material", () => {
  const ls = [
      { ...line, id: "a", quantidade: 2 },
      {
        ...line,
        id: "b",
        acabamento: "Marrom Claro",
        quantidade: 3,
        largura: 200,
        comprimento: 100,
      },
    ],
    materials = [stock, { ...stock, id: "b", acabamento: "Marrom Claro" }];
  const base = optimize({
      lines: ls,
      materials,
      scraps: [],
      machine,
      attempts: 24,
    }),
    next = optimize({
      lines: ls,
      materials,
      scraps: [],
      machine,
      attempts: 2,
      baselinePlan: base,
    });
  assert.equal(next.search.planoBaseConsiderado, true);
  assert.ok(next.metrics.chapasNovas <= base.metrics.chapasNovas);
  for (const group of next.analysis.grupos) {
    const previous = base.analysis.grupos.find((g) => g.chave === group.chave);
    assert.ok(group.maiorSobra >= previous.maiorSobra);
  }
});
test("a maior sobra é preservada inteira antes de dividir blocos internos", () => {
  const s = {
      ...stock,
      comprimento: 1000,
      largura: 800,
      refilos: { esquerda: 0, direita: 0, superior: 0, inferior: 0 },
    },
    ls = [{ ...line, largura: 200, comprimento: 100, quantidade: 4 }];
  const p = optimize({
    lines: ls,
    materials: [s],
    scraps: [],
    machine,
    attempts: 32,
  });
  assert.ok(p.metrics.maiorRetalho >= 590000);
  assert.equal(p.boards.length, 1);
});
