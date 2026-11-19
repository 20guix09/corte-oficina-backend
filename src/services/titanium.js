import { XMLParser, XMLValidator } from "fast-xml-parser";
import { ensure } from "../errors.js";
import { materialConvention } from "../../public/material-conventions.js";

const prefix = "br.com.scmtecmatic.titanium.",
  list = value => value === undefined ? [] : Array.isArray(value) ? value : [value],
  attr = (node, key) => String(node?.["@_" + key] ?? "").slice(0, 1000),
  clean = value => String(value || "").normalize("NFC").trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR"),
  signature = (w, h, t) => [...[w, h].sort((a, b) => a - b), t].map(n => Math.round(n * 1000) / 1000).join("|");
function positive(value, name, min = 0.001, max = 100000) {
  ensure(value !== "" && /^\d+(?:\.\d+)?$/.test(value), `${name}: número inválido no lote.`);
  const n = Number(value);
  ensure(Number.isFinite(n) && n >= min && n <= max, `${name}: fora do limite no lote.`);
  return n;
}
function quantity(node, allowZero = false) {
  const n = positive(attr(node, "quantity") || "1", "Quantidade", allowZero ? 0 : 1, 500);
  ensure(Number.isSafeInteger(n), "Quantidade fracionária no lote.");
  return n;
}
function dimensions(text, unit) {
  const match = String(text).match(/^Dimens[ãa]o:\s*(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*(?:cm|mm)?\s*$/i);
  if (!match) return null;
  const explicit = text.match(/(cm|mm)\s*$/i)?.[1]?.toLowerCase(),
    factor = (explicit || unit) === "cm" ? 10 : 1,
    values = match.slice(1, 4).map(n => Math.round(Number(n.replace(",", ".")) * factor * 1000) / 1000);
  return values.every(n => n > 0 && n <= 100000) ? {w: values[0], h: values[1], espessura: values[2]} : null;
}

// Somente leitura. Os tipos de comando são preservados, nunca executados ou reinterpretados.
export function parseTitanium(source, unit = "cm") {
  ensure(["cm", "mm"].includes(unit), "Unidade das etiquetas deve ser cm ou mm.");
  ensure(typeof source === "string" && Buffer.byteLength(source, "utf8") <= 2 * 1024 * 1024, "Lote deve ter até 2 MB.");
  ensure(!/<!DOCTYPE|<!ENTITY/i.test(source), "Lote com DTD ou entidades declaradas não é aceito.");
  ensure(XMLValidator.validate(source) === true, "Arquivo de lote XML inválido.");
  const parsed = new XMLParser({ignoreAttributes: false, attributeNamePrefix: "@_", parseAttributeValue: false, processEntities: true}).parse(source),
    root = parsed[prefix + "lote"];
  ensure(root && typeof root === "object" && !Array.isArray(root), "O arquivo não é um lote SCM Titanium reconhecido.");
  ensure(attr(root, "version") === "Version1", "Versão de lote não suportada por este leitor. Esperado: Version1.");
  const materialNodes = list(root[prefix + "lote.material"]);
  ensure(materialNodes.length > 0 && materialNodes.length <= 100, "Lote sem materiais ou acima do limite de 100 materiais.");
  const materials = [], programs = [], parts = [], types = new Map(), materialIds = new Set();
  let commandsTotal = 0, units = 0;
  for (const node of materialNodes) {
    const id = attr(node, "id");
    ensure(id && !materialIds.has(id), "Identificação de material ausente ou repetida no lote.");
    materialIds.add(id);
    const material = {
      id, codigo: attr(node, "code"), descricao: attr(node, "description"), cor: attr(node, "color"), tipo: attr(node, "type"),
      comprimento: positive(attr(node, "lenght"), "Comprimento da chapa"),
      largura: positive(attr(node, "width"), "Largura da chapa"),
      espessura: positive(attr(node, "thickness"), "Espessura da chapa", 0.001, 200),
    };
    materials.push(material);
    const nodes = list(node[prefix + "lote.material.programa"]), seen = new Set();
    ensure(nodes.length > 0 && programs.length + nodes.length <= 500, "Lote sem programas ou acima do limite de 500 programas.");
    for (const program of nodes) {
      const pid = attr(program, "id");
      ensure(pid && !seen.has(pid), "Identificação de programa ausente ou repetida no material.");seen.add(pid);
      const p = {
        id: pid, materialId: id, numero: attr(program, "number"), quantidade: quantity(program),
        comprimento: positive(attr(program, "lenght"), "Comprimento do programa"),
        largura: positive(attr(program, "width"), "Largura do programa"),
        espessura: positive(attr(program, "thickness"), "Espessura do programa", 0.001, 200),
        comandos: [],
      };
      const cuts = list(program[prefix + "lote.material.programa.corte"]), cutIds = new Set();
      ensure(cuts.length > 0 && commandsTotal + cuts.length <= 10000, "Lote sem comandos ou acima do limite de 10000 comandos.");
      for (const cut of cuts) {
        const cid = attr(cut, "id"), type = attr(cut, "type");
        ensure(cid && !cutIds.has(cid) && type, "Comando sem identificação/tipo ou com identificação repetida.");cutIds.add(cid);
        const c = {id: cid, tipo: type, valor: positive(attr(cut, "value"), "Valor do comando", 0), quantidade: quantity(cut, true)};
        p.comandos.push(c);commandsTotal++;types.set(type, (types.get(type) || 0) + 1);
        for (const data of list(cut[prefix + "lote.material.programa.corte.dados"])) {
          const fields = list(data[prefix + "lote.material.programa.corte.dados.campo"]);
          ensure(fields.length <= 100 && parts.length < 5000, "Limite de etiquetas excedido.");
          const values = fields.map(f => attr(f, "value")),
            piece = values.find(s => /^Pe[çc]a:/i.test(s)) || "",
            dimText = values.find(s => /^Dimens[ãa]o:/i.test(s)) || "",
            image = fields.find(f => attr(f, "name") === "4"),
            count = quantity(data) * p.quantidade;
          units += count;ensure(units <= 5000, "Lote acima do limite de 5000 unidades etiquetadas.");
          parts.push({
            codigo: piece.match(/^Pe[çc]a:\s*(.*?)\s+-\s+/i)?.[1] || "",
            descricao: piece.replace(/^Pe[çc]a:\s*.*?\s+-\s+/i, ""),
            dimensoes: dimensions(dimText, unit), dimensoesTexto: dimText, quantidade: count,
            materialId: id, programaId: pid, comandoId: cid, imagem: attr(image, "value"),
          });
        }
      }
      programs.push(p);
    }
  }
  return {
    nome: attr(root, "code"), versaoFormato: attr(root, "version"), unidadeEtiqueta: unit,
    materiais: materials, programas: programs, pecas: parts, tiposComando: Object.fromEntries(types),
    resumo: {materiais: materials.length, programas: programs.length, chapasProgramadas: programs.reduce((n,p) => n + p.quantidade, 0), comandos: commandsTotal, etiquetas: parts.length, unidadesEtiquetadas: units, unidadesSemMedidas: parts.filter(p => !p.dimensoes).reduce((n,p) => n + p.quantidade, 0)},
    execucaoValidada: false,
  };
}

function materialMatches(piece, material) {
  // A descrição e a cor são comparadas em conjunto; um cadastro de tipo vazio não vira MDF.
  const base = clean(piece.material) === clean(material.tipo) && Math.abs(piece.espessura - material.espessura) < 0.001;
  const finish = clean(piece.acabamento), supplier = clean(piece.fornecedor), line = clean(piece.linha),
    short = supplier && finish.startsWith(supplier + ".") ? finish.slice(supplier.length + 1) : finish,
    color = [line, short].filter(Boolean).join("."),
    description = [supplier, line, short].filter(Boolean).join(".") + ` - ${clean(piece.material)} - ${piece.espessura}`;
  return base && clean(material.cor) === color && (!supplier || clean(material.descricao) === description);
}
export function compareTitanium(reference, lines, {perfilCadastros = "literal"} = {}) {
  const expected = new Map(), actual = new Map(),
    add = (map, key, q) => map.set(key, (map.get(key) || 0) + q);
  for (const p of lines) add(expected, signature(p.largura,p.comprimento,p.espessura),p.quantidade);
  for (const p of reference.pecas) if (p.dimensoes) add(actual, signature(p.dimensoes.w,p.dimensoes.h,p.dimensoes.espessura),p.quantidade);
  const differences = [...new Set([...expected.keys(),...actual.keys()])].flatMap(key => {
    const e=expected.get(key)||0,a=actual.get(key)||0;
    return e === a ? [] : [{medidasMm:key.split("|").map(Number),quantidadeProjeto:e,quantidadeLote:a}];
  });
  const direct = [], unmatched = new Set(reference.pecas);
  const codeCounts = new Map();
  for (const p of lines) add(codeCounts, p.codigo, 1);
  for (const p of lines) {
    if (codeCounts.get(p.codigo) !== 1) continue;
    const refs=reference.pecas.filter(r => r.codigo && r.codigo===p.codigo);
    for (const r of refs) {
      unmatched.delete(r);
      const m=reference.materiais.find(m=>m.id===r.materialId),
        size=!!r.dimensoes && signature(p.largura,p.comprimento,p.espessura)===signature(r.dimensoes.w,r.dimensoes.h,r.dimensoes.espessura);
      const sourceMeaning = materialConvention(p, perfilCadastros), targetMeaning = materialConvention(m, perfilCadastros),
        sameThickness = Math.abs(p.espessura - m.espessura) < 0.001,
        known = sameThickness && ((targetMeaning?.codigo === "formato-especial" && clean(p.material) === "mdf" &&
          (sourceMeaning?.codigo === "branco-uma-face" || ["branco","cores.branco"].includes(clean(p.acabamento)))) ||
          (sourceMeaning?.codigo === "branco-uma-face" && clean(p.material) === clean(m.tipo) && ["branco","cores.branco"].includes(clean(m.cor)))),
        xmlL = Number(p.chapaXml?.comprimento), xmlW = Number(p.chapaXml?.largura),
        hasFormat = Number.isFinite(xmlL) && xmlL > 0 && Number.isFinite(xmlW) && xmlW > 0;
      direct.push({codigo:p.codigo,descricao:p.descricao,
        materialProjeto:[p.fornecedor,p.linha,p.acabamento,p.material,`${p.espessura} mm`].filter(Boolean).join(" · "),
        materialLote:m.descricao||m.cor,medidasConferem:size,materialConfere:materialMatches(p,m),
        interpretacaoProjeto:sourceMeaning?.texto || "",interpretacaoLote:targetMeaning?.texto || "",
        nomeOperacionalExplicado:!!known,
        formatoProjeto:hasFormat ? [xmlL,xmlW] : null, formatoLote:[m.comprimento,m.largura],
        formatoDiferente:hasFormat ? Math.abs(xmlL-m.comprimento)>0.001 || Math.abs(xmlW-m.largura)>0.001 : null,
      });
    }
  }
  return {
    ...reference, perfilCadastros,
    materiais: reference.materiais.map(m=>({...m,interpretacao:materialConvention(m,perfilCadastros)?.texto || ""})),
    comparacao: {
      unidadesProjeto:lines.reduce((n,p)=>n+p.quantidade,0),
      medidasEQuantidadesConferem: reference.resumo.unidadesSemMedidas === 0 && differences.length === 0,
      diferencasMedidas:differences, correspondenciasPorCodigo:direct,
      divergenciasMaterial:direct.filter(r=>!r.materialConfere).length,
      nomesOperacionaisExplicados:direct.filter(r=>!r.materialConfere && r.nomeOperacionalExplicado).length,
      divergenciasNaoExplicadas:direct.filter(r=>!r.materialConfere && !r.nomeOperacionalExplicado).length,
      etiquetasSemCodigoCorrespondente:unmatched.size,
      materiaisIntegralmenteConferidos:unmatched.size===0 && direct.length>0 && direct.every(r=>r.materialConfere),
    },
    aviso:"Conferência de referência. Coincidência de medidas não comprova o pedido, o sentido do veio ou a execução na máquina. Os comandos não foram homologados. Nenhum cadastro, peça, plano ou estoque foi alterado.",
  };
}
