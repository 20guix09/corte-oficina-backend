// Identidade compartilhada entre o servidor e o editor. Não contém dados privados.
const normalize = (value) =>
  String(value ?? "")
    .normalize("NFC")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("pt-BR");
export const materialKey = (p) =>
  JSON.stringify([
    normalize(p.material),
    normalize(p.acabamento),
    Number(p.espessura),
    normalize(p.fornecedor),
  ]);
export const whiteRotationRule = (p) =>
  normalize(p.acabamento) === "branco" &&
  (!p.linha || normalize(p.linha) === "cores");
export const DEFAULT_SHEET = Object.freeze({
  comprimento: 2750,
  largura: 1830,
  refilos: Object.freeze({
    esquerda: 15,
    direita: 15,
    superior: 15,
    inferior: 15,
  }),
});
export const palette = [
  "#c5dee6",
  "#d2e4c8",
  "#ead8bd",
  "#ddd2e9",
  "#c8e1d8",
  "#e7cfd1",
  "#d6dcf1",
  "#e8e2bd",
];
export function pieceColor(id) {
  let value = 0;
  for (const c of String(id).split(":")[0])
    value = (value * 31 + c.charCodeAt(0)) >>> 0;
  return palette[value % palette.length];
}
