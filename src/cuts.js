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
export function cuttingTree(
  region,
  pieces,
  kerf,
  maxPhases,
  maxCut = Infinity,
) {
  let budget = 12000;
  const deadline = Date.now() + 300;
  function solve(block, parts, last = null, phase = 0) {
    if (--budget < 0 || Date.now() > deadline) return null;
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
      if (next > maxPhases || (axis === "x" ? block.h : block.w) > maxCut + EPS)
        continue;
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
          emptyArea:
            (!before.length
              ? Math.max(0, size1) * block[axis === "x" ? "h" : "w"]
              : 0) +
            (!after.length
              ? Math.max(0, size2) * block[axis === "x" ? "h" : "w"]
              : 0),
        });
      }
    }
    candidates.sort((a, b) => b.emptyArea - a.emptyArea || b.score - a.score);
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
// Verifica a sequência inteira, inclusive árvores recebidas ou salvas em versões anteriores.
export function verifyCutTree(tree, region, parts, machine) {
  let budget = 5000;
  function visit(node, block, pieces, last = null, phase = 0, depth = 0) {
    if (
      !node ||
      --budget < 0 ||
      depth > 1000 ||
      !["x", "y", "w", "h"].every(
        (k) => Number.isFinite(node[k]) && equal(node[k], block[k]),
      )
    )
      return null;
    if (node.tipo === "retalho")
      return pieces.length === 0 ? { tipo: "retalho", ...block } : null;
    if (node.tipo === "peca") {
      const p = pieces[0];
      return pieces.length === 1 &&
        node.unitId === p.unitId &&
        ["x", "y", "w", "h"].every((k) => equal(p[k], block[k]))
        ? { tipo: "peca", unitId: p.unitId, ...block }
        : null;
    }
    if (
      node.tipo !== "corte" ||
      !["x", "y"].includes(node.eixo) ||
      !Number.isFinite(node.posicao) ||
      !Array.isArray(node.filhos) ||
      node.filhos.length !== 2
    )
      return null;
    const axis = node.eixo,
      dim = axis === "x" ? "w" : "h",
      next = nextPhase(last, phase, axis),
      position = node.posicao,
      k = machine.serra;
    if (
      next > machine.fases ||
      position < block[axis] - EPS ||
      position + k > block[axis] + block[dim] + EPS ||
      (axis === "x" ? block.h : block.w) > machine.corteMaximo + EPS
    )
      return null;
    const before = [],
      after = [];
    for (const p of pieces) {
      if (p[axis] + p[dim] <= position + EPS) before.push(p);
      else if (p[axis] >= position + k - EPS) after.push(p);
      else return null;
    }
    const first = { ...block, [dim]: Math.max(0, position - block[axis]) },
      second = {
        ...block,
        [axis]: position + k,
        [dim]: Math.max(0, block[axis] + block[dim] - position - k),
      };
    if (
      (equal(first[dim], block[dim]) && before.length === pieces.length) ||
      (equal(second[dim], block[dim]) && after.length === pieces.length)
    )
      return null;
    const a = visit(node.filhos[0], first, before, axis, next, depth + 1);
    if (!a) return null;
    const b = visit(node.filhos[1], second, after, axis, next, depth + 1);
    return b
      ? {
          tipo: "corte",
          eixo: axis,
          posicao: position,
          fase: next,
          ...block,
          filhos: [a, b],
        }
      : null;
  }
  return visit(tree, region, parts);
}
function preferredTree(a, b, machine) {
  if (!a) return b;
  if (!b) return a;
  const rank = (t) => {
    const rs = leftovers(t).filter(
      (r) =>
        Math.min(r.w, r.h) >= machine.minimoRetalhoLargura &&
        Math.max(r.w, r.h) >= machine.minimoRetalhoComprimento,
    );
    return [
      Math.max(0, ...rs.map(area)),
      rs.reduce((n, r) => n + area(r), 0),
      -flattenTree(t, "").length,
    ];
  };
  const x = rank(a),
    y = rank(b);
  for (let i = 0; i < x.length; i++)
    if (!equal(x[i], y[i])) return x[i] > y[i] ? a : b;
  return a;
}
export function validatePlan(plan, lines, { improveCuts = true } = {}) {
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
    ensure(
      !(
        region.w > plan.machine.corteMaximo + EPS &&
        region.h > plan.machine.corteMaximo + EPS
      ) ||
        (board.pieces.length === 1 &&
          ["x", "y", "w", "h"].every((k) =>
            equal(board.pieces[0][k], region[k]),
          )),
      "Um corte ultrapassa o comprimento máximo configurado.",
    );
    const witness = verifyCutTree(
      board.tree,
      region,
      board.pieces,
      plan.machine,
    );
    const rebuilt =
      !witness || improveCuts
        ? cuttingTree(
            region,
            board.pieces,
            plan.machine.serra,
            plan.machine.fases,
            plan.machine.corteMaximo,
          )
        : null;
    const tree = preferredTree(witness, rebuilt, plan.machine);
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
