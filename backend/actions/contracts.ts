import type { IncomingMessage, ServerResponse } from 'http';
import { defineHttpAction } from './index';
import {
  getGeneralQualityContract,
  getQualityContract,
  getSpecContract,
  listSpecContractSubcategories,
  getAssemblyContract,
  getDisassemblyContract
} from '../contracts/registry';

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

const QUALITY_ROUTE = /^\/api\/contracts\/quality\/(.+)$/;
const SPECS_SINGLE_ROUTE = /^\/api\/contracts\/specs\/(\d+)$/;
const SPECS_LIST_ROUTE = /^\/api\/contracts\/specs$/;
const ASSEMBLY_ROUTE = /^\/api\/contracts\/assembly\/(\d+)$/;
// Keep old route for backward compatibility
const DISASSEMBLY_ROUTE = /^\/api\/contracts\/disassembly\/(\d+)$/;

const action = defineHttpAction({
  key: 'contracts',
  label: 'Contract serving',
  appliesTo: () => false,
  matches: (path, method) => {
    if (method !== 'GET') return false;
    return (
      QUALITY_ROUTE.test(path) ||
      SPECS_SINGLE_ROUTE.test(path) ||
      SPECS_LIST_ROUTE.test(path) ||
      ASSEMBLY_ROUTE.test(path) ||
      DISASSEMBLY_ROUTE.test(path)
    );
  },
  async handle(req: IncomingMessage, res: ServerResponse) {
    const url = req.url ?? '';
    const pathname = url.split('?')[0];

    const qualityMatch = QUALITY_ROUTE.exec(pathname);
    if (qualityMatch) {
      const key = qualityMatch[1];
      const contract = key === 'general'
        ? getGeneralQualityContract()
        : getQualityContract(parseInt(key, 10));
      if (!contract) {
        sendJson(res, 404, { error: 'Contract not found', key });
        return;
      }
      sendJson(res, 200, contract);
      return;
    }

    const specsSingleMatch = SPECS_SINGLE_ROUTE.exec(pathname);
    if (specsSingleMatch) {
      const code = parseInt(specsSingleMatch[1], 10);
      const contract = getSpecContract(code);
      if (!contract) {
        sendJson(res, 404, { error: 'Spec contract not found', subCategory: code });
        return;
      }
      sendJson(res, 200, contract);
      return;
    }

    if (SPECS_LIST_ROUTE.test(pathname)) {
      sendJson(res, 200, { subcategories: listSpecContractSubcategories() });
      return;
    }

    const assemblyMatch = ASSEMBLY_ROUTE.exec(pathname);
    if (assemblyMatch) {
      const subCategory = parseInt(assemblyMatch[1], 10);
      const contract = getAssemblyContract(subCategory);
      if (!contract) {
        sendJson(res, 404, { error: 'Assembly contract not found', subCategory });
        return;
      }
      sendJson(res, 200, contract);
      return;
    }

    // Backward-compatibility: /api/contracts/disassembly/:id still works
    const disassemblyMatch = DISASSEMBLY_ROUTE.exec(pathname);
    if (disassemblyMatch) {
      const subCategory = parseInt(disassemblyMatch[1], 10);
      const contract = getDisassemblyContract(subCategory);
      if (!contract) {
        sendJson(res, 404, { error: 'Assembly contract not found', subCategory });
        return;
      }
      sendJson(res, 200, contract);
      return;
    }

    sendJson(res, 404, { error: 'Not found' });
  },
  view: () => '<div class="card"><p class="muted">Contract serving API</p></div>'
});

export default action;
