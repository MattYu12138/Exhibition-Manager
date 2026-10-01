const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');

// Avery J8168: A4 sheet (210 x 297 mm), 2 labels at 199.6 x 143.53 mm.
// Margins are centred on the page: 5.2 mm on either side and 4.97 mm top/bottom.
const MM = 72 / 25.4;
const SHEET_WIDTH = 210 * MM;
const SHEET_HEIGHT = 297 * MM;
const LABEL_WIDTH = 199.6 * MM;
const LABEL_HEIGHT = 143.53 * MM;
const LABEL_LEFT = (SHEET_WIDTH - LABEL_WIDTH) / 2;
const LABEL_TOP = (SHEET_HEIGHT - 2 * LABEL_HEIGHT) / 2;
const QR_SIZE = 59 * MM;

// QR content intentionally matches the single-shelf QR route: the public-facing
// URL is made from the configured frontend origin and the stable location token.
async function createJ8168Labels(locations, frontendUrl, layoutId) {
  if (!Array.isArray(locations) || locations.length < 1 || locations.length > 500) {
    throw new RangeError('Expected 1–500 selected locations');
  }
  const origin = String(frontendUrl).replace(/\/$/, '');
  const images = await Promise.all(locations.map(location => QRCode.toBuffer(
    `${origin}/scan/${encodeURIComponent(location.qr_token)}`,
    { width: 450, margin: 2, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff' } },
  )));

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: [SHEET_WIDTH, SHEET_HEIGHT], margin: 0, autoFirstPage: false,
      info: { Title: 'Warehouse shelf QR labels - Avery J8168', Author: 'Lummi in Colour' },
    });
    const parts = [];
    doc.on('data', part => parts.push(part));
    doc.on('end', () => resolve(Buffer.concat(parts)));
    doc.on('error', reject);
    try {
      locations.forEach((location, index) => {
        if (index % 2 === 0) doc.addPage();
        const y = LABEL_TOP + (index % 2) * LABEL_HEIGHT;
        const x = LABEL_LEFT;
        // The code/ID are deliberately language-neutral and never include stock
        // counts. Labels stay valid when inventory quantities later change.
        // Built-in PDF fonts are ASCII-only: use the stable ID if a code is CJK.
        const code = /^[\x20-\x7e]+$/.test(String(location.code)) ? String(location.code) : String(location.id);
        const size = code.length > 19 ? 18 : code.length > 10 ? 24 : 34;
        doc.font('Helvetica-Bold').fontSize(size).fillColor('#172d3e')
          .text(code, x + 9 * MM, y + 13 * MM, {
            width: LABEL_WIDTH - 18 * MM, height: 17 * MM, align: 'center', ellipsis: true, lineBreak: false,
          });
        doc.image(images[index], x + (LABEL_WIDTH - QR_SIZE) / 2, y + 41 * MM, {
          width: QR_SIZE, height: QR_SIZE,
        });
        doc.font('Helvetica').fontSize(12).fillColor('#273f4d')
          .text(String(layoutId), x + 8 * MM, y + 111 * MM, {
            width: LABEL_WIDTH - 16 * MM, align: 'center', lineBreak: false,
          });
      });
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

module.exports = { createJ8168Labels, J8168: {
  sheetWidth: SHEET_WIDTH, sheetHeight: SHEET_HEIGHT, labelWidth: LABEL_WIDTH,
  labelHeight: LABEL_HEIGHT, left: LABEL_LEFT, top: LABEL_TOP,
} };
