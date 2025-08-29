// labelpdf.js
const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");
const QRCode = require("qrcode");

async function makeQrPngBuffer(text) {
  return QRCode.toBuffer(text, { type: "png", margin: 0, scale: 6 });
}

async function pdfForBox({ boxId, location, url, outPath }) {
  const doc = new PDFDocument({ size: "A7", margin: 12 }); // compact label size
  const stream = fs.createWriteStream(outPath);
  doc.pipe(stream);

  doc.fontSize(18).text(`BOX ${boxId}`, { continued: false });
  if (location) doc.fontSize(12).fillColor("#444").text(`Loc: ${location}`).fillColor("#000");

  const qr = await makeQrPngBuffer(url);
  doc.image(qr, { fit: [180, 180], align: "left" });

  doc.fontSize(8).fillColor("#444").text(url, { width: 260 });
  doc.end();

  await new Promise((res) => stream.on("finish", res));
  return outPath;
}

async function pdfForItem({ materialNumber, itemUUID, url, outPath }) {
  const doc = new PDFDocument({ size: "A7", margin: 12 });
  const stream = fs.createWriteStream(outPath);
  doc.pipe(stream);

  doc.fontSize(16).text(`MatNr: ${materialNumber || "-"}`);
  doc.fontSize(12).fillColor("#444").text(`UID: ${(itemUUID || "").slice(-6).toUpperCase()}`).fillColor("#000");

  const qr = await makeQrPngBuffer(url);
  doc.image(qr, { fit: [180, 180], align: "left" });

  doc.fontSize(8).fillColor("#444").text(url, { width: 260 });
  doc.end();

  await new Promise((res) => stream.on("finish", res));
  return outPath;
}

module.exports = { pdfForBox, pdfForItem };
