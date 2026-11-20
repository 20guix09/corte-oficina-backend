import { pieceColor } from "./domain.js";
import { materialConvention } from "./material-conventions.js";
import { drawBoard } from "./editor.js";
export const escapeHtml = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export const measure = (n) =>
  (Number(n) / 10).toLocaleString("pt-BR", { maximumFractionDigits: 3 });
export const decimal = (n, d = 2) =>
  Number(n || 0).toLocaleString("pt-BR", { maximumFractionDigits: d });
const area = (p) => p.w * p.h;
const letters = (i) => {
  let s = "";
  for (i++; i; i = Math.floor((i - 1) / 26))
    s = String.fromCharCode(65 + ((i - 1) % 26)) + s;
  return s;
};
export function buildReport(plan, project = {}, lines = [], company = "") {
  if (!Array.isArray(plan?.boards) || !plan.boards.length || !plan.machine)
    return null;
  if (
    plan.boards.some(
      (b) =>
        !b?.stock ||
        !b.stock.refilos ||
        !["esquerda", "direita", "superior", "inferior"].every(
          (k) => Number.isFinite(b.stock.refilos[k]) && b.stock.refilos[k] >= 0,
        ) ||
        !Array.isArray(b.pieces) ||
        ![b.stock.comprimento, b.stock.largura, b.stock.espessura].every(
          (n) => Number.isFinite(n) && n > 0,
        ) ||
        b.pieces.some((p) => ![p.x, p.y, p.w, p.h].every(Number.isFinite)),
    )
  )
    return null;
  const source = new Map((plan.pecasSnapshot || lines).map((p) => [p.id, p])),
    groups = new Map();
  for (const board of plan.boards)
    for (const p of board.pieces) {
      const id = String(p.unitId).split(":")[0];
      if (!groups.has(id)) groups.set(id, letters(groups.size));
    }
  const steps = Array.isArray(plan.steps) ? plan.steps : null;
  const boards = plan.boards.map((b, index) => {
    const legend = new Map();
    const pieces = b.pieces.map((p) => {
      const id = String(p.unitId).split(":")[0],
        original = source.get(id),
        letter = groups.get(id),
        unit = String(p.unitId).split(":").at(-1);
      const q = {
        ...p,
        codigo: p.codigo || original?.codigo || letter,
        descricao: p.descricao || original?.descricao || "Peça",
        bordas: original?.bordas || "",
        larguraOriginal: original?.largura,
        comprimentoOriginal: original?.comprimento,
        letra: letter,
        identificacao: letter + unit,
        color: pieceColor(id),
      };
      const legendKey = JSON.stringify([id, p.w, p.h]);
      const entry = legend.get(legendKey) || {
        letra: letter,
        codigo: q.codigo,
        descricao: q.descricao,
        w: p.w,
        h: p.h,
        color: q.color,
        quantidade: 0,
      };
      entry.quantidade++;
      legend.set(legendKey, entry);
      return q;
    });
    const retalhos = (Array.isArray(b.retalhos) ? b.retalhos : []).map(
      (r, i) => ({
        ...r,
        id: r.id || `${b.id}:r${i + 1}`,
        reaproveitavel:
          Math.min(r.w, r.h) >= plan.machine.minimoRetalhoLargura &&
          Math.max(r.w, r.h) >= plan.machine.minimoRetalhoComprimento,
      }),
    );
    return {
      ...b,
      numero: index + 1,
      nomeOperacional: materialConvention(b.stock, plan.machine.perfilCadastros)?.resumo || "",
      pieces,
      retalhos,
      legend: [...legend.values()],
      summary: {
        pecas: pieces.length,
        cortes: steps ? steps.filter((s) => s.chapa === b.id).length : null,
        aproveitamento:
          (100 * pieces.reduce((n, p) => n + area(p), 0)) /
          (b.stock.comprimento * b.stock.largura),
        quantidadeSobras: retalhos.length,
        sobrasReaproveitaveis: retalhos.filter((r) => r.reaproveitavel).length,
        areaSobras: retalhos.reduce((n, r) => n + area(r), 0),
      },
    };
  });
  const usable = boards
    .flatMap((b) => b.retalhos)
    .filter((r) => r.reaproveitavel);
  const metrics = {
    chapasNovas: boards.filter((b) => b.stock.source !== "scrap").length,
    retalhosUsados: boards.filter((b) => b.stock.source === "scrap").length,
    aproveitamento:
      (100 * boards.flatMap((b) => b.pieces).reduce((n, p) => n + area(p), 0)) /
      boards.reduce((n, b) => n + b.stock.comprimento * b.stock.largura, 0),
    cortes: steps ? steps.length : null,
    maiorRetalho: Math.max(0, ...usable.map(area)),
    areaRetalhos: usable.reduce((n, r) => n + area(r), 0),
    custoChapas: boards
      .filter((b) => b.stock.source !== "scrap")
      .reduce((n, b) => n + Number(b.stock.custo || 0), 0),
    quantidadeSobras: boards.reduce((n, b) => n + b.retalhos.length, 0),
    sobrasReaproveitaveis: usable.length,
  };
  const iso = plan.geradoEm || plan.criadoEm || new Date().toISOString();
  return {
    project,
    company,
    boards,
    totalBoards: boards.length,
    metrics,
    machine: plan.machine,
    planId: plan.id || "",
    status: plan.status || "revisao",
    projectVersion: plan.projectVersion,
    date: iso,
    dateLabel: new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      dateStyle: "short",
      timeStyle: "medium",
    }).format(Number.isNaN(Date.parse(iso)) ? new Date() : new Date(iso)),
    unidade: "cm",
    importado: project.origemXml || {},
  };
}
export function reportSections(report, namespace = "report") {
  const e = escapeHtml;
  return report.boards
    .map(
      (b) =>
        `<section class="cut-report"><header class="report-header"><div class="report-title"><strong>${e(report.company || "Corte Oficina")}</strong><span>PLANO DE CORTE · CHAPA ${b.numero}/${report.totalBoards || report.boards.length}</span></div><div class="report-meta"><div><b>Cliente:</b> ${e(report.project.cliente || report.importado.cliente || "Não informado")}<br><b>Projeto:</b> ${e(report.project.nome || "Não informado")}<br><b>Pedido:</b> ${e(report.project.pedido || report.importado.pedido || "Não informado")}<br><b>Descrição:</b> ${e([b.nomeOperacional, b.stock.descricaoMaterial || [b.stock.linha, b.stock.acabamento].filter(Boolean).join(" · ") || b.stock.acabamento].filter(Boolean).join(" · "))}<br><b>Código da chapa:</b> ${e(b.stock.codigoMaterial || b.stock.codigo || b.stock.id?.slice(0, 8) || "Não informado")}</div><div><b>Dimensão:</b> ${measure(b.stock.comprimento)} × ${measure(b.stock.largura)} × ${measure(b.stock.espessura)} cm<br><b>Fornecedor:</b> ${e(b.stock.fornecedor || "Não informado no XML")}<br><b>Material:</b> ${e(b.stock.material)}<br><b>Acabamento:</b> ${e(b.stock.acabamento)}<br><b>Configuração:</b> ${e(report.machine.nome || "Serra")} · Serra ${decimal(report.machine.serra)} mm · ${report.machine.fases} fases</div><div><b>Peças:</b> ${b.summary.pecas}<br><b>Cortes internos:</b> ${b.summary.cortes ?? "—"}<br><b>Aproveitamento:</b> ${decimal(b.summary.aproveitamento)}%<br><b>Sobras:</b> ${b.summary.quantidadeSobras} (${b.summary.sobrasReaproveitaveis} reaproveitáveis)<br><b>Data/hora:</b> ${e(report.dateLabel)}</div></div></header><div class="report-layout"><aside class="report-legend"><b>Peças · cm</b><table><thead><tr><th>Ref.</th><th>Medidas / qtd.</th></tr></thead><tbody>${b.legend.map((q) => `<tr><td><i style="background:${q.color}"></i>${e(q.letra)}</td><td>${measure(q.w)} × ${measure(q.h)} · ${q.quantidade} un.<br><small>${e(q.codigo)} · ${e(q.descricao)}</small></td></tr>`).join("")}</tbody></table><p>Peças em cores.<br>Sobras em branco.<br>Refilos em cinza.</p></aside><div class="report-drawing">${drawBoard(b, null, null, e, { id: `${namespace}-svg-${b.numero}`, dimensions: true })}</div></div><footer class="report-footer">Medidas do desenho em cm. Chapa ${b.stock.comprimento} × ${b.stock.largura} × ${b.stock.espessura} mm. Refilos E/D/S/I: ${["esquerda", "direita", "superior", "inferior"].map((k) => b.stock.refilos[k]).join(" / ")} mm. Revisão ${report.projectVersion} · ${e(report.status)}. Cortes internos; refilos externos não entram na contagem.</footer></section>`,
    )
    .join("");
}
