import { XMLParser, XMLValidator } from "fast-xml-parser";
import { ensure } from "./errors.js";
import { piece } from "./validation.js";
const array = (value) =>
  value === undefined ? [] : Array.isArray(value) ? value : [value];
export function parsePromob(source) {
  ensure(
    typeof source === "string" && source.length <= 2000000,
    "XML deve ter até 2 MB.",
  );
  ensure(
    !/<!DOCTYPE|<!ENTITY/i.test(source),
    "XML com DTD ou entidades declaradas não é aceito.",
  );
  ensure(XMLValidator.validate(source) === true, "XML inválido.");
  // Alguns exports têm atributos vazios com o mesmo nome dos elementos (AMBIENTS, ITEMS).
  // Atributos separados evitam sobrescrever os elementos filhos.
  const raw = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    parseAttributeValue: false,
    processEntities: true,
  }).parse(source);
  function normalize(value, depth = 0) {
    ensure(depth < 45, "XML excede o limite de agrupamento.");
    if (Array.isArray(value)) return value.map((v) => normalize(v, depth + 1));
    if (!value || typeof value !== "object") return value;
    const out = Object.create(null);
    for (const [k, v] of Object.entries(value))
      if (k.startsWith("@_")) out[k.slice(2)] = v;
    for (const [k, v] of Object.entries(value))
      if (!k.startsWith("@_")) out[k] = normalize(v, depth + 1);
    return out;
  }
  const parsed = normalize(raw);
  const root = parsed.LISTING;
  ensure(
    root?.ID === "Listagem_chapas" && root.UNIT === "MM",
    "Use a Listagem de Chapas do Promob em milímetros.",
  );
  const pieces = [];
  function walk(item, depth = 0) {
    ensure(depth < 30, "XML excede o limite de agrupamento.");
    const children = array(item.ITEMS?.ITEM);
    if (children.length) {
      for (const child of children) walk(child, depth + 1);
      return;
    }
    const refs = item.REFERENCES || {};
    const ref = (name) => String(refs[name]?.REFERENCE ?? "");
    const decimal = (value) => Number(String(value ?? "").replace(",", "."));
    const data = piece({
      codigo: String(item.UNIQUEID || item.ID || ""),
      descricao: item.DESCRIPTION,
      largura: decimal(item.WIDTH),
      comprimento: decimal(item.DEPTH),
      espessura: decimal(ref("THICKNESS") || item.HEIGHT),
      quantidade: decimal(item.REPETITION),
      material: ref("MATERIAL"),
      acabamento: ref("MODEL"),
      giroPermitido: false,
      bordas: [1, 2, 3, 4]
        .map((i) => `${i}: ${ref("FITA_BORDA_" + i) || "—"}`)
        .join(" / "),
      referencia: item.REFERENCE || "",
      orientacaoXml: item.PLATECUTTINGROTATE || "",
    });
    pieces.push({
      ...data,
      chapaXml: { comprimento: ref("MAXWIDTH"), largura: ref("MAXDEPTH") },
    });
    ensure(pieces.length <= 500, "XML excede 500 linhas.");
  }
  for (const ambient of array(root.AMBIENTS?.AMBIENT))
    for (const category of array(ambient.CATEGORIES?.CATEGORY))
      for (const item of array(category.ITEMS?.ITEM)) walk(item);
  ensure(pieces.length > 0, "XML não contém peças.");
  ensure(
    pieces.reduce((n, p) => n + p.quantidade, 0) <= 500,
    "XML excede 500 unidades neste piloto.",
  );
  return pieces;
}
