import PDFDocument from "pdfkit";
import { measure, decimal } from "../../public/report.js";
export function renderPlanPdf(report) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
        size: "A4",
        layout: "landscape",
        margin: 0,
        autoFirstPage: false,
        bufferPages: true,
        info: {
          Title: `Plano de corte - ${report.project.nome || "Projeto"}`,
          Author: report.company || "Corte Oficina",
        },
      }),
      chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    const text = (value, x, y, width, size = 8, options = {}) =>
      doc
        .font("Helvetica")
        .fontSize(size)
        .fillColor("#203b4c")
        .text(String(value ?? ""), x, y, {
          width,
          height: options.height || 12,
          lineBreak: false,
          ellipsis: true,
          ...options,
        });
    const field = (label, value, x, y, width) =>
      text(
        `${label}: ${value === null || value === undefined || value === "" ? "Não informado" : value}`,
        x,
        y,
        width,
      );
    function legend(entries, y = 156) {
      text("PEÇAS · medidas em cm", 24, y - 17, 150, 9);
      entries.forEach((q, i) => {
        const top = y + i * 18;
        doc.rect(24, top + 2, 7, 7).fill(q.color);
        text(q.letra, 35, top, 20, 8);
        text(
          `${measure(q.w)} x ${measure(q.h)} · ${q.quantidade} un.`,
          56,
          top,
          119,
          8,
        );
        text(`${q.codigo} · ${q.descricao}`, 35, top + 9, 140, 6);
      });
    }
    for (const b of report.boards) {
      doc.addPage();
      text(report.company || "Corte Oficina", 24, 20, 480, 16);
      text(
        `PLANO DE CORTE · CHAPA ${b.numero}/${report.boards.length}`,
        575,
        25,
        240,
        10,
        { align: "right" },
      );
      doc
        .moveTo(24, 43)
        .lineTo(818, 43)
        .lineWidth(0.6)
        .strokeColor("#9fb1bc")
        .stroke();
      const fields1 = [
        ["Cliente", report.project.cliente || report.importado.cliente],
        ["Projeto", report.project.nome],
        ["Pedido", report.project.pedido || report.importado.pedido],
        [
          "Descrição",
          [b.nomeOperacional, b.stock.descricaoMaterial ||
            [b.stock.linha, b.stock.acabamento].filter(Boolean).join(" · ")].filter(Boolean).join(" · "),
        ],
        [
          "Código da chapa",
          b.stock.codigoMaterial || b.stock.codigo || b.stock.id?.slice(0, 8),
        ],
      ];
      const fields2 = [
        [
          "Dimensão",
          `${measure(b.stock.comprimento)} x ${measure(b.stock.largura)} x ${measure(b.stock.espessura)} cm`,
        ],
        ["Fornecedor", b.stock.fornecedor || "Não informado no XML"],
        ["Material", b.stock.material],
        ["Acabamento", b.stock.acabamento],
        [
          "Configuração",
          `${report.machine.nome || "Serra"} · ${report.machine.serra} mm / ${report.machine.fases} fases`,
        ],
      ];
      const fields3 = [
        ["Peças", b.summary.pecas],
        ["Cortes internos", b.summary.cortes ?? "--"],
        ["Aproveitamento", decimal(b.summary.aproveitamento) + "%"],
        [
          "Sobras",
          `${b.summary.quantidadeSobras} / ${b.summary.sobrasReaproveitaveis} úteis`,
        ],
        ["Data/hora", report.dateLabel],
      ];
      fields1.forEach(([k, v], i) => field(k, v, 24, 53 + i * 14, 295));
      fields2.forEach(([k, v], i) => field(k, v, 328, 53 + i * 14, 290));
      fields3.forEach(([k, v], i) => field(k, v, 625, 53 + i * 14, 193));
      legend(b.legend.slice(0, 20));
      const s = Math.min(606 / b.stock.comprimento, 365 / b.stock.largura),
        W = b.stock.comprimento * s,
        H = b.stock.largura * s,
        X = 196 + (606 - W) / 2,
        Y = 155 + (365 - H) / 2,
        r = b.stock.refilos;
      doc.rect(X, Y, W, H).fillAndStroke("#e7ecef", "#536775");
      doc
        .rect(
          X + r.esquerda * s,
          Y + r.superior * s,
          W - (r.esquerda + r.direita) * s,
          H - (r.superior + r.inferior) * s,
        )
        .fill("#ffffff");
      for (const q of b.retalhos) {
        doc
          .save()
          .dash(2, { space: 2 })
          .lineWidth(0.35)
          .rect(X + q.x * s, Y + q.y * s, q.w * s, q.h * s)
          .fillAndStroke("#ffffff", "#9daab2")
          .restore();
        if (q.w * s > 55 && q.h * s > 14)
          text(
            `${measure(q.w)} x ${measure(q.h)}`,
            X + q.x * s + 2,
            Y + (q.y + q.h / 2) * s - 3,
            q.w * s - 4,
            Math.min(8, (q.h * s) / 3),
            { align: "center" },
          );
      }
      for (const q of b.pieces) {
        const x = X + q.x * s,
          y = Y + q.y * s,
          w = q.w * s,
          h = q.h * s;
        doc
          .save()
          .rect(x, y, w, h)
          .fillAndStroke(q.color, "#627c8c")
          .rect(
            x + 0.2,
            y + 0.2,
            Math.max(0.1, w - 0.4),
            Math.max(0.1, h - 0.4),
          )
          .clip();
        if (w > 12 && h > 7) {
          const f = Math.min(10, w / 6, h / 4);
          text(q.identificacao, x + 2, y + 2, w - 4, Math.max(4, f * 0.7));
          if (h > 21) {
            text(q.descricao, x + 4, y + h / 2 - f / 2, w - 8, Math.max(4, f), {
              align: "center",
            });
            text(
              measure(q.w),
              x + 2,
              y + h - f - 2,
              w - 4,
              Math.max(4, f * 0.8),
              { align: "center" },
            );
            if (w > 30)
              doc
                .save()
                .translate(x + 5, y + h / 2)
                .rotate(-90)
                .font("Helvetica")
                .fontSize(Math.max(4, f * 0.8))
                .fillColor("#203b4c")
                .text(measure(q.h), -h / 2, 0, {
                  width: h,
                  align: "center",
                  lineBreak: false,
                })
                .restore();
          }
        }
        doc.restore();
      }
      doc
        .strokeColor("#294b61")
        .lineWidth(0.45)
        .moveTo(X, Y + H + 8)
        .lineTo(X + W, Y + H + 8)
        .stroke()
        .moveTo(X, Y + H + 4)
        .lineTo(X, Y + H + 12)
        .stroke()
        .moveTo(X + W, Y + H + 4)
        .lineTo(X + W, Y + H + 12)
        .stroke();
      text(`${measure(b.stock.comprimento)} cm`, X, Y + H + 15, W, 9, {
        align: "center",
      });
      doc
        .moveTo(X - 9, Y)
        .lineTo(X - 9, Y + H)
        .stroke()
        .moveTo(X - 13, Y)
        .lineTo(X - 5, Y)
        .stroke()
        .moveTo(X - 13, Y + H)
        .lineTo(X - 5, Y + H)
        .stroke();
      doc
        .save()
        .translate(X - 22, Y + H / 2)
        .rotate(-90);
      text(`${measure(b.stock.largura)} cm`, -H / 2, 0, H, 9, {
        align: "center",
      });
      doc.restore();
      text(
        "Coloridas: peças. Brancas: sobras. Cinza: refilos.",
        24,
        540,
        790,
        8,
      );
      text(
        `Chapa ${b.stock.comprimento} x ${b.stock.largura} x ${b.stock.espessura} mm. Refilos E/D/S/I: ${["esquerda", "direita", "superior", "inferior"].map((k) => r[k]).join(" / ")} mm. Revisão ${report.projectVersion} · ${report.status}.`,
        24,
        553,
        790,
        7,
      );
      text(
        "Contagem de cortes internos; refilos externos não incluídos. Plano para conferência do operador.",
        24,
        565,
        790,
        7,
      );
      if (b.legend.length > 20)
        for (let offset = 20; offset < b.legend.length; offset += 20) {
          doc.addPage();
          text(`Chapa ${b.numero} · Continuação da legenda`, 24, 24, 790, 16);
          legend(b.legend.slice(offset, offset + 20), 70);
        }
    }
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(i);
      text(`${i + 1}/${range.count}`, 760, 578, 58, 7, { align: "right" });
    }
    doc.end();
  });
}
