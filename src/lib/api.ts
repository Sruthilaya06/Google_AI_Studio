// src/lib/api.ts
// AIU Retrieval Application V2 API Layer
// Provides deterministic, relationship-driven retrieval, relational validation, and query history.

import {
  TableName,
  SearchType,
  SearchResponse,
  ValidationSummary,
  QueryHistoryItem,
  RecordWithAuditMeta,
} from './types';
import { TABLES_METADATA, RELATIONSHIPS_METADATA } from './metadata';
import { SYNTHETIC_DATASET } from '../data/syntheticDataset';
import { supabase, isSupabaseConfigured } from './supabase';

const HISTORY_STORAGE_KEY = 'aiu_v2_query_history';

/**
 * Standardized V2 multi-identifier search
 */
export async function searchData(
  searchType: SearchType,
  searchValue: string
): Promise<SearchResponse> {
  const cleanVal = (searchValue || '').trim();

  if (!cleanVal) {
    return {
      searchCriteria: '',
      searchType,
      executionStatus: 'ERROR',
      validationStatus: 'FAIL',
      tablesReturned: 0,
      relationshipPaths: 'None',
      recordCounts: {
        user_details: 0,
        user_account_information: 0,
        user_address_details: 0,
        user_personal_details: 0,
        client_details: 0,
        total: 0,
      },
      data: {
        user_details: [],
        user_account_information: [],
        user_address_details: [],
        user_personal_details: [],
        client_details: [],
      },
      errorMessage: 'Please enter a valid search value.',
    };
  }

  // If Supabase is configured with edge function, we can attempt it, otherwise use deterministic local engine
  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase.functions.invoke('search-data', {
        body: { searchType, searchValue: cleanVal },
      });
      if (!error && data && data.executionStatus === 'SUCCESS') {
        const result = formatSearchResult(data, searchType, cleanVal);
        saveQueryHistory({
          id: `hist_${Date.now()}`,
          timestamp: new Date().toISOString(),
          searchType,
          searchValue: cleanVal,
          resultCount: result.recordCounts.total,
          tablesReturned: result.tablesReturned,
          status: result.recordCounts.total > 0 ? 'MATCHED' : 'NO MATCH',
          validationStatus: result.validationStatus,
        });
        return result;
      }
    } catch {
      // Graceful fallback to deterministic local engine
    }
  }

  // Deterministic relational engine
  const result = executeLocalSearch(searchType, cleanVal);

  saveQueryHistory({
    id: `hist_${Date.now()}`,
    timestamp: new Date().toISOString(),
    searchType,
    searchValue: cleanVal,
    resultCount: result.recordCounts.total,
    tablesReturned: result.tablesReturned,
    status: result.recordCounts.total > 0 ? 'MATCHED' : 'NO MATCH',
    validationStatus: result.validationStatus,
  });

  return result;
}

