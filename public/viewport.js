// Zoom e navegação alteram apenas a visualização, nunca as medidas das peças.
export function mountViewport(panel, initial = {}, onChange = () => {}) {
  const viewport = panel.querySelector("[data-viewport]"),
    surface = panel.querySelector("[data-surface]"),
    doc = panel.ownerDocument;
  const state = { zoom: 1, left: 0, top: 0, expanded: false, ...initial };
  const min = 0.25,
    max = 5;
  let pan = null,
    space = false;
  const buttons = {
      in: panel.querySelector("[data-zoom-in]"),
      out: panel.querySelector("[data-zoom-out]"),
      fit: panel.querySelector("[data-zoom-fit]"),
      expand: panel.querySelector("[data-zoom-expand]"),
    },
    label = panel.querySelector("[data-zoom-label]");
  function remember() {
    state.left = viewport.scrollLeft;
    state.top = viewport.scrollTop;
    onChange({ ...state });
  }
  function paint() {
    surface.style.width = `${state.zoom * 100}%`;
    viewport.dataset.zoom = String(state.zoom);
    if (label) label.textContent = Math.round(state.zoom * 100) + "%";
    if (buttons.in) buttons.in.disabled = state.zoom >= max;
    if (buttons.out) buttons.out.disabled = state.zoom <= min;
    panel.classList.toggle("is-expanded", state.expanded);
    if (buttons.expand)
      buttons.expand.textContent = state.expanded
        ? "Sair da tela cheia"
        : "Tela cheia";
  }
  function zoomTo(value, point) {
    const old = state.zoom,
      next = Math.max(min, Math.min(max, value));
    if (next === old) return;
    const box = viewport.getBoundingClientRect(),
      x = point ? point.x - box.left : viewport.clientWidth / 2,
      y = point ? point.y - box.top : viewport.clientHeight / 2,
      localX = (viewport.scrollLeft + x) / old,
      localY = (viewport.scrollTop + y) / old;
    state.zoom = next;
    paint();
    viewport.scrollLeft = Math.max(0, localX * next - x);
    viewport.scrollTop = Math.max(0, localY * next - y);
    remember();
  }
  function fit() {
    state.zoom = 1;
    paint();
    viewport.scrollLeft = 0;
    viewport.scrollTop = 0;
    remember();
  }
  function expand() {
    state.expanded = !state.expanded;
    paint();
    remember();
    buttons.expand?.focus();
  }
  if (buttons.in) buttons.in.onclick = () => zoomTo(state.zoom + 0.25);
  if (buttons.out) buttons.out.onclick = () => zoomTo(state.zoom - 0.25);
  if (buttons.fit) buttons.fit.onclick = fit;
  if (buttons.expand) buttons.expand.onclick = expand;
  const wheel = (event) => {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    zoomTo(state.zoom * Math.exp(-event.deltaY * 0.0015), {
      x: event.clientX,
      y: event.clientY,
    });
  };
  const keydown = (event) => {
    if (event.key === "Escape" && state.expanded) {
      state.expanded = false;
      paint();
      remember();
      buttons.expand?.focus();
      return;
    }
    if (!panel.contains(doc.activeElement)) return;
    if (state.expanded && event.key === "Tab") {
      const all = [
        ...panel.querySelectorAll('button:not(:disabled),[tabindex="0"]'),
      ];
      if (
        all.length &&
        ((event.shiftKey && doc.activeElement === all[0]) ||
          (!event.shiftKey && doc.activeElement === all.at(-1)))
      ) {
        event.preventDefault();
        (event.shiftKey ? all.at(-1) : all[0]).focus();
        return;
      }
    }
    if (
      event.code === "Space" &&
      !/INPUT|TEXTAREA|SELECT/.test(event.target.tagName)
    ) {
      space = true;
      event.preventDefault();
    }
    if (
      ["+", "=", "-", "0"].includes(event.key) &&
      !/INPUT|TEXTAREA|SELECT/.test(event.target.tagName)
    ) {
      event.preventDefault();
      if (event.key === "0") fit();
      else zoomTo(state.zoom + (event.key === "-" ? -0.25 : 0.25));
    }
  };
  const keyup = (event) => {
    if (event.code === "Space") space = false;
  };
  const down = (event) => {
    const blank = !event.target.closest("[data-unit]");
    if (event.button === 0) viewport.focus({ preventScroll: true });
    if (
      event.button !== 1 &&
      !(event.button === 0 && (space || (blank && state.zoom > 1)))
    )
      return;
    event.preventDefault();
    event.stopPropagation();
    pan = {
      x: event.clientX,
      y: event.clientY,
      left: viewport.scrollLeft,
      top: viewport.scrollTop,
    };
    viewport.classList.add("is-panning");
    viewport.setPointerCapture?.(event.pointerId);
  };
  const move = (event) => {
    if (!pan) return;
    event.preventDefault();
    viewport.scrollLeft = Math.max(0, pan.left - (event.clientX - pan.x));
    viewport.scrollTop = Math.max(0, pan.top - (event.clientY - pan.y));
    remember();
  };
  const up = () => {
    pan = null;
    viewport.classList.remove("is-panning");
  };
  viewport.addEventListener("wheel", wheel, { passive: false });
  viewport.addEventListener("scroll", remember);
  viewport.addEventListener("pointerdown", down, true);
  viewport.addEventListener("pointermove", move);
  viewport.addEventListener("pointerup", up);
  viewport.addEventListener("pointercancel", up);
  doc.addEventListener("keydown", keydown);
  doc.addEventListener("keyup", keyup);
  paint();
  viewport.scrollLeft = state.left;
  viewport.scrollTop = state.top;
  if (state.expanded) viewport.focus({ preventScroll: true });
  return {
    zoomTo,
    fit,
    getState: () => ({ ...state }),
    destroy() {
      remember();
      viewport.removeEventListener("wheel", wheel);
      viewport.removeEventListener("scroll", remember);
      viewport.removeEventListener("pointerdown", down, true);
      viewport.removeEventListener("pointermove", move);
      viewport.removeEventListener("pointerup", up);
      viewport.removeEventListener("pointercancel", up);
      doc.removeEventListener("keydown", keydown);
      doc.removeEventListener("keyup", keyup);
    },
  };
}
