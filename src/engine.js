import { ensure } from "./errors.js";
import { expandPieces, groupKey } from "./validation.js";
const EPS = 0.000001;
const equal = (a, b) => Math.abs(a - b) < EPS;
const area = (p) => p.w * p.h;

export function useful(stock) {
  const r = stock.refilos;
  return {
    x: r.esquerda,
    y: r.superior,
    w: stock.comprimento - r.esquerda - r.direita,
    h: stock.largura - r.superior - r.inferior,
  };
}
function nextPhase(last, phase, axis) {
  return phase + (last === axis ? 0 : 1);
}

// Reconstrói cortes passantes. Uma falha de busca nunca autoriza a produção.
export function cuttingTree(region, pieces, kerf, maxPhases) {
  let budget = 12000;
  function solve(block, parts, last = null, phase = 0) {
    if (--budget < 0) return null;
    if (!parts.length) return { tipo: "retalho", ...block };
    if (parts.length === 1) {
      const p = parts[0];
      if (
        equal(p.x, block.x) &&
        equal(p.y, block.y) &&
        equal(p.w, block.w) &&
        equal(p.h, block.h)
      )
        return { tipo: "peca", unitId: p.unitId, ...block };
    }
    const candidates = [];
    for (const axis of ["x", "y"]) {
      const dim = axis === "x" ? "w" : "h";
      const next = nextPhase(last, phase, axis);
      if (next > maxPhases) continue;
      const positions = new Set(
        parts.flatMap((p) => [p[axis] + p[dim], p[axis] - kerf]),
      );
      for (const position of positions) {
        if (
          position < block[axis] - EPS ||
          position + kerf > block[axis] + block[dim] + EPS
        )
          continue;
        const before = [],
          after = [];
        let intersects = false;
        for (const p of parts) {
          if (p[axis] + p[dim] <= position + EPS) before.push(p);
          else if (p[axis] >= position + kerf - EPS) after.push(p);
          else {
            intersects = true;
            break;
          }
        }
        if (intersects) continue;
        const size1 = position - block[axis],
          size2 = block[axis] + block[dim] - position - kerf;
        if ((size1 < EPS && before.length) || (size2 < EPS && after.length))
          continue;
        if (
          (before.length === parts.length && size1 >= block[dim] - EPS) ||
          (after.length === parts.length && size2 >= block[dim] - EPS)
        )
          continue;
        candidates.push({
          axis,
          dim,
          position,
          before,
          after,
          next,
          size1: Math.max(0, size1),
          size2: Math.max(0, size2),
          score: Math.min(before.length, after.length),
        });
      }
    }
    candidates.sort((a, b) => b.score - a.score);
    for (const cut of candidates) {
      const first = { ...block, [cut.dim]: cut.size1 };
      const second = {
        ...block,
        [cut.axis]: cut.position + kerf,
        [cut.dim]: cut.size2,
      };
      const a = solve(first, cut.before, cut.axis, cut.next);
      if (!a) continue;
      const b = solve(second, cut.after, cut.axis, cut.next);
      if (b)
        return {
          tipo: "corte",
          eixo: cut.axis,
          posicao: cut.position,
          fase: cut.next,
          ...block,
          filhos: [a, b],
        };
    }
    return null;
  }
  return solve(region, pieces);
}
export function flattenTree(tree, boardId, result = []) {
  if (tree.tipo === "corte") {
    result.push({
      chapa: boardId,
      bloco: { x: tree.x, y: tree.y, w: tree.w, h: tree.h },
      eixo: tree.eixo,
      posicao: tree.posicao,
      fase: tree.fase,
    });
    for (const child of tree.filhos) flattenTree(child, boardId, result);
  }
  return result;
}
export function leftovers(tree, result = []) {
  if (tree.tipo === "retalho" && tree.w > EPS && tree.h > EPS)
    result.push({ x: tree.x, y: tree.y, w: tree.w, h: tree.h });
  for (const child of tree.filhos || []) leftovers(child, result);
  return result;
}
export function validatePlan(plan, lines) {
  const expected = new Map(expandPieces(lines).map((p) => [p.unitId, p]));
  const seen = new Set(),
    scraps = new Set(),
    boardIds = new Set();
  ensure(
    Array.isArray(plan.boards) &&
      plan.boards.length > 0 &&
      plan.boards.length <= 500,
    "Plano sem chapas ou acima do limite.",
  );
  const steps = [];
  const boards = plan.boards.map((board) => {
    ensure(
      typeof board.id === "string" &&
        board.id.length > 0 &&
        board.id.length <= 100 &&
        !boardIds.has(board.id),
      "Identificação de chapa repetida.",
    );
    boardIds.add(board.id);
    const region = useful(board.stock);
    ensure(region.w > 0 && region.h > 0, "Área útil inválida.");
    if (board.stock.source === "scrap") {
      ensure(
        !scraps.has(board.stock.id),
        "O mesmo retalho foi usado duas vezes.",
      );
      scraps.add(board.stock.id);
    }
    ensure(
      Array.isArray(board.pieces) && board.pieces.length > 0,
      "Remova chapas vazias antes de validar.",
    );
    for (const p of board.pieces) {
      const original = expected.get(p.unitId);
      ensure(
        original && !seen.has(p.unitId),
        "Peça ausente da lista original ou duplicada no plano.",
      );
      seen.add(p.unitId);
      ensure(
        groupKey(original) === groupKey(board.stock),
        "Material ou espessura incompatível na chapa.",
      );
      ensure(
        [p.x, p.y, p.w, p.h].every(Number.isFinite),
        "Coordenada ou dimensão inválida.",
      );
      const normal =
        equal(p.w, original.largura) && equal(p.h, original.comprimento);
      const rotated =
        original.giroPermitido &&
        equal(p.h, original.largura) &&
        equal(p.w, original.comprimento);
      ensure(
        normal || rotated,
        `Medida ou giro inválido na peça ${original.codigo}.`,
      );
      ensure(
        p.x >= region.x - EPS &&
          p.y >= region.y - EPS &&
          p.x + p.w <= region.x + region.w + EPS &&
          p.y + p.h <= region.y + region.h + EPS,
        `Peça ${original.codigo} fora da área útil.`,
      );
    }
    for (let i = 0; i < board.pieces.length; i++)
      for (let j = i + 1; j < board.pieces.length; j++) {
        const a = board.pieces[i],
          b = board.pieces[j],
          k = plan.machine.serra;
        ensure(
          a.x + a.w + k <= b.x + EPS ||
            b.x + b.w + k <= a.x + EPS ||
            a.y + a.h + k <= b.y + EPS ||
            b.y + b.h + k <= a.y + EPS,
          "Peças sobrepostas ou sem espaço suficiente para a serra.",
        );
      }
    const tree = cuttingTree(
      region,
      board.pieces,
      plan.machine.serra,
      plan.machine.fases,
    );
    ensure(
      tree,
      "Não foi encontrada sequência passante dentro do limite de fases. Ajuste o plano.",
    );
    const cuts = flattenTree(tree, board.id);
    ensure(
      cuts.every(
        (cut) =>
          (cut.eixo === "x" ? cut.bloco.h : cut.bloco.w) <=
          plan.machine.corteMaximo + EPS,
      ),
      "Um corte ultrapassa o comprimento máximo configurado.",
    );
    steps.push(...cuts);
    return { ...board, tree, retalhos: leftovers(tree) };
  });
  ensure(
    seen.size === expected.size,
    "O plano precisa conter todas as unidades do projeto.",
  );
  const partArea = boards
    .flatMap((b) => b.pieces)
    .reduce((n, p) => n + area(p), 0);
  const stockArea = boards.reduce(
    (n, b) => n + b.stock.comprimento * b.stock.largura,
    0,
  );
  const remnants = boards
    .flatMap((b) => b.retalhos)
    .filter(
      (r) =>
        Math.min(r.w, r.h) >= plan.machine.minimoRetalhoLargura &&
        Math.max(r.w, r.h) >= plan.machine.minimoRetalhoComprimento,
    );
  return {
    ...plan,
    boards,
    steps,
    metrics: {
      chapasNovas: boards.filter((b) => b.stock.source === "material").length,
      retalhosUsados: boards.filter((b) => b.stock.source === "scrap").length,
      aproveitamento: (100 * partArea) / stockArea,
      cortes: steps.length,
      maiorRetalho: Math.max(0, ...remnants.map(area)),
      areaRetalhos: remnants.reduce((n, r) => n + area(r), 0),
      custoChapas: boards
        .filter((b) => b.stock.source === "material")
        .reduce((n, b) => n + b.stock.custo, 0),
    },
  };
}

