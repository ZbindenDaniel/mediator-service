module.exports = {
  HOSTNAME: 'http://192.168.1.19',
  HTTP_PORT: parseInt(process.env.HTTP_PORT || "8080", 10),
  DB_PATH: process.env.DB_PATH || "./data/mediator.sqlite",
  INBOX_DIR: process.env.INBOX_DIR || "./data/inbox",
  ARCHIVE_DIR: process.env.ARCHIVE_DIR || "./data/archive",
  PRINTER_HOST: process.env.PRINTER_HOST || "Brother DCP-7030",
  PRINTER_PORT: parseInt(process.env.PRINTER_PORT || "9100", 10),
  BASE_QR_URL: process.env.BASE_QR_URL || "http://localhost:8080/qr",
  BASE_UI_URL: process.env.BASE_UI_URL || "http://localhost:8080/ui"  // ← NEW, used for box QR
};
