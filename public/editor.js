import { pieceColor } from "./domain.js";
const cm = (n) =>
  (Number(n) / 10).toLocaleString("pt-BR", { maximumFractionDigits: 3 });
export function drawBoard(board, selected, cut, escape, options = {}) {
  const stock = board.stock,
    r = stock.refilos,
    W = stock.comprimento,
    H = stock.largura,
    dim = options.dimensions !== false,
    F = Math.max(24, W / 66),
    id = options.id || "board-svg";
  const truncate = (s, n) =>
    String(s).length > n
      ? String(s).slice(0, Math.max(1, n - 1)) + "…"
      : String(s);
  return `<svg id="${escape(id)}" class="sheet-svg" viewBox="${dim ? "-95 -65 " + (W + 145) + " " + (H + 165) : "0 0 " + W + " " + H}" role="img" aria-label="Plano da chapa ${W} por ${H} milímetros; peças coloridas e sobras em branco">
 <rect class="stock-border" width="${W}" height="${H}" fill="#edf0f2" stroke="#536775" stroke-width="3"/>
 <rect x="${r.esquerda}" y="${r.superior}" width="${W - r.esquerda - r.direita}" height="${H - r.superior - r.inferior}" fill="#fff"/>
 ${(options.showRemnants === false ? [] : board.retalhos || []).map((q) => (q.w > 1 && q.h > 1 ? `<g class="remnant"><rect x="${q.x}" y="${q.y}" width="${q.w}" height="${q.h}" fill="#ffffff" stroke="#8c9ca5" stroke-width="1.3" stroke-dasharray="7 5"/>${q.w > 260 && q.h > 100 ? `<text x="${q.x + q.w / 2}" y="${q.y + q.h / 2}" text-anchor="middle" dominant-baseline="middle" font-size="${Math.min(F * 0.8, q.h * 0.4)}" fill="#596b76">${cm(q.w)} × ${cm(q.h)}</text>` : ""}</g>` : "")).join("")}
 ${board.pieces
   .map((p) => {
     const f = Math.max(5, Math.min(F, p.h / 3.8, p.w / 5)),
       name = truncate(p.descricao || "Peça", Math.floor(p.w / (f * 0.55)));
     return `<g><rect class="part ${p.unitId === selected ? "selected" : ""}" data-unit="${escape(p.unitId)}" x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" fill="${p.color || pieceColor(p.unitId)}" stroke="#627c8c" stroke-width="1.5"/><text class="part-code" x="${p.x + 7}" y="${p.y + f}" font-size="${f * 0.7}">${escape(p.identificacao || p.codigo || p.unitId.split(":").at(-1))}</text>${p.w > 80 && p.h > 65 ? `<text x="${p.x + p.w / 2}" y="${p.y + p.h / 2}" text-anchor="middle" dominant-baseline="middle" font-size="${f}">${escape(name)}</text><text x="${p.x + p.w / 2}" y="${p.y + p.h - 9}" text-anchor="middle" font-size="${f * 0.88}">${cm(p.w)}</text><text transform="translate(${p.x + f * 0.85} ${p.y + p.h / 2}) rotate(-90)" text-anchor="middle" font-size="${f * 0.88}">${cm(p.h)}</text>` : ""}<title>${escape(p.codigo || "")} · ${escape(p.descricao || "Peça")} · ${p.w} × ${p.h} mm</title></g>`;
   })
   .join("")}
 ${cut ? `<line class="cutline" x1="${cut.eixo === "x" ? cut.posicao : cut.bloco.x}" x2="${cut.eixo === "x" ? cut.posicao : cut.bloco.x + cut.bloco.w}" y1="${cut.eixo === "y" ? cut.posicao : cut.bloco.y}" y2="${cut.eixo === "y" ? cut.posicao : cut.bloco.y + cut.bloco.h}"/>` : ""}
 ${dim ? `<g class="dimension" fill="#294b61" stroke="#294b61" stroke-width="2"><path d="M 0 ${H + 27} v 24 M ${W} ${H + 27} v 24 M 0 ${H + 39} H ${W}" fill="none"/><text x="${W / 2}" y="${H + 82}" text-anchor="middle" stroke="none" font-size="${F}">${cm(W)} cm</text><path d="M -25 0 h -24 M -25 ${H} h -24 M -37 0 V ${H}" fill="none"/><text transform="translate(-59 ${H / 2}) rotate(-90)" text-anchor="middle" stroke="none" font-size="${F}">${cm(H)} cm</text></g>` : ""}
 </svg>`;
}
export function setupDrag(svg, board, onSelect, onMove) {
  let drag;
  function point(event) {
    return new DOMPoint(event.clientX, event.clientY).matrixTransform(
      svg.getScreenCTM().inverse(),
    );
  }
  svg.addEventListener("pointerdown", (event) => {
    const target = event.target.closest("[data-unit]");
    if (!target) return;
    const piece = board.pieces.find((p) => p.unitId === target.dataset.unit),
      p = point(event);
    drag = {
      piece,
      dx: p.x - piece.x,
      dy: p.y - piece.y,
      group: target.parentNode,
    };
    svg.setPointerCapture(event.pointerId);
    event.preventDefault();
  });
  svg.addEventListener("pointermove", (event) => {
    if (!drag) return;
    const p = point(event);
    drag.group.setAttribute(
      "transform",
      `translate(${p.x - drag.dx - drag.piece.x} ${p.y - drag.dy - drag.piece.y})`,
    );
  });
  svg.addEventListener("pointerup", (event) => {
    if (!drag) return;
    const d = drag;
    drag = null;
    const p = point(event);
    onMove(
      d.piece.unitId,
      Math.round((p.x - d.dx) * 100) / 100,
      Math.round((p.y - d.dy) * 100) / 100,
    );
    onSelect(d.piece.unitId);
  });
  svg.addEventListener("pointercancel", () => {
    if (drag) {
      drag.group.removeAttribute("transform");
      drag = null;
    }
  });
}
