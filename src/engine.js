import { ensure } from "./errors.js";
import { expandPieces, groupKey } from "./validation.js";
import { useful, validatePlan } from "./cuts.js";
export {
  useful,
  validatePlan,
  cuttingTree,
  flattenTree,
  leftovers,
  verifyCutTree,
} from "./cuts.js";
const EPS = 1e-6,
  equal = (a, b) => Math.abs(a - b) < EPS,
  area = (p) => p.w * p.h;
const nextPhase = (last, phase, axis) => phase + (last === axis ? 0 : 1);
function rng(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
function splitSlot(slot, w, h, axis, machine) {
  const other = axis === "x" ? "y" : "x",
    dim = axis === "x" ? "w" : "h",
    otherDim = axis === "x" ? "h" : "w",
    size = axis === "x" ? w : h,
    otherSize = axis === "x" ? h : w,
    k = machine.serra,
    delta = slot[dim] - size,
    otherDelta = slot[otherDim] - otherSize;
  if (
    delta < -EPS ||
    otherDelta < -EPS ||
    (delta > EPS && delta < k - EPS) ||
    (otherDelta > EPS && otherDelta < k - EPS)
  )
    return null;
  let phase = slot.phase,
    last = slot.last;
  const free = [];
  if (delta > EPS) {
    if (slot[otherDim] > machine.corteMaximo + EPS) return null;
    phase = nextPhase(last, phase, axis);
    last = axis;
    free.push({
      ...slot,
      [axis]: slot[axis] + size + k,
      [dim]: Math.max(0, delta - k),
      last,
      phase,
    });
  }
  if (otherDelta > EPS) {
    if (size > machine.corteMaximo + EPS) return null;
    phase = nextPhase(last, phase, other);
    last = other;
    free.push({
      ...slot,
      [other]: slot[other] + otherSize + k,
      [dim]: size,
      [otherDim]: Math.max(0, otherDelta - k),
      last,
      phase,
    });
  }
  if (phase > machine.fases) return null;
  return free.filter((r) => r.w > EPS && r.h > EPS);
}
const compareRank = (a, b) => {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] || 0) - (b[i] || 0);
    if (Math.abs(d) > EPS) return d;
  }
  return 0;
};
function candidatesFor(board, slot, index, p, machine, trial, newStock = null) {
  const shapes = [
      { w: p.largura, h: p.comprimento },
      ...(p.giroPermitido && !equal(p.largura, p.comprimento)
        ? [{ w: p.comprimento, h: p.largura }]
        : []),
    ],
    result = [];
  for (const shape of shapes)
    for (const axis of ["x", "y"]) {
      const free = splitSlot(slot, shape.w, shape.h, axis, machine);
      if (!free) continue;
      const dx = slot.w - shape.w,
        dy = slot.h - shape.h,
        largest = Math.max(0, ...free.map(area)),
        usable = free.filter(
          (r) =>
            Math.min(r.w, r.h) >= machine.minimoRetalhoLargura &&
            Math.max(r.w, r.h) >= machine.minimoRetalhoComprimento,
        ),
        largeUseful = Math.max(0, ...usable.map(area));
      const modes = [
        [-largeUseful, -largest, free.length],
        [Math.min(dx, dy), Math.max(dx, dy), -largest],
        [slot.w * slot.h - shape.w * shape.h, -largest],
        [axis === (trial % 2 ? "y" : "x") ? 0 : 1, -largest],
        [Math.max(dx, dy), Math.min(dx, dy), -largest],
        [-largest, -largeUseful, free.length],
      ];
      const rank =
        trial === 0
          ? [
              newStock ? (newStock.source === "scrap" ? 1 : 2) : 0,
              slot.w * slot.h - shape.w * shape.h,
            ]
          : [
              newStock ? (newStock.source === "scrap" ? 1 : 2) : 0,
              ...modes[Math.floor(trial / 8) % modes.length],
            ];
      result.push({ board, slot, index, newStock, shape, free, rank, axis });
    }
  return result;
}
function constructPlacement(slot, shape, axis, machine, p, free) {
  const region = { x: slot.x, y: slot.y, w: slot.w, h: slot.h },
    dim = axis === "x" ? "w" : "h",
    other = axis === "x" ? "y" : "x",
    otherDim = axis === "x" ? "h" : "w",
    size = axis === "x" ? shape.w : shape.h,
    otherSize = axis === "x" ? shape.h : shape.w,
    k = machine.serra;
  const exact = {
    tipo: "peca",
    unitId: p.unitId,
    x: slot.x,
    y: slot.y,
    w: shape.w,
    h: shape.h,
  };
  let inner = exact,
    phase = slot.phase,
    last = slot.last;
  const delta = region[dim] - size,
    otherDelta = region[otherDim] - otherSize;
  if (delta > EPS) {
    phase = nextPhase(last, phase, axis);
    last = axis;
  }
  if (otherDelta > EPS) {
    const first = { ...region, [dim]: size };
    inner = {
      tipo: "corte",
      ...first,
      eixo: other,
      posicao: region[other] + otherSize,
      fase: nextPhase(last, phase, other),
      filhos: [
        exact,
        {
          tipo: "retalho",
          ...first,
          [other]: region[other] + otherSize + k,
          [otherDim]: Math.max(0, otherDelta - k),
        },
      ],
    };
  }
  const tree =
    delta > EPS
      ? {
          tipo: "corte",
          ...region,
          eixo: axis,
          posicao: region[axis] + size,
          fase: phase,
          filhos: [
            inner,
            {
              tipo: "retalho",
              ...region,
              [axis]: region[axis] + size + k,
              [dim]: Math.max(0, delta - k),
            },
          ],
        }
      : inner;
  Object.keys(slot.leaf).forEach((key) => delete slot.leaf[key]);
  Object.assign(slot.leaf, tree);
  const leaves = [];
  const walk = (n) => {
    if (n.tipo === "retalho") leaves.push(n);
    for (const c of n.filhos || []) walk(c);
  };
  walk(slot.leaf);
  for (const r of free)
    r.leaf = leaves.find((n) =>
      ["x", "y", "w", "h"].every((key) => equal(r[key], n[key])),
    );
}
function orderedUnits(units, trial) {
  const random = rng(trial + 11),
    mode = trial % 8;
  return units
    .map((p, i) => {
      const w = p.largura,
        h = p.comprimento,
        v = [
          w * h,
          Math.max(w, h),
          w,
          h,
          w + h,
          Math.min(w, h),
          w * h,
          Math.max(w, h),
        ][mode];
      return { p, i, score: v * (mode >= 6 ? 0.55 + random() : 1) };
    })
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .map((v) => v.p);
}
function pack(units, stocks, machine, trial, maxNew = Infinity) {
  const boards = [],
    usedScraps = new Set();
  let newCount = 0;
  for (const p of orderedUnits(units, trial)) {
    const choices = [];
    for (const b of boards)
      b.free.forEach((slot, i) =>
        choices.push(...candidatesFor(b, slot, i, p, machine, trial)),
      );
    for (const stock of stocks) {
      if (
        (stock.source === "scrap" && usedScraps.has(stock.id)) ||
        (stock.source === "material" && newCount >= maxNew)
      )
        continue;
      choices.push(
        ...candidatesFor(
          null,
          { ...useful(stock), last: null, phase: 0 },
          0,
          p,
          machine,
          trial,
          stock,
        ),
      );
    }
    choices.sort((a, b) => compareRank(a.rank, b.rank));
    const best = choices[0];
    if (!best)
      throw new Error(
        `Peça ${p.codigo} (${p.largura} × ${p.comprimento} mm) não coube em ${p.acabamento} ${p.espessura} mm com o giro, refilos e fases configurados.`,
      );
    let board = best.board;
    if (!board) {
      const tree = { tipo: "retalho", ...useful(best.newStock) };
      best.slot.leaf = tree;
      board = {
        id: `chapa-${boards.length + 1}`,
        stock: best.newStock,
        pieces: [],
        tree,
        free: [best.slot],
      };
      boards.push(board);
      if (best.newStock.source === "scrap") usedScraps.add(best.newStock.id);
      else newCount++;
    }
    constructPlacement(best.slot, best.shape, best.axis, machine, p, best.free);
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
  return { boards: boards.map(({ free, ...b }) => b), machine };
}
function better(a, b) {
  if (!b) return true;
  const x = a.metrics,
    y = b.metrics;
  if (x.chapasNovas !== y.chapasNovas) return x.chapasNovas < y.chapasNovas;
  if (a.boards.length !== b.boards.length)
    return a.boards.length < b.boards.length;
  if (Math.abs(x.maiorRetalho - y.maiorRetalho) > EPS)
    return x.maiorRetalho > y.maiorRetalho;
  if (Math.abs(x.areaRetalhos - y.areaRetalhos) > EPS)
    return x.areaRetalhos > y.areaRetalhos;
  return x.cortes < y.cortes;
}
function availableSlots(tree, last = null, phase = 0, result = []) {
  if (tree.tipo === "retalho" && tree.w > EPS && tree.h > EPS)
    result.push({
      x: tree.x,
      y: tree.y,
      w: tree.w,
      h: tree.h,
      last,
      phase,
      leaf: tree,
    });
  for (const child of tree.filhos || [])
    availableSlots(child, tree.eixo || last, tree.fase ?? phase, result);
  return result;
}
// Recoloca todas as peças de uma chapa nas sobras de outras do MESMO grupo.
function consolidate(plan, lines, machine, deadline) {
  const units = new Map(expandPieces(lines).map((p) => [p.unitId, p]));
  let best = plan,
    removed = 0,
    changed = true;
  while (changed && Date.now() < deadline) {
    changed = false;
    const sources = [...best.boards].sort(
      (a, b) =>
        (a.stock.source === "material" ? 0 : 1) -
          (b.stock.source === "material" ? 0 : 1) ||
        a.pieces.reduce((n, p) => n + area(p), 0) -
          b.pieces.reduce((n, p) => n + area(p), 0),
    );
    for (const source of sources) {
      if (best.boards.length === 1 || Date.now() >= deadline) break;
      for (let trial = 0; trial < 8 && Date.now() < deadline; trial++) {
        const targets = best.boards
          .filter((b) => b.id !== source.id)
          .map((b) => {
            const tree = structuredClone(b.tree);
            return {
              ...b,
              tree,
              pieces: b.pieces.map((p) => ({ ...p })),
              free: availableSlots(tree),
            };
          });
        let success = true;
        for (const p of orderedUnits(
          source.pieces.map((p) => units.get(p.unitId)),
          trial,
        )) {
          const choices = [];
          for (const b of targets)
            b.free.forEach((slot, i) =>
              choices.push(...candidatesFor(b, slot, i, p, machine, trial)),
            );
          choices.sort((a, b) => compareRank(a.rank, b.rank));
          const c = choices[0];
          if (!c) {
            success = false;
            break;
          }
          constructPlacement(c.slot, c.shape, c.axis, machine, p, c.free);
          c.board.free.splice(c.index, 1, ...c.free);
          c.board.pieces.push({
            unitId: p.unitId,
            codigo: p.codigo,
            descricao: p.descricao,
            x: c.slot.x,
            y: c.slot.y,
            ...c.shape,
          });
        }
        if (!success) continue;
        try {
          const checked = validatePlan(
            { boards: targets.map(({ free, ...b }) => b), machine },
            lines,
          );
          if (better(checked, best)) {
            best = checked;
            removed++;
            changed = true;
            break;
          }
        } catch {}
      }
      if (changed) break;
    }
  }
  return { plan: best, removed };
}
export function analyzeMaterials(plan, lines, materials, scraps = []) {
  const groups = new Map();
  for (const p of lines) {
    const key = groupKey(p);
    if (!groups.has(key)) groups.set(key, { sample: p, lines: [] });
    groups.get(key).lines.push(p);
  }
  const list = [...groups].map(([key, g]) => {
    const stocks = materials.filter((m) => groupKey(m) === key),
      boards = plan.boards.filter((b) => groupKey(b.stock) === key),
      available = [
        ...new Map(
          [
            ...scraps.filter(
              (s) => groupKey(s) === key && s.status === "disponivel",
            ),
            ...boards
              .filter((b) => b.stock.source === "scrap")
              .map((b) => b.stock),
          ].map((s) => [s.id, s]),
        ).values(),
      ],
      totalArea = g.lines.reduce(
        (n, p) => n + p.largura * p.comprimento * p.quantidade,
        0,
      ),
      capacity = Math.max(0, ...stocks.map((s) => area(useful(s)))),
      scrapArea = available.reduce((n, s) => n + area(useful(s)), 0),
      lower =
        capacity > 0
          ? Math.max(0, Math.ceil((totalArea - scrapArea - EPS) / capacity))
          : 0,
      newSheets = boards.filter((b) => b.stock.source === "material").length,
      remnants = boards.flatMap((b) => b.retalhos || []),
      usefulRemnants = remnants.filter(
        (r) =>
          Math.min(r.w, r.h) >= plan.machine.minimoRetalhoLargura &&
          Math.max(r.w, r.h) >= plan.machine.minimoRetalhoComprimento,
      );
    return {
      chave: key,
      material: g.sample.material,
      acabamento: g.sample.acabamento,
      fornecedor: g.sample.fornecedor || "",
      linha: g.sample.linha || "",
      espessura: g.sample.espessura,
      unidades: g.lines.reduce((n, p) => n + p.quantidade, 0),
      chapasNovas: newSheets,
      sobrasUsadas: boards.length - newSheets,
      chapas: boards.map((b) => b.id),
      areaPecas: totalArea,
      areaUtilPorChapa: capacity,
      limiteInferiorChapasNovas: lower,
      minimoChapasComprovado: newSheets === lower,
      maiorSobra: Math.max(0, ...usefulRemnants.map(area)),
      sobrasReaproveitaveis: usefulRemnants.length,
    };
  });
  const lower = list.reduce((n, g) => n + g.limiteInferiorChapasNovas, 0),
    newSheets = plan.boards.filter((b) => b.stock.source === "material").length;
  return {
    grupos: list,
    limiteInferiorChapasNovas: lower,
    minimoChapasComprovado: list.every((g) => g.minimoChapasComprovado),
    chapasNovas: newSheets,
    criterios:
      "Material, acabamento, fornecedor, linha, espessura, área útil e estoque de sobras considerados. O limite de área não prova a melhor distribuição nem a menor perda.",
  };
}
export function optimize({
  lines,
  materials,
  scraps,
  machine,
  attempts = 80,
  baselinePlan = null,
}) {
  const all = expandPieces(lines),
    groups = new Map();
  for (const line of lines) {
    const key = groupKey(line);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(line);
  }
  const stocks = [
      ...scraps
        .filter((s) => s.status === "disponivel")
        .map((s) => ({ ...s, source: "scrap" })),
      ...materials.map((s) => ({ ...s, source: "material" })),
    ],
    started = Date.now(),
    globalDeadline = started + 10000,
    result = [];
  let tried = 0,
    consolidated = 0,
    baseAccepted = false;
  let baseline = null;
  if (baselinePlan)
    try {
      baseline = validatePlan({ ...baselinePlan, machine }, lines);
      baseAccepted = true;
    } catch {}
  const entries = [...groups];
  for (let groupIndex = 0; groupIndex < entries.length; groupIndex++) {
    const [key, groupLines] = entries[groupIndex],
      units = all.filter((p) => groupKey(p) === key),
      pool = stocks.filter((s) => groupKey(s) === key),
      deadline = Math.min(
        globalDeadline,
        Date.now() +
          Math.max(
            50,
            (globalDeadline - Date.now()) / (entries.length - groupIndex),
          ),
      );
    ensure(
      pool.length,
      `Não há chapa ou sobra cadastrada para ${groupLines[0].acabamento} ${groupLines[0].espessura} mm.`,
    );
    let best = null,
      lastError = "Não foi encontrado plano de corte válido.";
    if (baseline) {
      const boards = baseline.boards.filter((b) => groupKey(b.stock) === key);
      try {
        best = validatePlan({ boards, machine }, groupLines);
      } catch {}
    }
    for (let trial = 0; trial < attempts && Date.now() < deadline; trial++) {
      try {
        const checked = validatePlan(
          pack(
            units,
            pool,
            machine,
            trial,
            best?.metrics.chapasNovas ?? Infinity,
          ),
          groupLines,
          { improveCuts: false },
        );
        if (better(checked, best)) best = checked;
      } catch (e) {
        lastError = e.message;
      }
      tried++;
    }
    ensure(best, lastError);
    const improved = consolidate(
      best,
      groupLines,
      machine,
      Math.min(globalDeadline, Date.now() + 300),
    );
    best = improved.plan;
    consolidated += improved.removed;
    result.push(...best.boards);
  }
  const checked = validatePlan(
    { boards: result.map((b, i) => ({ ...b, id: `chapa-${i + 1}` })), machine },
    lines,
  );
  return {
    ...checked,
    analysis: analyzeMaterials(checked, lines, materials, scraps),
    search: {
      tentativas: tried,
      tentativasPorMaterial: attempts,
      tempoMs: Date.now() - started,
      metodo:
        "Busca por material com múltiplas ordenações, divisões em X/Y e consolidação de chapas.",
      chapasConsolidadas: consolidated,
      planoBaseConsiderado: baseAccepted,
      otimoGlobalComprovado: false,
    },
  };
}
