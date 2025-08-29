// print.js
const net = require("net");
const { PRINTER_HOST, PRINTER_PORT, BASE_QR_URL, BASE_UI_URL } = require("./config");

// unchanged
function zplForItem({ materialNumber, itemUUID }) {
  const shortUid = (itemUUID || "").slice(-6).toUpperCase();
  const url = `${BASE_QR_URL}/${encodeURIComponent(itemUUID)}`;
  return `^XA
^CI28
^PW600^LL380
^FO30,30^A0N,40,40^FDMatNr: ${materialNumber || "-"}^FS
^FO30,80^A0N,30,30^FDUID: ${shortUid}^FS
^FO30,130^BQN,2,8^FDLA,${url}^FS
^XZ`;
}

// unchanged
function zplForBox({ boxId, location }) {
  const url = `${BASE_UI_URL}/box/${encodeURIComponent(boxId)}`;
  const loc = location ? `Loc: ${location}` : "";
  return `^XA
^CI28
^PW600^LL380
^FO30,30^A0N,48,48^FDBOX ${boxId}^FS
^FO30,90^A0N,32,32^FD${loc}^FS
^FO30,150^BQN,2,8^FDLA,${url}^FS
^XZ`;
}

// return {sent:boolean, reason?:string}
function sendZpl(zpl) {
  return new Promise((resolve, reject) => {
    if (!PRINTER_HOST || !PRINTER_PORT) {
      return resolve({ sent: false, reason: "not_configured" });
    }
    const socket = net.createConnection({ host: PRINTER_HOST, port: PRINTER_PORT }, () => {
      socket.write(zpl, "utf8", () => socket.end());
    });
    socket.on("error", (err) => resolve({ sent: false, reason: err.message || "socket_error" }));
    socket.on("close", () => resolve({ sent: true }));
  });
}

function testPrinterConnection() {
  return new Promise((resolve) => {
    if (!PRINTER_HOST || !PRINTER_PORT) return resolve({ ok: false, reason: "not_configured" });
    const socket = net.createConnection({ host: PRINTER_HOST, port: PRINTER_PORT }, () => {
      socket.end(); resolve({ ok: true });
    });
    socket.on("error", (err) => resolve({ ok: false, reason: err.message || "socket_error" }));
  });
}
module.exports = { zplForItem, zplForBox, sendZpl, testPrinterConnection };

