const net = require("net");
const { PRINTER_HOST, PRINTER_PORT, BASE_QR_URL } = require("./config");

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

function sendZpl(zpl) {
  return new Promise((resolve, reject) => {
    if (!PRINTER_HOST) return resolve("No printer configured");
    const socket = net.createConnection({ host: PRINTER_HOST, port: PRINTER_PORT }, () => {
      socket.write(zpl, "utf8", () => socket.end());
    });
    socket.on("error", reject);
    socket.on("close", resolve);
  });
}

module.exports = { zplForItem, sendZpl };
