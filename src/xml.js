import { XMLParser, XMLValidator } from "fast-xml-parser";
import { ensure } from "./errors.js";
import { piece } from "./validation.js";
const array = (value) =>
  value === undefined ? [] : Array.isArray(value) ? value : [value];
export function parsePromobDocument(source) {
  ensure(
    typeof source === "string" &&
      Buffer.byteLength(source, "utf8") <= 2 * 1024 * 1024,
    "XML deve ter até 2 MB.",
  );
  ensure(
    !/<!DOCTYPE|<!ENTITY/i.test(source),
    "XML com DTD ou entidades declaradas não é aceito.",
  );
  ensure(XMLValidator.validate(source) === true, "XML inválido.");
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
  const root = normalize(raw).LISTING;
  ensure(
    root?.ID === "Listagem_chapas" && root.UNIT === "MM",
    "Use a Listagem de Chapas do Promob em milímetros.",
  );
  const pieces = [];
  function walk(item, depth = 0) {
    ensure(depth < 30, "XML excede o limite de agrupamento.");
    const children = array(item.ITEMS?.ITEM);
    if (children.length) {
      children.forEach((child) => walk(child, depth + 1));
      return;
    }
    const refs = item.REFERENCES || {},
      ref = (name) => String(refs[name]?.REFERENCE ?? ""),
      decimal = (value) => Number(String(value ?? "").replace(",", "."));
    pieces.push({
      ...piece({
        codigo: String(item.UNIQUEID || item.ID || ""),
        descricao: item.DESCRIPTION,
        largura: decimal(item.WIDTH),
        comprimento: decimal(item.DEPTH),
        espessura: decimal(ref("THICKNESS") || item.HEIGHT),
        quantidade: decimal(item.REPETITION),
        material: ref("MATERIAL"),
        acabamento: ref("MODEL"),
        fornecedor: ref("SUPPLIER"),
        linha: ref("LINE"),
        descricaoMaterial: ref("MODEL_DESCRIPTION"),
        codigoMaterial: ref("MATERIAL_CODE") || ref("PRICE"),
        giroPermitido: false,
        giroOrigem: "xml",
        bordas: [1, 2, 3, 4]
          .map((i) => `${i}: ${ref("FITA_BORDA_" + i) || "—"}`)
          .join(" / "),
        referencia: item.REFERENCE || "",
        orientacaoXml: item.PLATECUTTINGROTATE || "",
      }),
      chapaXml: { comprimento: ref("MAXWIDTH"), largura: ref("MAXDEPTH") },
    });
    ensure(pieces.length <= 500, "XML excede 500 linhas.");
  }
  const ambients = array(root.AMBIENTS?.AMBIENT);
  for (const ambient of ambients)
    for (const category of array(ambient.CATEGORIES?.CATEGORY))
      for (const item of array(category.ITEMS?.ITEM)) walk(item);
  ensure(pieces.length > 0, "XML não contém peças.");
  ensure(
    pieces.reduce((n, p) => n + p.quantidade, 0) <= 500,
    "XML excede 500 unidades neste piloto.",
  );
  const customer = array(root.CUSTOMERSDATA?.DATA).find(
    (p) => p.ID === "nomecliente",
  );
  const descricao = ambients
    .map((a) => String(a.DESCRIPTION || ""))
    .filter(Boolean)
    .join(" / ")
    .slice(0, 1000);
  // Somente dados necessários ao plano. CPF, endereço, contatos e serial do Promob ficam fora.
  return {
    pieces,
    metadata: {
      cliente: String(customer?.VALUE || "").slice(0, 200),
      descricao,
      pedido: descricao.match(/\bPED(?:IDO)?\.?\s*([\w.-]+)/i)?.[1] || "",
      data: String(root.DATE || "").slice(0, 30),
      hora: String(root.HOUR || "").slice(0, 30),
    },
  };
}
export const parsePromob = (source) => parsePromobDocument(source).pieces;