function splitSlot(slot, w, h, axis, kerf, maxPhases) {
  const other = axis === "x" ? "y" : "x";
  const dim = axis === "x" ? "w" : "h",
    otherDim = axis === "x" ? "h" : "w";
  const size = axis === "x" ? w : h,
    otherSize = axis === "x" ? h : w;
  const delta = slot[dim] - size,
    otherDelta = slot[otherDim] - otherSize;
  if (
    delta < -EPS ||
    otherDelta < -EPS ||
    (delta > EPS && delta < kerf - EPS) ||
    (otherDelta > EPS && otherDelta < kerf - EPS)
  )
    return null;
  let phase = slot.phase,
    last = slot.last;
  const free = [];
  if (delta > EPS) {
    phase = nextPhase(last, phase, axis);
    last = axis;
    free.push({
      ...slot,
      [axis]: slot[axis] + size + kerf,
      [dim]: Math.max(0, delta - kerf),
      last,
      phase,
    });
  }
  if (otherDelta > EPS) {
    phase = nextPhase(last, phase, other);
    last = other;
    free.push({
      ...slot,
      [other]: slot[other] + otherSize + kerf,
      [dim]: size,
      [otherDim]: Math.max(0, otherDelta - kerf),
      last,
      phase,
    });
  }
  if (phase > maxPhases) return null;
  return free.filter((r) => r.w > EPS && r.h > EPS);
}
function rng(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
function pack(units, stocks, machine, trial) {
  const random = rng(trial + 1),
    boards = [],
    available = new Set();
  const ordered = units
    .map((p) => ({
      p,
      score:
        trial % 3 === 0
          ? p.largura * p.comprimento
          : Math.max(p.largura, p.comprimento),
    }))
    .map((v) => ({
      ...v,
      score: v.score * (trial < 3 ? 1 : 0.65 + random() * 0.7),
    }))
    .sort((a, b) => b.score - a.score)
    .map((v) => v.p);
  for (const p of ordered) {
    const candidates = [];
    function consider(board, slot, index, newStock) {
      const orientations = [{ w: p.largura, h: p.comprimento }];
      if (p.giroPermitido && !equal(p.largura, p.comprimento))
        orientations.push({ w: p.comprimento, h: p.largura });
      for (const shape of orientations)
        for (const axis of ["x", "y"]) {
          const free = splitSlot(
            slot,
            shape.w,
            shape.h,
            axis,
            machine.serra,
            machine.fases,
          );
          if (free)
            candidates.push({
              board,
              slot,
              index,
              newStock,
              shape,
              free,
              score:
                (newStock ? 1e15 : 0) +
                (newStock?.source === "material" ? 1e14 : 0) +
                (slot.w * slot.h - shape.w * shape.h) +
                (trial % 2
                  ? Math.min(slot.w - shape.w, slot.h - shape.h) * 1000
                  : 0),
            });
        }
    }
    for (const board of boards)
      if (groupKey(board.stock) === groupKey(p))
        board.free.forEach((slot, i) => consider(board, slot, i, null));
    for (const stock of stocks)
      if (
        groupKey(stock) === groupKey(p) &&
        !(stock.source === "scrap" && available.has(stock.id))
      ) {
        consider(null, { ...useful(stock), last: null, phase: 0 }, 0, stock);
      }
    candidates.sort((a, b) => a.score - b.score);
    const best = candidates[0];
    if (!best)
      throw new Error(
        `Peça ${p.codigo} não cabe com a orientação, margens e fases configuradas.`,
      );
    let board = best.board;
    if (!board) {
      board = {
        id: `chapa-${boards.length + 1}`,
        stock: best.newStock,
        pieces: [],
        free: [best.slot],
      };
      boards.push(board);
      if (best.newStock.source === "scrap") available.add(best.newStock.id);
    }
    board.free.splice(best.index, 1, ...best.free);
    board.pieces.push({
      unitId: p.unitId,
      codigo: p.codigo,
      descricao: p.descricao,
      x: best.slot.x,
      y: best.slot.y,
      ...best.shape,
    });
  }
  return { boards: boards.map(({ free, ...board }) => board), machine };
}
function better(a, b) {
  if (!b) return true;
  const x = a.metrics,
    y = b.metrics;
  if (x.chapasNovas !== y.chapasNovas) return x.chapasNovas < y.chapasNovas;
  if (x.maiorRetalho !== y.maiorRetalho) return x.maiorRetalho > y.maiorRetalho;
  if (x.areaRetalhos !== y.areaRetalhos) return x.areaRetalhos > y.areaRetalhos;
  return x.cortes < y.cortes;
}
export function optimize({ lines, materials, scraps, machine, attempts = 40 }) {
  const units = expandPieces(lines);
  const stocks = [
    ...scraps
      .filter((s) => s.status === "disponivel")
      .map((s) => ({ ...s, source: "scrap" })),
    ...materials.map((s) => ({ ...s, source: "material" })),
  ];
  let best = null,
    lastError = "Sem combinação viável.";
  const started = Date.now();
  let tried = 0;
  for (let i = 0; i < attempts && Date.now() - started < 10000; i++) {
    try {
      const plan = validatePlan(pack(units, stocks, machine, i), lines);
      if (better(plan, best)) best = plan;
    } catch (error) {
      lastError = error.message;
    }
    tried++;
  }
  ensure(best, lastError);
  return {
    ...best,
    search: {
      tentativas: tried,
      tempoMs: Date.now() - started,
      metodo: "Busca heurística guilhotinada; melhor resultado encontrado.",
    },
  };
}
