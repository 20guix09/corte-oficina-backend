import PDFDocument from "pdfkit";
import { measure } from "../../public/report.js";
import { ensure } from "../errors.js";

// Uma página por unidade física. Referências de borda permanecem no cadastro original.
export function labelData(report) {
  const labels = report.boards.flatMap(b => b.pieces.map(p => ({
    unidadeId: p.unitId,
    referencia: p.identificacao,
    codigo: p.codigo,
    descricao: p.descricao,
    chapa: b.numero,
    totalChapas: report.boards.length,
    material: [b.nomeOperacional, b.stock.descricaoMaterial || [b.stock.fornecedor, b.stock.linha, b.stock.acabamento, b.stock.material].filter(Boolean).join(" · ")].filter(Boolean).join(" · "),
    espessura: b.stock.espessura,
    largura: p.larguraOriginal || p.w,
    comprimento: p.comprimentoOriginal || p.h,
    giro: Number.isFinite(p.larguraOriginal) && Number.isFinite(p.comprimentoOriginal)
      ? Math.abs(p.w - p.larguraOriginal) > 0.001 || Math.abs(p.h - p.comprimentoOriginal) > 0.001
      : null,
    bordas: p.bordas || "Não informadas",
  })));
  ensure(labels.length > 0 && labels.length <= 500, "Plano sem peças ou acima de 500 etiquetas.", 409);
  ensure(new Set(labels.map(p => p.unidadeId)).size === labels.length, "Plano com unidades repetidas. Gere outro plano.", 409);
  return labels;
}

export function renderLabelsPdf(report) {
  const labels = labelData(report), mm = 72 / 25.4;
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({size: [100 * mm, 60 * mm], margin: 0, autoFirstPage: false,
      info: {Title: `Etiquetas - ${report.project.nome || "Projeto"}`, Author: report.company || "Corte Oficina"}}), chunks = [];
    doc.on("data", c => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    function text(value, y, size = 8, options = {}) {
      doc.font(options.bold ? "Helvetica-Bold" : "Helvetica").fontSize(size).fillColor("#172f3a")
        .text(String(value ?? "").replace(/[\r\n\t]+/g, " "), 11, y, {
          width: 100 * mm - 22, height: 11, lineBreak: false, ellipsis: true, ...options,
        });
    }
    for (const [index, p] of labels.entries()) {
      doc.addPage();
      text(report.company || "Corte Oficina", 10, 10, {bold: true, width: 195});
      doc.font("Helvetica-Bold").fontSize(11).text(p.referencia, 213, 10, {width: 59, height: 14, align: "right", lineBreak: false, ellipsis: true});
      doc.moveTo(11, 25).lineTo(272, 25).lineWidth(0.5).strokeColor("#a2b3bc").stroke();
      text(`Cliente: ${report.project.cliente || report.importado.cliente || "Não informado"}`, 30);
      text(`Projeto: ${report.project.nome || "Não informado"}`, 42);
      text(`Pedido: ${report.project.pedido || report.importado.pedido || "Não informado"}`, 54);
      text(`Peça ${p.codigo} · ${p.descricao}`, 69, 9, {bold: true, height: 21, lineBreak: true});
      text(`Material: ${p.material} · ${p.espessura} mm`, 93, 7.5, {height: 18, lineBreak: true});
      text(`${measure(p.largura)} x ${measure(p.comprimento)} x ${measure(p.espessura)} cm`, 114, 12, {bold: true, height: 15});
      text(`Chapa ${p.chapa}/${p.totalChapas} · Giro no plano: ${p.giro === null ? "sem registro original" : p.giro ? "90 graus" : "0 grau"}`, 132, 7);
      text(`Bordas (cadastro original): ${p.bordas}`, 143, 6.7, {height: 14, lineBreak: true});
      text(`Rev. ${report.projectVersion ?? "?"} · ${report.status} · ${report.dateLabel} · ${index + 1}/${labels.length}`, 159, 6, {height: 8});
    }
    doc.end();
  });
}
