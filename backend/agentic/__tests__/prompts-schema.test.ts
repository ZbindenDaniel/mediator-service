// TODO(agent): Re-run schema coverage checks when columns change.
import fs from 'fs';
import path from 'path';

import { SCHEMA_COLUMN_NOTES } from '../flow/prompts';

const DB_SCHEMA_PATH = path.resolve(__dirname, '../../db.ts');

function extractSchemaSql(source: string, constantName: string): string {
  const marker = `const ${constantName} = \``;
  const markerIndex = source.indexOf(marker);
  if (markerIndex === -1) {
    throw new Error(`Schema constant not found: ${constantName}`);
  }

  const startIndex = source.indexOf('`', markerIndex + marker.length - 1);
  const endIndex = source.indexOf('`;', startIndex + 1);

  if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
    throw new Error(`Schema constant is malformed: ${constantName}`);
  }

  return source.slice(startIndex + 1, endIndex);
}

function parseTableColumns(sql: string, tableName: string): string[] {
  const tableRegex = new RegExp(`CREATE\\s+TABLE\\s+IF\\s+NOT\\s+EXISTS\\s+${tableName}\\s*\\(([\\s\\S]*?)\);`, 'im');
  const match = tableRegex.exec(sql);
  if (!match) {
    throw new Error(`Table not found in schema: ${tableName}`);
  }

  const [, body] = match;
  return body
    .split('\n')
    .map((line) => line.trim().replace(/,+$/, ''))
    .filter(Boolean)
    .filter((line) => !/^(foreign key|primary key|unique)/i.test(line))
    .map((line) => line.split(/\s+/)[0]);
}

describe('prompt schema column annotations', () => {
  it('tracks usage notes for every chat schema column', () => {
    const source = fs.readFileSync(DB_SCHEMA_PATH, 'utf8');
    const itemRefsSql = extractSchemaSql(source, 'CREATE_ITEM_REFS_SQL');
    const itemsSql = extractSchemaSql(source, 'CREATE_ITEMS_SQL');

    const itemRefsColumns = parseTableColumns(itemRefsSql, 'item_refs');
    // TODO(agentic-schema): Drop ItemUUID omissions once the DB schema removes instance identifiers from prompts.
    const omittedItemColumns = new Set(['ItemUUID']);
    const itemColumns = parseTableColumns(itemsSql, 'items').filter((column) => !omittedItemColumns.has(column));

    const checkCoverage = (tableName: 'item_refs' | 'items', columns: string[]) => {
      for (const column of columns) {
        const meta = SCHEMA_COLUMN_NOTES[tableName]?.[column];
        expect(meta).toBeDefined();
        expect(meta?.note).toBeTruthy();
      }
    };

    checkCoverage('item_refs', itemRefsColumns);
    checkCoverage('items', itemColumns);
  });
});
