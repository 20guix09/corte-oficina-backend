import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { mountViewport } from "../public/viewport.js";
function fixture() {
  const dom = new JSDOM(
      '<section id="panel"><button data-zoom-out>-</button><output data-zoom-label></output><button data-zoom-in>+</button><button data-zoom-fit>Ajustar</button><button data-zoom-expand>Tela cheia</button><div data-viewport tabindex="0"><div data-surface><svg><rect data-unit="p:1" x="15" y="20" width="100" height="200"/></svg></div></div></section>',
    ),
    panel = dom.window.document.querySelector("#panel"),
    v = panel.querySelector("[data-viewport]");
  Object.defineProperty(v, "clientWidth", { value: 400 });
  Object.defineProperty(v, "clientHeight", { value: 200 });
  v.getBoundingClientRect = () => ({
    left: 0,
    top: 0,
    width: 400,
    height: 200,
  });
  return { dom, panel, v };
}
test("zoom, ajuste e tela cheia não alteram coordenadas nem dimensões", () => {
  const { dom, panel, v } = fixture();
  let remembered;
  const c = mountViewport(panel, {}, (s) => (remembered = s)),
    rect = panel.querySelector("rect"),
    before = rect.outerHTML;
  panel.querySelector("[data-zoom-in]").click();
  assert.equal(v.dataset.zoom, "1.25");
  assert.equal(panel.querySelector("[data-zoom-label]").textContent, "125%");
  v.dispatchEvent(
    new dom.window.WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
      deltaY: -300,
      clientX: 200,
      clientY: 100,
    }),
  );
  assert.ok(c.getState().zoom > 1.25);
  assert.equal(rect.outerHTML, before);
  panel.querySelector("[data-zoom-expand]").click();
  assert.equal(panel.classList.contains("is-expanded"), true);
  dom.window.document.dispatchEvent(
    new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
  );
  assert.equal(panel.classList.contains("is-expanded"), false);
  panel.querySelector("[data-zoom-fit]").click();
  assert.deepEqual([c.getState().zoom, v.scrollLeft, v.scrollTop], [1, 0, 0]);
  assert.equal(rect.outerHTML, before);
  assert.ok(remembered);
  c.destroy();
  dom.window.close();
});
test("pan move a visualização e os limites do zoom são respeitados", () => {
  const { dom, panel, v } = fixture();
  const c = mountViewport(panel, { zoom: 2, left: 100, top: 80 });
  v.dispatchEvent(
    new dom.window.MouseEvent("pointerdown", {
      bubbles: true,
      button: 0,
      clientX: 200,
      clientY: 100,
    }),
  );
  v.dispatchEvent(
    new dom.window.MouseEvent("pointermove", {
      bubbles: true,
      clientX: 150,
      clientY: 70,
    }),
  );
  v.dispatchEvent(new dom.window.MouseEvent("pointerup", { bubbles: true }));
  assert.deepEqual([v.scrollLeft, v.scrollTop], [150, 110]);
  c.zoomTo(20);
  assert.equal(c.getState().zoom, 5);
  assert.equal(panel.querySelector("[data-zoom-in]").disabled, true);
  c.zoomTo(0.01);
  assert.equal(c.getState().zoom, 0.25);
  assert.equal(panel.querySelector("[data-zoom-out]").disabled, true);
  c.destroy();
  dom.window.close();
});
