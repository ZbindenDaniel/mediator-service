import net from 'net';
import { exec } from 'child_process';
import { PRINTER_HOST, PRINTER_PORT, BASE_QR_URL, BASE_UI_URL } from './config';

export interface ItemLabelParams {
  materialNumber?: string;
  itemUUID: string;
}

export interface BoxLabelParams {
  boxId: string;
  location?: string;
}

export function zplForItem({ materialNumber, itemUUID }: ItemLabelParams): string {
  const shortUid = (itemUUID || '').slice(-6).toUpperCase();
  const url = `${BASE_QR_URL}/${encodeURIComponent(itemUUID)}`;
  return `^XA
^CI28
^PW600^LL380
^FO30,30^A0N,40,40^FDMatNr: ${materialNumber || '-'}^FS
^FO30,80^A0N,30,30^FDUID: ${shortUid}^FS
^FO30,130^BQN,2,8^FDLA,${url}^FS
^XZ`;
}

export function zplForBox({ boxId, location }: BoxLabelParams): string {
  const url = `${BASE_UI_URL}/box/${encodeURIComponent(boxId)}`;
  const loc = location ? `Loc: ${location}` : '';
  return `^XA
^CI28
^PW600^LL380
^FO30,30^A0N,48,48^FDBOX ${boxId}^FS
^FO30,90^A0N,32,32^FD${loc}^FS
^FO30,150^BQN,2,8^FDLA,${url}^FS
^XZ`;
}

export function sendZpl(zpl: string): Promise<{ sent: boolean; reason?: string }> {
  return new Promise((resolve) => {
    // TODO: replace exec with spawn and validate printer command to avoid injection
    const printProcess = exec(`lp -d ${PRINTER_HOST}`, (error, stdout, stderr) => {
      if (error) {
        console.error('Print command failed', error);
        return resolve({ sent: false, reason: stderr || error.message });
      }
      resolve({ sent: true });
    });
    printProcess.stdin?.write(zpl);
    printProcess.stdin?.end();
  });
}

const PROBE = "\x1B%-12345X@PJL INFO STATUS\r\n@PJL INFO ID\r\n@PJL EOJ\r\n\x1B%-12345X";

export function testPrinterConnection(
  host: string,
  port = 9100,
  timeoutMs = 3000
): Promise<{ ok: boolean; reason?: string }> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    let resolved = false;
    let gotData = false;
    let buf = "";

    const finish = (res: { ok: boolean; reason?: string }) => {
      if (resolved) return;
      resolved = true;
      try { socket.destroy(); } catch {}
      resolve(res);
    };

    socket.setTimeout(timeoutMs);

    socket.once("connect", () => {
      // Write PJL probe and wait for data
      socket.write(PROBE, (err) => {
        if (err) return finish({ ok: false, reason: err.message || "write_error" });
      });
    });

    socket.on("data", (chunk) => {
      gotData = true;
      buf += chunk.toString("ascii");

      // Heuristics: look for READY/ONLINE or INFO payloads
      if (/READY|ONLINE|@PJL\s+INFO/i.test(buf)) {
        finish({ ok: true });
      } else if (/OFFLINE|ERROR|JAM|OUT\s+OF\s+PAPER/i.test(buf)) {
        finish({ ok: false, reason: "printer_error_state" });
      }
    });

    socket.once("timeout", () => {
      // Connected but no useful reply
      finish({ ok: false, reason: gotData ? "inconclusive" : "timeout_no_response" });
    });

    socket.once("error", (err) => {
      finish({ ok: false, reason: err.message || "socket_error" });
    });

    socket.once("close", (hadError) => {
      if (!resolved) {
        // Closed with no data → treat as failure
        finish({ ok: false, reason: hadError ? "socket_closed_with_error" : "closed_no_response" });
      }
    });
  });
}


export default { zplForItem, zplForBox, sendZpl, testPrinterConnection };
