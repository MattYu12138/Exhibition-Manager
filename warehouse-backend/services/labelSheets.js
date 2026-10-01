const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const Barcode = require('bwip-js');

// Avery J8168: A4 sheet (210 x 297 mm), 2 labels at 199.6 x 143.53 mm.
const MM = 72 / 25.4;
const SHEET_WIDTH = 210 * MM;
const SHEET_HEIGHT = 297 * MM;
const LABEL_WIDTH = 199.6 * MM;
const LABEL_HEIGHT = 143.53 * MM;
const LABEL_LEFT = (SHEET_WIDTH - LABEL_WIDTH) / 2;
const LABEL_TOP = (SHEET_HEIGHT - 2 * LABEL_HEIGHT) / 2;
const QR_SIZE = 52 * MM;
const PRODUCTS_PER_LABEL = 2;
const MAX_LABELS = 1000;

// Most existing eight-digit product identifiers have no valid EAN-8 check digit.
// Code128 encodes the exact eight digits without modifying their values.
function isEightDigits(value) {
  return typeof value === 'string' && /^[0-9]{8}$/.test(value.trim());
}

async function createJ8168Labels(locations, frontendUrl, layoutId) {
  if (!Array.isArray(locations) || locations.length < 1 || locations.length > 500) {
    throw new RangeError('Expected 1–500 selected locations');
  }
  const origin = String(frontendUrl).replace(/\/$/, '');
  const pages = locations.flatMap(location => {
    const items = Array.isArray(location.products) ? location.products : [];
    const labelCount = Math.max(1, Math.ceil(items.length / PRODUCTS_PER_LABEL));
    return Array.from({ length: labelCount }, (_, index) => ({
      location,
      products: items.slice(index * PRODUCTS_PER_LABEL, (index + 1) * PRODUCTS_PER_LABEL),
      part: index + 1,
      parts: labelCount,
    }));
  });
  if (pages.length > MAX_LABELS) throw new RangeError('Too many product labels: split the shelf selection');

  const qrImages = new Map();
  const barcodeImages = new Map();
  for (const location of locations) {
    qrImages.set(location.id, await QRCode.toBuffer(
      `${origin}/scan/${encodeURIComponent(location.qr_token)}`,
      { width: 450, margin: 2, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff' } },
    ));
    for (const product of location.products || []) {
      const code = String(product.barcode ?? '').trim();
      if (isEightDigits(code) && !barcodeImages.has(code)) {
        barcodeImages.set(code, await Barcode.toBuffer({
          bcid: 'code128', text: code, scale: 3, height: 12, includetext: false,
          paddingwidth: 0, paddingheight: 0, backgroundcolor: 'FFFFFF',
        }));
      }
    }
  }

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: [SHEET_WIDTH, SHEET_HEIGHT], margin: 0, autoFirstPage: false,
      info: { Title: 'Warehouse product QR labels - Avery J8168', Author: 'Lummi in Colour' },
    });
    const parts = [];
    doc.on('data', part => parts.push(part));
    doc.on('end', () => resolve(Buffer.concat(parts)));
    doc.on('error', reject);
    try {
      pages.forEach((page, index) => {
        if (index % 2 === 0) doc.addPage();
        const y = LABEL_TOP + (index % 2) * LABEL_HEIGHT;
        const x = LABEL_LEFT;
        const shelfCode = /^[\x20-\x7e]+$/.test(String(page.location.code))
          ? String(page.location.code) : String(page.location.id);
        const titleSize = shelfCode.length > 19 ? 18 : shelfCode.length > 10 ? 24 : 30;
        doc.font('Helvetica-Bold').fontSize(titleSize).fillColor('#172d3e')
          .text(shelfCode, x + 12 * MM, y + 11 * MM, {
            width: LABEL_WIDTH - 24 * MM, height: 17 * MM, align: 'left',
            ellipsis: true, lineBreak: false,
          });
        doc.font('Helvetica').fontSize(9).fillColor('#51606b')
          .text(String(layoutId), x + 13 * MM, y + 29 * MM, {
            width: 55 * MM, align: 'left', lineBreak: false,
          });
        doc.image(qrImages.get(page.location.id), x + 13 * MM, y + 46 * MM, {
          width: QR_SIZE, height: QR_SIZE,
        });
        doc.font('Helvetica').fontSize(10).fillColor('#172d3e')
          .text('SCAN SHELF', x + 13 * MM, y + 103 * MM, {
            width: QR_SIZE, align: 'center', lineBreak: false,
          });
        // Vertical rule keeps the location QR visually distinct from product barcodes.
        doc.moveTo(x + 74 * MM, y + 35 * MM).lineTo(x + 74 * MM, y + 130 * MM)
          .strokeColor('#c5d0d5').lineWidth(0.6).stroke();
        const right = x + 80 * MM;
        const rightWidth = 108 * MM;
        page.products.forEach((product, slot) => {
          const rowY = y + (slot ? 84 : 38) * MM;
          if (slot) doc.moveTo(right, y + 80 * MM).lineTo(right + rightWidth, y + 80 * MM)
            .strokeColor('#dbe2e5').lineWidth(0.5).stroke();
          // A full two-line product title has space reserved before the SKU line.
          doc.font('Helvetica-Bold').fontSize(11.5).fillColor('#142936')
            .text(String(product.product_title || 'Unnamed product'), right, rowY, {
              width: rightWidth, height: 12 * MM, ellipsis: true,
            });
          doc.font('Helvetica').fontSize(9).fillColor('#314650')
            .text(`SIZE: ${String(product.variant_title || '—')}    SKU: ${String(product.sku || '—')}`,
              right, rowY + 13 * MM, { width: rightWidth, height: 7 * MM, ellipsis: true });
          const code = String(product.barcode ?? '').trim();
          if (barcodeImages.has(code)) {
            const barcodeY = rowY + 22 * MM;
            doc.image(barcodeImages.get(code), right + 2 * MM, barcodeY, {
              fit: [65 * MM, 13 * MM], align: 'left', valign: 'center',
            });
            doc.font('Helvetica').fontSize(10.5).fillColor('#142936')
              .text(code, right, rowY + 36 * MM, { width: 68 * MM, align: 'center', lineBreak: false });
          } else {
            doc.font('Helvetica').fontSize(10).fillColor('#904934')
              .text('8-DIGIT BARCODE NOT RECORDED', right, rowY + 28 * MM,
                { width: rightWidth, lineBreak: false });
          }
        });
        if (page.products.length === 0) {
          doc.font('Helvetica').fontSize(13).fillColor('#546671')
            .text('No stocked products on this shelf', right, y + 57 * MM,
              { width: rightWidth, align: 'left' });
        }
        if (page.parts > 1) {
          doc.font('Helvetica').fontSize(9).fillColor('#51606b')
            .text(`${page.part} / ${page.parts}`, x + LABEL_WIDTH - 27 * MM, y + 130 * MM,
              { width: 15 * MM, align: 'right', lineBreak: false });
        }
      });
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

module.exports = { createJ8168Labels, isEightDigits, J8168: {
  sheetWidth: SHEET_WIDTH, sheetHeight: SHEET_HEIGHT, labelWidth: LABEL_WIDTH,
  labelHeight: LABEL_HEIGHT, left: LABEL_LEFT, top: LABEL_TOP,
} };
