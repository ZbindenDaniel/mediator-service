// TODO(agent): add action tests.
import type { IncomingMessage, ServerResponse } from 'http';
import { AGENTIC_RUN_STATUSES, type AgenticRunStatus } from '../../models/agentic-statuses';
import { groupItemsForResponse } from '../lib/itemGrouping';
import { defineHttpAction } from './index';

// TODO(filters-api): Share filter parsing with other listing endpoints once navigation keeps filters in sync.
// TODO(item-entity-filter): Revisit reference union performance once catalogue browsing expands beyond the item list.
// TODO(subcategory-filter): Confirm whether Unterkategorien_B should be matched alongside Unterkategorien_A.
// TODO(grouped-items): Remove legacy flat items response once frontend consumes groupedItems.

type ItemEntityFilter = 'all' | 'instances' | 'references';

type ItemListFilterParams = {
  searchTerm: string;
  subcategoryFilter: string;
  boxFilter: string;
  agenticStatusFilter: AgenticRunStatus | 'any';
  showUnplaced: boolean;
  entityFilter: ItemEntityFilter;
};

const DEFAULT_FILTERS: ItemListFilterParams = {
  searchTerm: '',
  subcategoryFilter: '',
  boxFilter: '',
  agenticStatusFilter: 'any',
  showUnplaced: false,
  entityFilter: 'instances'
};

function parseItemListFilters(req: IncomingMessage): ItemListFilterParams {
  try {
    const url = new URL(req.url || '/api/items', 'http://localhost');
    const searchParams = url.searchParams;

    const searchTerm = (searchParams.get('search') || searchParams.get('searchTerm') || '').trim();
    const rawSubcategory = searchParams.get('subcategory') || searchParams.get('subcategoryFilter');
    if (rawSubcategory !== null && rawSubcategory.trim() === '') {
      console.warn('Ignoring empty subcategory filter value');
    }
    const subcategoryFilter = (rawSubcategory || '').trim();
    const boxFilter = (searchParams.get('box') || searchParams.get('boxFilter') || '').trim();
    const requestedAgentic = (searchParams.get('agenticStatus') || '').trim();
    const agenticStatusFilter =
      requestedAgentic && AGENTIC_RUN_STATUSES.includes(requestedAgentic as AgenticRunStatus)
        ? (requestedAgentic as AgenticRunStatus)
        : 'any';
    const showUnplacedRaw = (searchParams.get('showUnplaced') || '').toLowerCase();
    const showUnplaced = ['1', 'true', 'yes'].includes(showUnplacedRaw);
    const entityFilterRaw = (searchParams.get('entityFilter') || '').toLowerCase();
    const entityFilter: ItemEntityFilter = ['instances', 'references', 'all'].includes(entityFilterRaw)
      ? (entityFilterRaw as ItemEntityFilter)
      : DEFAULT_FILTERS.entityFilter;

    return {
      searchTerm,
      subcategoryFilter,
      boxFilter,
      agenticStatusFilter,
      showUnplaced,
      entityFilter
    };
  } catch (err) {
    console.warn('Falling back to default item list filters', err);
    return { ...DEFAULT_FILTERS };
  }
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

const action = defineHttpAction({
  key: 'list-items',
  label: 'List items',
  appliesTo: () => false,
  matches: (path, method) => path === '/api/items' && method === 'GET',
  async handle(_req: IncomingMessage, res: ServerResponse, ctx: any) {
    try {
      const filters = parseItemListFilters(_req);
      const searchTerm = filters.searchTerm ? `%${filters.searchTerm.toLowerCase()}%` : null;
      const subcategoryFilter = filters.subcategoryFilter
        ? `%${filters.subcategoryFilter.toLowerCase()}%`
        : null;
      const boxFilter = filters.boxFilter ? `%${filters.boxFilter.toLowerCase()}%` : null;
      const agenticStatus = filters.agenticStatusFilter === 'any' ? null : filters.agenticStatusFilter;
      const bindings = {
        searchTerm,
        subcategoryFilter,
        boxFilter,
        agenticStatus,
        unplacedOnly: filters.showUnplaced ? 1 : 0
      };

      const instanceItems =
        filters.entityFilter === 'references' ? [] : ctx.listItemsWithFilters.all(bindings);
      const referenceItems =
        filters.entityFilter === 'instances' ? [] : ctx.listItemReferencesWithFilters.all(bindings);
      const items = [...instanceItems, ...referenceItems];
      const groupedItems = groupItemsForResponse(instanceItems, { logger: console });

      console.log('list-items', {
        count: items.length,
        groupedCount: groupedItems.length,
        filters: {
          ...filters,
          agenticStatusFilter: agenticStatus || 'any'
        }
      });
      sendJson(res, 200, { items, groupedItems });
    } catch (err) {
      console.error('List items failed', err);
      sendJson(res, 500, { error: (err as Error).message });
    }
  },
  view: () => '<div class="card"><p class="muted">List items API</p></div>'
});

export default action;