function executeLocalSearch(searchType: SearchType, searchValue: string): SearchResponse {
  const normVal = searchValue.toLowerCase();
  const matchedClientCodes = new Set<string>();
  const matchedFormNumbers = new Set<number>();
  let relationshipPath = '';
  const auditRecords: RecordWithAuditMeta[] = [];

  // Step 1: Identify matching source records based on SearchType
  switch (searchType) {
    case 'mobile': {
      relationshipPath =
        'User Address Details (user_mobile_number) ➔ R3: Form Number ➔ User Account Information ➔ R1/R2: Client Code ➔ User Details & Client Details & User Personal Details';
      const hits = SYNTHETIC_DATASET.user_address_details.filter(
        (r) => (r.user_mobile_number || '').trim() === searchValue
      );
      hits.forEach((r) => {
        matchedFormNumbers.add(Number(r.form_number));
        auditRecords.push({
          ...r,
          _sourceTable: 'user_address_details',
          _status: 'MATCHED',
          _matchReason: `Direct Mobile match on user_mobile_number = '${searchValue}'`,
          _relationshipPath: 'Source Search Match',
        });
      });
      break;
    }

    case 'pan': {
      relationshipPath =
        'Client Details (client_pan_number) ➔ Form Number & Client Code ➔ User Details, User Account Information, User Address Details, User Personal Details';
      const hits = SYNTHETIC_DATASET.client_details.filter(
        (r) => (r.client_pan_number || '').trim().toUpperCase() === searchValue.toUpperCase()
      );
      hits.forEach((r) => {
        if (r.client_code) matchedClientCodes.add(String(r.client_code));
        if (r.form_number) matchedFormNumbers.add(Number(r.form_number));
        auditRecords.push({
          ...r,
          _sourceTable: 'client_details',
          _status: 'MATCHED',
          _matchReason: `Direct PAN match on client_pan_number = '${searchValue.toUpperCase()}'`,
          _relationshipPath: 'Source Search Match',
        });
      });
      break;
    }

    case 'client_code': {
      relationshipPath =
        'User Details (client_code) ➔ R1: User Account Information ➔ R2: Client Details ➔ R3: User Address Details ➔ R4: User Personal Details';
      const cUpper = searchValue.toUpperCase();
      matchedClientCodes.add(cUpper);

      const hits = SYNTHETIC_DATASET.user_details.filter(
        (r) => (r.client_code || '').trim().toUpperCase() === cUpper
      );
      hits.forEach((r) => {
        auditRecords.push({
          ...r,
          _sourceTable: 'user_details',
          _status: 'MATCHED',
          _matchReason: `Direct Client Code match on client_code = '${cUpper}'`,
          _relationshipPath: 'Source Search Match',
        });
      });
      break;
    }

    case 'form_number': {
      relationshipPath =
        'User Account Information (form_number) ➔ R1: Client Code ➔ User Details & Client Details, User Address Details (R3), User Personal Details (R4)';
      const parsedForm = Number(searchValue);
      if (!isNaN(parsedForm)) {
        matchedFormNumbers.add(parsedForm);
        const hits = SYNTHETIC_DATASET.user_account_information.filter(
          (r) => Number(r.form_number) === parsedForm
        );
        hits.forEach((r) => {
          auditRecords.push({
            ...r,
            _sourceTable: 'user_account_information',
            _status: 'MATCHED',
            _matchReason: `Direct Form Number match on form_number = ${parsedForm}`,
            _relationshipPath: 'Source Search Match',
          });
        });
      }
      break;
    }

    case 'name': {
      relationshipPath =
        'User Personal Details (name partial match) ➔ R4: Form Number ➔ User Account Information ➔ R1: Client Code ➔ User Details, Address & Client Details';
      const hits = SYNTHETIC_DATASET.user_personal_details.filter((r) => {
        const first = (r.user_first_name || '').toLowerCase();
        const middle = (r.user_middle_name || '').toLowerCase();
        const last = (r.user_last_name || '').toLowerCase();
        const full = `${first} ${middle} ${last}`.toLowerCase();
        return first.includes(normVal) || last.includes(normVal) || full.includes(normVal);
      });
      hits.forEach((r) => {
        matchedFormNumbers.add(Number(r.form_number));
        auditRecords.push({
          ...r,
          _sourceTable: 'user_personal_details',
          _status: 'MATCHED',
          _matchReason: `Name partial match on '${r.user_first_name} ${r.user_last_name}'`,
          _relationshipPath: 'Source Search Match',
        });
      });
      break;
    }
  }

  // Step 2: Traverse Centralized Relationships (R1 - R5)
  // Expand Form Numbers <-> Client Codes
  if (matchedFormNumbers.size > 0) {
    SYNTHETIC_DATASET.user_account_information.forEach((acc) => {
      if (matchedFormNumbers.has(Number(acc.form_number)) && acc.client_code) {
        matchedClientCodes.add(String(acc.client_code));
      }
    });
  }

  if (matchedClientCodes.size > 0) {
    SYNTHETIC_DATASET.user_account_information.forEach((acc) => {
      if (matchedClientCodes.has(String(acc.client_code))) {
        matchedFormNumbers.add(Number(acc.form_number));
      }
    });
  }

  // Step 3: Fetch all related records across 5 tables
  const user_details: any[] = [];
  const user_account_information: any[] = [];
  const user_address_details: any[] = [];
  const user_personal_details: any[] = [];
  const client_details: any[] = [];

  // Table 1: user_details
  SYNTHETIC_DATASET.user_details.forEach((r) => {
    if (matchedClientCodes.has(String(r.client_code))) {
      const isDirect = searchType === 'client_code' && r.client_code.toUpperCase() === searchValue.toUpperCase();
      user_details.push({
        ...r,
        _sourceTable: 'user_details',
        _status: isDirect ? 'MATCHED' : 'RELATED',
        _matchReason: isDirect ? `Search criteria client_code = '${r.client_code}'` : `Linked via Client Code '${r.client_code}' (R1/R2)`,
        _relationshipPath: isDirect ? 'Direct' : 'Traversed via Client Code',
      });
    }
  });

  // Table 2: user_account_information
  SYNTHETIC_DATASET.user_account_information.forEach((r) => {
    if (matchedFormNumbers.has(Number(r.form_number)) || matchedClientCodes.has(String(r.client_code))) {
      const isDirect = searchType === 'form_number' && Number(r.form_number) === Number(searchValue);
      user_account_information.push({
        ...r,
        _sourceTable: 'user_account_information',
        _status: isDirect ? 'MATCHED' : 'RELATED',
        _matchReason: isDirect ? `Search criteria form_number = ${r.form_number}` : `Linked via Form #${r.form_number} / Client Code '${r.client_code}' (R1/R3/R4/R5)`,
        _relationshipPath: isDirect ? 'Direct' : 'Traversed via Form Number & Client Code',
      });
    }
  });

  // Table 3: user_address_details
  SYNTHETIC_DATASET.user_address_details.forEach((r) => {
    if (matchedFormNumbers.has(Number(r.form_number))) {
      const isDirect = searchType === 'mobile' && r.user_mobile_number === searchValue;
      user_address_details.push({
        ...r,
        _sourceTable: 'user_address_details',
        _status: isDirect ? 'MATCHED' : 'RELATED',
        _matchReason: isDirect ? `Search criteria mobile = '${r.user_mobile_number}'` : `Linked via Form #${r.form_number} (R3)`,
        _relationshipPath: isDirect ? 'Direct' : 'Traversed via Form Number (R3)',
      });
    }
  });

  // Table 4: user_personal_details
  SYNTHETIC_DATASET.user_personal_details.forEach((r) => {
    if (matchedFormNumbers.has(Number(r.form_number))) {
      const isDirect =
        searchType === 'name' &&
        (`${r.user_first_name} ${r.user_last_name}`.toLowerCase().includes(normVal) ||
          r.user_first_name.toLowerCase().includes(normVal) ||
          r.user_last_name.toLowerCase().includes(normVal));
      user_personal_details.push({
        ...r,
        _sourceTable: 'user_personal_details',
        _status: isDirect ? 'MATCHED' : 'RELATED',
        _matchReason: isDirect ? `Name query matched '${r.user_first_name} ${r.user_last_name}'` : `Linked via Form #${r.form_number} (R4)`,
        _relationshipPath: isDirect ? 'Direct' : 'Traversed via Form Number (R4)',
      });
    }
  });

  // Table 5: client_details
  SYNTHETIC_DATASET.client_details.forEach((r) => {
    if (matchedClientCodes.has(String(r.client_code)) || matchedFormNumbers.has(Number(r.form_number))) {
      const isDirect = searchType === 'pan' && r.client_pan_number.toUpperCase() === searchValue.toUpperCase();
      client_details.push({
        ...r,
        _sourceTable: 'client_details',
        _status: isDirect ? 'MATCHED' : 'RELATED',
        _matchReason: isDirect ? `Search criteria PAN = '${r.client_pan_number}'` : `Linked via Client Code '${r.client_code}' & Form #${r.form_number} (R2/R5)`,
        _relationshipPath: isDirect ? 'Direct' : 'Traversed via Client Code (R2) & Form Number (R5)',
      });
    }
  });

  const total =
    user_details.length +
    user_account_information.length +
    user_address_details.length +
    user_personal_details.length +
    client_details.length;

  let tablesReturned = 0;
  if (user_details.length > 0) tablesReturned++;
  if (user_account_information.length > 0) tablesReturned++;
  if (user_address_details.length > 0) tablesReturned++;
  if (user_personal_details.length > 0) tablesReturned++;
  if (client_details.length > 0) tablesReturned++;

  return {
    searchCriteria: searchValue,
    searchType,
    executionStatus: 'SUCCESS',
    validationStatus: total > 0 ? 'PASS' : 'N/A',
    tablesReturned,
    relationshipPaths: relationshipPath || 'None',
    recordCounts: {
      user_details: user_details.length,
      user_account_information: user_account_information.length,
      user_address_details: user_address_details.length,
      user_personal_details: user_personal_details.length,
      client_details: client_details.length,
      total,
    },
    data: {
      user_details,
      user_account_information,
      user_address_details,
      user_personal_details,
      client_details,
    },
    auditRecords,
  };
}

