import { ensure } from "./errors.js";
export function object(value) {
  ensure(
    value && typeof value === "object" && !Array.isArray(value),
    "Envie um objeto JSON.",
  );
  return value;
}
export function text(value, name, max = 200) {
  ensure(
    typeof value === "string" &&
      value.trim().length > 0 &&
      value.trim().length <= max,
    `${name}: informe um texto de 1 a ${max} caracteres.`,
  );
  return value.trim();
}
export function number(value, name, min = 0, max = 100000) {
  ensure(
    typeof value === "number" &&
      Number.isFinite(value) &&
      value >= min &&
      value <= max,
    `${name}: informe número entre ${min} e ${max}.`,
  );
  return value;
}
export function integer(value, name, min, max) {
  number(value, name, min, max);
  ensure(Number.isSafeInteger(value), `${name} deve ser inteiro.`);
  return value;
}
export function bool(value, fallback = false) {
  if (value === undefined) return fallback;
  ensure(typeof value === "boolean", "Use true ou false para giroPermitido.");
  return value;
}
export function piece(body) {
  object(body);
  return {
    codigo: text(body.codigo, "Código"),
    descricao: text(body.descricao, "Descrição"),
    largura: number(body.largura, "Largura", 0.001),
    comprimento: number(body.comprimento, "Comprimento", 0.001),
    espessura: number(body.espessura, "Espessura", 0.001, 200),
    quantidade: integer(body.quantidade, "Quantidade", 1, 500),
    material: text(body.material, "Material"),
    acabamento: text(body.acabamento, "Acabamento"),
    giroPermitido: bool(body.giroPermitido),
    bordas: text(body.bordas || "Não informadas", "Bordas", 1000),
    referencia:
      typeof body.referencia === "string" ? body.referencia.slice(0, 500) : "",
    orientacaoXml:
      typeof body.orientacaoXml === "string"
        ? body.orientacaoXml.slice(0, 100)
        : "",
    ...(body.chapaXml && typeof body.chapaXml === "object"
      ? {
          chapaXml: {
            comprimento: String(body.chapaXml.comprimento ?? "").slice(0, 40),
            largura: String(body.chapaXml.largura ?? "").slice(0, 40),
          },
        }
      : {}),
  };
}
export function project(body) {
  object(body);
  return {
    nome: text(body.nome, "Nome"),
    cliente:
      typeof body.cliente === "string" ? body.cliente.slice(0, 200).trim() : "",
    pedido:
      typeof body.pedido === "string" ? body.pedido.slice(0, 200).trim() : "",
    observacoes:
      typeof body.observacoes === "string"
        ? body.observacoes.slice(0, 2000)
        : "",
    status: "rascunho",
  };
}
export function margins(body) {
  object(body);
  return Object.fromEntries(
    ["esquerda", "direita", "superior", "inferior"].map((key) => [
      key,
      number(body[key], `Refilo ${key}`, 0, 1000),
    ]),
  );
}
export function material(body) {
  object(body);
  const data = {
    material: text(body.material, "Material"),
    acabamento: text(body.acabamento, "Acabamento"),
    espessura: number(body.espessura, "Espessura", 0.001, 200),
    largura: number(body.largura, "Largura da chapa", 1),
    comprimento: number(body.comprimento, "Comprimento da chapa", 1),
    custo: number(body.custo ?? 0, "Custo", 0, 1000000),
    refilos: margins(body.refilos),
  };
  ensure(
    data.comprimento > data.refilos.esquerda + data.refilos.direita &&
      data.largura > data.refilos.superior + data.refilos.inferior,
    "Refilos eliminam a área útil.",
  );
  return data;
}
export function scrap(body) {
  const data = material(body);
  return {
    ...data,
    codigo: text(body.codigo, "Código"),
    local: text(body.local, "Local"),
    status: "disponivel",
  };
}
export function machine(body) {
  object(body);
  return {
    nome: text(body.nome, "Nome"),
    serra: number(body.serra, "Serra", 0.01, 20),
    corteMaximo: number(body.corteMaximo, "Corte máximo", 1),
    fases: integer(body.fases, "Fases", 1, 20),
    minimoRetalhoLargura: number(
      body.minimoRetalhoLargura,
      "Largura mínima do retalho",
      1,
    ),
    minimoRetalhoComprimento: number(
      body.minimoRetalhoComprimento,
      "Comprimento mínimo do retalho",
      1,
    ),
  };
}
export const groupKey = (p) =>
  JSON.stringify([p.material, p.acabamento, p.espessura]);
export function expandPieces(lines) {
  ensure(lines.length > 0, "Cadastre ou importe as peças primeiro.");
  const total = lines.reduce((sum, p) => sum + p.quantidade, 0);
  ensure(
    total <= 500,
    "O piloto aceita até 500 unidades por projeto. Divida pedidos maiores.",
  );
  return lines.flatMap((line) =>
    Array.from({ length: line.quantidade }, (_, i) => ({
      ...line,
      unitId: `${line.id}:${i + 1}`,
    })),
  );
}
