const PDFDocument = require('pdfkit');

const GREEN = '#1F4D3A';
const MUTED = '#5B6B62';
const rs = (n) => `Rs ${Number(n).toLocaleString('en-LK')}`;

function table(doc, { heading, head, rows }) {
  if (doc.y > 660) doc.addPage();
  doc.moveDown(1).font('Helvetica-Bold').fontSize(13).fillColor(GREEN).text(heading, 50);
  doc.moveDown(0.3).font('Helvetica-Bold').fontSize(10).fillColor(MUTED);
  let y = doc.y;
  doc.text(head[0], 50, y).text(head[1], 400, y, { width: 145, align: 'right' });
  doc.font('Helvetica').fillColor('#1E2A24');
  if (!rows.length) doc.moveDown(0.3).text('No records for this period.', 50);
  for (const [a, b] of rows) {
    if (doc.y > 760) doc.addPage();
    doc.moveDown(0.3);
    y = doc.y;
    doc.text(String(a), 50, y, { width: 340 }).text(String(b), 400, y, { width: 145, align: 'right' });
  }
}

// Summary used by the F1 monthly report and the F2 impact report.
function sendImpactPdf(res, { filename, title, subtitle, totals, tables }) {
  res.type('application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  const doc = new PDFDocument({ size: 'A4', margin: 50, info: { Title: title, Author: 'FoodSave' } });
  doc.pipe(res);
  doc.font('Helvetica-Bold').fontSize(20).fillColor(GREEN).text(title);
  doc.font('Helvetica').fontSize(11).fillColor(MUTED).text(subtitle);
  table(doc, {
    heading: 'Summary',
    head: ['Measure', 'Value'],
    rows: [
      ['Meals saved (packs collected)', totals.meals],
      ['Packs sold at a discount', totals.soldPacks],
      ['Packs donated to charities', totals.donatedPacks],
      ['Food diverted from waste (estimated)', `${totals.kg} kg`],
      ['Cost recovered by restaurants', rs(totals.costRecovered)],
      ['Saved by customers', rs(totals.customerSavings)],
      ['Value of food donated', rs(totals.donationValue)],
    ],
  });
  tables.forEach((t) => table(doc, t));
  doc.moveDown(2).font('Helvetica').fontSize(9).fillColor(MUTED)
    .text(`Generated ${new Date().toISOString().slice(0, 10)}. Weight is estimated per pack: cooked 0.4 kg, bakery and packaged 0.3 kg.`, 50);
  doc.end();
}

module.exports = { sendImpactPdf };