function formatSearchResult(raw: any, searchType: SearchType, cleanVal: string): SearchResponse {
  return {
    searchCriteria: cleanVal,
    searchType,
    executionStatus: raw.executionStatus || 'SUCCESS',
    validationStatus: raw.validationStatus || 'PASS',
    tablesReturned: raw.tablesReturned || 0,
    relationshipPaths: raw.relationshipPaths || '',
    recordCounts: raw.recordCounts || {
      user_details: raw.data?.user_details?.length || 0,
      user_account_information: raw.data?.user_account_information?.length || 0,
      user_address_details: raw.data?.user_address_details?.length || 0,
      user_personal_details: raw.data?.user_personal_details?.length || 0,
      client_details: raw.data?.client_details?.length || 0,
      total: 0,
    },
    data: raw.data || {
      user_details: [],
      user_account_information: [],
      user_address_details: [],
      user_personal_details: [],
      client_details: [],
    },
  };
}

/**
 * Validates dataset integrity across primary keys, foreign keys, and relationships R1-R5.
 */
export async function getValidationSummary(): Promise<ValidationSummary> {
  const tableStats = (Object.keys(TABLES_METADATA) as TableName[]).map((tbl) => {
    const records = SYNTHETIC_DATASET[tbl] || [];
    const meta = TABLES_METADATA[tbl];
    const pk = meta.primaryKey;

    // Check PK uniqueness
    const pkSet = new Set();
    let pkValid = true;
    for (const r of records) {
      const key = pk.map((k) => r[k]).join('_');
      if (pkSet.has(key)) {
        pkValid = false;
        break;
      }
      pkSet.add(key);
    }

    return {
      table: tbl,
      displayName: meta.displayName,
      count: records.length,
      pkValid,
      fkValid: true,
      orphans: 0,
    };
  });

  // Relationship check R1 - R5
  const clientCodes = new Set(SYNTHETIC_DATASET.user_details.map((u) => u.client_code));
  const formNumbers = new Set(SYNTHETIC_DATASET.user_account_information.map((a) => Number(a.form_number)));

  const relationshipChecks = RELATIONSHIPS_METADATA.map((rel) => {
    let orphans = 0;
    let sourceCount = 0;
    let linkedCount = 0;

    switch (rel.code) {
      case 'R1': {
        // user_details.client_code -> user_account_information.client_code
        sourceCount = SYNTHETIC_DATASET.user_details.length;
        const linked = SYNTHETIC_DATASET.user_account_information.filter((a) => clientCodes.has(a.client_code));
        linkedCount = linked.length;
        orphans = SYNTHETIC_DATASET.user_account_information.length - linkedCount;
        break;
      }
      case 'R2': {
        // user_details.client_code -> client_details.client_code
        sourceCount = SYNTHETIC_DATASET.user_details.length;
        const linked = SYNTHETIC_DATASET.client_details.filter((c) => clientCodes.has(c.client_code));
        linkedCount = linked.length;
        orphans = SYNTHETIC_DATASET.client_details.length - linkedCount;
        break;
      }
      case 'R3': {
        // user_account_information.form_number -> user_address_details.form_number
        sourceCount = SYNTHETIC_DATASET.user_account_information.length;
        const linked = SYNTHETIC_DATASET.user_address_details.filter((ad) => formNumbers.has(Number(ad.form_number)));
        linkedCount = linked.length;
        orphans = SYNTHETIC_DATASET.user_address_details.length - linkedCount;
        break;
      }
      case 'R4': {
        // user_account_information.form_number -> user_personal_details.form_number
        sourceCount = SYNTHETIC_DATASET.user_account_information.length;
        const linked = SYNTHETIC_DATASET.user_personal_details.filter((p) => formNumbers.has(Number(p.form_number)));
        linkedCount = linked.length;
        orphans = SYNTHETIC_DATASET.user_personal_details.length - linkedCount;
        break;
      }
      case 'R5': {
        // user_account_information.form_number -> client_details.form_number
        sourceCount = SYNTHETIC_DATASET.user_account_information.length;
        const linked = SYNTHETIC_DATASET.client_details.filter((c) => formNumbers.has(Number(c.form_number)));
        linkedCount = linked.length;
        orphans = SYNTHETIC_DATASET.client_details.length - linkedCount;
        break;
      }
    }

    return {
      id: rel.id,
      code: rel.code,
      name: rel.description,
      status: (orphans === 0 ? 'VALID' : 'FAIL') as 'VALID' | 'FAIL',
      sourceCount,
      linkedCount,
      orphans,
      message: orphans === 0 ? 'Integrity verified: 100% matched keys with 0 orphan records.' : `Validation alert: ${orphans} orphan records detected.`,
    };
  });

  const totalRecords = tableStats.reduce((acc, t) => acc + t.count, 0);
  const totalOrphans = relationshipChecks.reduce((acc, r) => acc + r.orphans, 0);

  return {
    totalTables: tableStats.length,
    totalRecords,
    validRecords: totalRecords - totalOrphans,
    invalidRecords: totalOrphans,
    orphanRecords: totalOrphans,
    relationshipsChecked: relationshipChecks.length,
    tableStats,
    relationshipChecks,
  };
}

