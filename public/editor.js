export function drawBoard(board, selected, cut, escape) {
  const colors = ["#bedbe3", "#c2dbc6", "#e9d3ba", "#cfc9e4", "#c4d9d3"];
  const stock = board.stock,
    r = stock.refilos;
  const size = Math.max(18, stock.comprimento / 55);
  return `<svg id="board-svg" viewBox="0 0 ${stock.comprimento} ${stock.largura}" role="img" aria-label="Chapa e peças do plano">
    <rect width="${stock.comprimento}" height="${stock.largura}" fill="#d8dee1"/>
    <rect x="${r.esquerda}" y="${r.superior}" width="${stock.comprimento - r.esquerda - r.direita}" height="${stock.largura - r.superior - r.inferior}" fill="#f8f5e9"/>
    ${board.pieces.map((p, i) => `<g><rect class="part ${p.unitId === selected ? "selected" : ""}" data-unit="${escape(p.unitId)}" x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" fill="${colors[i % colors.length]}"/><text x="${p.x + 8}" y="${p.y + Math.min(p.h / 2 + size / 3, size + 8)}" font-size="${Math.min(size, p.h * 0.5, p.w / Math.max(5, String(p.codigo || "").length))}">${escape(p.codigo || p.unitId.split(":").at(-1))}</text><title>${escape(p.descricao || "Peça")} · ${p.w} × ${p.h} mm</title></g>`).join("")}
    ${cut ? `<line class="cutline" x1="${cut.eixo === "x" ? cut.posicao : cut.bloco.x}" x2="${cut.eixo === "x" ? cut.posicao : cut.bloco.x + cut.bloco.w}" y1="${cut.eixo === "y" ? cut.posicao : cut.bloco.y}" y2="${cut.eixo === "y" ? cut.posicao : cut.bloco.y + cut.bloco.h}"/>` : ""}
  </svg>`;
}
export function setupDrag(svg, board, onSelect, onMove) {
  let drag;
  function point(event) {
    const p = new DOMPoint(event.clientX, event.clientY);
    return p.matrixTransform(svg.getScreenCTM().inverse());
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
      target,
      group: target.parentNode,
    };
    svg.setPointerCapture(event.pointerId);
    event.preventDefault();
  });
  svg.addEventListener("pointermove", (event) => {
    if (!drag) return;
    const p = point(event),
      x = p.x - drag.dx,
      y = p.y - drag.dy;
    drag.group.setAttribute(
      "transform",
      `translate(${x - drag.piece.x} ${y - drag.piece.y})`,
    );
  });
  function end(event) {
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
  }
  svg.addEventListener("pointerup", end);
  svg.addEventListener("pointercancel", () => {
    if (drag) {
      drag.group.removeAttribute("transform");
      drag = null;
    }
  });
}
