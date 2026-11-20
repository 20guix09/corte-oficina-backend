import { drawBoard, setupDrag } from "./editor.js";
import { mountViewport } from "./viewport.js";
import { escapeHtml as esc } from "./report.js";
const promob = new URLSearchParams(location.search).get("projeto") === "promob";
const data = await (await fetch(promob ? "/demo-promob.json" : "/exemplo-editor.json")).json(),
  root = document.querySelector("#example-editor"),
  views = new Map();
let index = 0,
  selected = null,
  controller,
  modified = false;
function render() {
  controller?.destroy();
  const b = data.boards[index],
    part = b.pieces.find((p) => p.unitId === selected);
  root.innerHTML = `<div class="row between"><h1>${promob ? "Projeto de demonstração" : "Editor · exemplo fictício"}</h1><a href="/">Voltar ao sistema</a></div><p class="notice">${promob ? "Este plano foi calculado a partir do XML de exemplo, com duas portas, três laterais e quatro prateleiras." : "Este exemplo testa a visualização."} Alterações aqui não são validadas nem salvas em pedidos da empresa.</p><div class="report-nav"><button id="example-prev" ${index === 0 ? "disabled" : ""}>← Anterior</button><label>Chapa<select id="example-board">${data.boards.map((q, i) => `<option value="${i}" ${index === i ? "selected" : ""}>Chapa ${i + 1} · ${esc(q.stock.acabamento)} · ${q.stock.espessura} mm</option>`).join("")}</select></label><button id="example-next" ${index === data.boards.length - 1 ? "disabled" : ""}>Próxima →</button></div><section class="card"><h2 id="example-title">Chapa ${index + 1} de ${data.boards.length} · ${esc(b.stock.acabamento)} <span class="thickness-badge">${b.stock.espessura} mm</span></h2><div id="example-panel" class="canvas-panel"><div class="zoom-toolbar"><button data-zoom-out aria-label="Diminuir zoom">−</button><output data-zoom-label></output><button data-zoom-in aria-label="Aumentar zoom">+</button><button data-zoom-fit>Ajustar à tela</button><button data-zoom-expand>Tela cheia</button></div><div class="canvas" data-viewport tabindex="0"><div data-surface>${drawBoard(b, selected, null, esc, { showRemnants: !modified })}</div></div></div><p id="example-position">${part ? `${esc(part.codigo)}: X ${part.x} / Y ${part.y} mm · ${part.w} × ${part.h} mm` : "Clique em uma peça para selecionar. Use os controles para ampliar."}</p></section>`;
  const panel = document.querySelector("#example-panel"),
    id = b.id;
  controller = mountViewport(panel, views.get(id), (s) => views.set(id, s));
  setupDrag(
    document.querySelector("#board-svg"),
    b,
    (id) => {
      selected = id;
      render();
    },
    (id, x, y) => {
      const p = b.pieces.find((q) => q.unitId === id);
      modified ||= p.x !== x || p.y !== y;
      p.x = x;
      p.y = y;
      selected = id;
    },
  );
  const go = (i) => {
    index = i;
    selected = null;
    render();
  };
  document.querySelector("#example-prev").onclick = () => go(index - 1);
  document.querySelector("#example-next").onclick = () => go(index + 1);
  document.querySelector("#example-board").onchange = (e) =>
    go(Number(e.target.value));
}
render();