/**
 * Table explorer data loader
 */
export async function getTableRecords(
  tableName: TableName,
  options?: { page?: number; limit?: number; search?: string }
): Promise<{ records: any[]; total: number }> {
  let list = [...(SYNTHETIC_DATASET[tableName] || [])];

  if (options?.search) {
    const q = options.search.toLowerCase();
    list = list.filter((item) =>
      Object.values(item).some((val) => String(val || '').toLowerCase().includes(q))
    );
  }

  const page = options?.page || 1;
  const limit = options?.limit || 15;
  const startIndex = (page - 1) * limit;
  const records = list.slice(startIndex, startIndex + limit);

  return {
    records,
    total: list.length,
  };
}

/**
 * Local Query History management
 */
export function getQueryHistory(): QueryHistoryItem[] {
  try {
    const stored = localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!stored) return [];
    return JSON.parse(stored);
  } catch {
    return [];
  }
}

export function saveQueryHistory(item: QueryHistoryItem): void {
  try {
    const history = getQueryHistory();
    // Keep max 25 recent items, deduplicate recent identical searches
    const filtered = history.filter(
      (h) => !(h.searchType === item.searchType && h.searchValue === item.searchValue)
    );
    const updated = [item, ...filtered].slice(0, 25);
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // Ignore storage quota errors
  }
}

export function clearQueryHistory(): void {
  try {
    localStorage.removeItem(HISTORY_STORAGE_KEY);
  } catch {
    // Ignore
  }
}
