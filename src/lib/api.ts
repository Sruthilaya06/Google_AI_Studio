// src/lib/api.ts
// AIU Retrieval Application V2.1 API Layer
// Supports Single Search, Bulk Batching, Output Field Filtering, and Strict Error Reporting

import {
  TableName,
  SearchType,
  ResultStatus,
  SingleSearchResult,
  BulkSearchJob,
  BulkRowResult,
  RetrievalHistoryRecord,
  ValidationSummary,
} from './types';
import { OUTPUT_FIELDS_CATALOG, TABLES_METADATA, RELATIONSHIPS_METADATA } from './metadata';
import { SYNTHETIC_DATASET } from '../data/syntheticDataset';
import { supabase, isSupabaseConfigured } from './supabase';

const HISTORY_STORAGE_KEY = 'aiu_v2_1_retrieval_history';
const DATA_SOURCE_MODE_KEY = 'aiu_data_source_mode';

/**
 * Determine active data source mode.
 * Defaults to 'live' if Supabase is configured, or 'demo' if not configured.
 */
export function getDataSourceMode(): 'live' | 'demo' {
  const saved = localStorage.getItem(DATA_SOURCE_MODE_KEY);
  if (saved === 'demo' || saved === 'live') {
    if (saved === 'live' && !isSupabaseConfigured) return 'demo';
    return saved;
  }
  return isSupabaseConfigured ? 'live' : 'demo';
}

export function setDataSourceMode(mode: 'live' | 'demo'): void {
  localStorage.setItem(DATA_SOURCE_MODE_KEY, mode);
}

/**
 * Normalizes input identifier based on SearchType
 */
export function normalizeIdentifier(
  searchType: SearchType,
  rawVal: any
): { normalized: string; isValid: boolean; reason?: string } {
  if (rawVal === null || rawVal === undefined) {
    return { normalized: '', isValid: false, reason: 'Empty identifier' };
  }

  const str = String(rawVal).trim();
  if (!str) {
    return { normalized: '', isValid: false, reason: 'Empty identifier' };
  }

  if (searchType === 'mobile') {
    // Strip common non-digits like spaces, hyphens, country code +91
    let clean = str.replace(/[\s-]/g, '');
    if (clean.startsWith('+91')) clean = clean.substring(3);
    else if (clean.startsWith('91') && clean.length === 12) clean = clean.substring(2);
    else if (clean.startsWith('0') && clean.length === 11) clean = clean.substring(1);

    if (!/^\d{10}$/.test(clean)) {
      return { normalized: clean, isValid: false, reason: 'Invalid mobile format (must be 10 digits)' };
    }
    return { normalized: clean, isValid: true };
  }

  if (searchType === 'client_code') {
    const clean = str.toUpperCase();
    if (clean.length < 3) {
      return { normalized: clean, isValid: false, reason: 'Client Code too short' };
    }
    return { normalized: clean, isValid: true };
  }

  if (searchType === 'form_number') {
    // Clean Excel scientific notation or trailing decimals like 1000000001.0
    let clean = str.replace(/\.0+$/, '').trim();
    if (!/^\d+$/.test(clean)) {
      return { normalized: clean, isValid: false, reason: 'Form Number must be numeric digits' };
    }
    return { normalized: clean, isValid: true };
  }

  return { normalized: str, isValid: true };
}

/**
 * Execute Single Search
 */
export async function executeSingleSearch(
  searchType: SearchType,
  searchValue: string,
  selectedFieldIds: string[]
): Promise<SingleSearchResult> {
  const startTime = performance.now();

  if (selectedFieldIds.length === 0) {
    return {
      searchMode: 'single',
      searchType,
      searchValue,
      status: 'INVALID INPUT',
      selectedFields: [],
      data: null,
      errorMessage: 'Please select at least one output field.',
      executionTimeMs: 0,
    };
  }

  const { normalized, isValid, reason } = normalizeIdentifier(searchType, searchValue);
  if (!isValid) {
    return {
      searchMode: 'single',
      searchType,
      searchValue,
      status: 'INVALID INPUT',
      selectedFields: selectedFieldIds,
      data: null,
      errorMessage: reason || 'Invalid input format',
      executionTimeMs: Math.round(performance.now() - startTime),
    };
  }

  const mode = getDataSourceMode();

  // If live mode is selected, call Supabase Edge Function without silent fallback!
  if (mode === 'live') {
    if (!supabase) {
      throw new Error('Supabase client is not configured with valid environment variables.');
    }
    try {
      const { data, error } = await supabase.functions.invoke('search-data', {
        body: {
          searchMode: 'single',
          searchType,
          searchValue: normalized,
          selectedFields: selectedFieldIds,
        },
      });

      if (error) {
        throw new Error(`Supabase retrieval failed: ${error.message}`);
      }

      const resItem = data?.results?.[0];
      const status: ResultStatus = resItem?.status || 'NO MATCH';
      const rawRec = resItem?.values || null;
      const formatted = rawRec ? mapRecordToSelectedFields(rawRec, selectedFieldIds) : null;

      const result: SingleSearchResult = {
        searchMode: 'single',
        searchType,
        searchValue: normalized,
        status,
        selectedFields: selectedFieldIds,
        data: formatted,
        rawDatabaseRecord: rawRec,
        executionTimeMs: Math.round(performance.now() - startTime),
      };

      saveHistoryRecord({
        id: `hist_${Date.now()}`,
        timestamp: new Date().toISOString(),
        mode: 'single',
        searchType,
        inputSummary: normalized,
        inputCount: 1,
        matchedCount: status === 'MATCHED' ? 1 : 0,
        noMatchCount: status === 'NO MATCH' ? 1 : 0,
        status,
        selectedFieldLabels: getLabelsForFieldIds(selectedFieldIds),
      });

      return result;
    } catch (err: any) {
      throw new Error(`Live Database Error: ${err.message || 'Unable to connect to Supabase backend'}`);
    }
  }

  // Demo / Synthetic Dataset Engine
  const rawRec = lookupInSyntheticDataset(searchType, normalized);
  const status: ResultStatus = rawRec ? 'MATCHED' : 'NO MATCH';
  const formatted = rawRec ? mapRecordToSelectedFields(rawRec, selectedFieldIds) : null;

  const result: SingleSearchResult = {
    searchMode: 'single',
    searchType,
    searchValue: normalized,
    status,
    selectedFields: selectedFieldIds,
    data: formatted,
    rawDatabaseRecord: rawRec,
    executionTimeMs: Math.round(performance.now() - startTime),
  };

  saveHistoryRecord({
    id: `hist_${Date.now()}`,
    timestamp: new Date().toISOString(),
    mode: 'single',
    searchType,
    inputSummary: normalized,
    inputCount: 1,
    matchedCount: status === 'MATCHED' ? 1 : 0,
    noMatchCount: status === 'NO MATCH' ? 1 : 0,
    status,
    selectedFieldLabels: getLabelsForFieldIds(selectedFieldIds),
  });

  return result;
}

/**
 * Execute Bulk Search with batching and progress reporting
 */
export async function executeBulkSearch(
  searchType: SearchType,
  inputColumn: string,
  rawRows: Record<string, any>[],
  selectedFieldIds: string[],
  fileName: string,
  onProgress?: (progressPercent: number, processed: number, total: number) => void
): Promise<BulkSearchJob> {
  const startTime = performance.now();

  if (selectedFieldIds.length === 0) {
    throw new Error('Please select at least one output field.');
  }

  const totalRows = rawRows.length;
  const originalColumns = rawRows.length > 0 ? Object.keys(rawRows[0]) : [];

  // Step 1: Normalize all rows and build deduplicated lookup pool
  const normalizedRows: {
    rowNumber: number;
    rawIdentifier: any;
    normalized: string;
    isValid: boolean;
    reason?: string;
    originalRow: Record<string, any>;
  }[] = [];

  const seenIdentifiers = new Set<string>();
  const duplicateRowNumbers = new Set<number>();
  const uniqueTargetsToQuery = new Set<string>();

  rawRows.forEach((row, idx) => {
    const rawVal = row[inputColumn];
    const { normalized, isValid, reason } = normalizeIdentifier(searchType, rawVal);
    const rowNum = idx + 1;

    if (isValid) {
      if (seenIdentifiers.has(normalized)) {
        duplicateRowNumbers.add(rowNum);
      } else {
        seenIdentifiers.add(normalized);
        uniqueTargetsToQuery.add(normalized);
      }
    }

    normalizedRows.push({
      rowNumber: rowNum,
      rawIdentifier: rawVal,
      normalized,
      isValid,
      reason,
      originalRow: row,
    });
  });

  // Step 2: Batch retrieval across unique targets
  const uniqueTargetsList = Array.from(uniqueTargetsToQuery);
  const BATCH_SIZE = 50;
  const targetResultsMap = new Map<string, Record<string, any> | null>();
  const mode = getDataSourceMode();

  for (let i = 0; i < uniqueTargetsList.length; i += BATCH_SIZE) {
    const batch = uniqueTargetsList.slice(i, i + BATCH_SIZE);

    if (mode === 'live') {
      if (!supabase) {
        throw new Error('Supabase client is not configured.');
      }
      try {
        const { data, error } = await supabase.functions.invoke('search-data', {
          body: {
            searchMode: 'bulk',
            searchType,
            values: batch,
            selectedFields: selectedFieldIds,
          },
        });
        if (error) throw error;
        (data?.results || []).forEach((item: any) => {
          targetResultsMap.set(String(item.identifier), item.status === 'MATCHED' ? item.values : null);
        });
      } catch (err: any) {
        throw new Error(`Live Database Batch Retrieval Failed: ${err.message}`);
      }
    } else {
      // Synthetic lookup for batch
      batch.forEach((target) => {
        const match = lookupInSyntheticDataset(searchType, target);
        targetResultsMap.set(target, match);
      });
    }

    if (onProgress) {
      const processedCount = Math.min(i + BATCH_SIZE, uniqueTargetsList.length);
      const pct = Math.round((processedCount / uniqueTargetsList.length) * 100);
      onProgress(pct, processedCount, uniqueTargetsList.length);
    }

    // Yield execution briefly to keep UI responsive
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  // Step 3: Map results back to every original input row to maintain 100% traceability
  let matchedCount = 0;
  let noMatchCount = 0;
  let invalidCount = 0;
  let duplicateCount = 0;

  const results: BulkRowResult[] = normalizedRows.map((item) => {
    if (!item.isValid) {
      invalidCount++;
      return {
        rowNumber: item.rowNumber,
        inputIdentifier: String(item.rawIdentifier ?? ''),
        normalizedIdentifier: item.normalized,
        status: 'INVALID INPUT',
        data: {},
        originalRowData: item.originalRow,
        errorMessage: item.reason || 'Invalid format',
      };
    }

    const isDuplicate = duplicateRowNumbers.has(item.rowNumber);
    if (isDuplicate) duplicateCount++;

    const retrievedRecord = targetResultsMap.get(item.normalized);

    if (retrievedRecord) {
      matchedCount++;
      const formatted = mapRecordToSelectedFields(retrievedRecord, selectedFieldIds);
      return {
        rowNumber: item.rowNumber,
        inputIdentifier: String(item.rawIdentifier ?? ''),
        normalizedIdentifier: item.normalized,
        status: (isDuplicate ? 'DUPLICATE' : 'MATCHED') as ResultStatus,
        data: formatted,
        originalRowData: item.originalRow,
      };
    } else {
      noMatchCount++;
      return {
        rowNumber: item.rowNumber,
        inputIdentifier: String(item.rawIdentifier ?? ''),
        normalizedIdentifier: item.normalized,
        status: 'NO MATCH',
        data: {},
        originalRowData: item.originalRow,
      };
    }
  });

  const job: BulkSearchJob = {
    id: `job_${Date.now()}`,
    fileName,
    fileType: fileName.split('.').pop()?.toUpperCase() || 'FILE',
    totalRows,
    uniqueIdentifiers: uniqueTargetsList.length,
    searchType,
    inputColumn,
    selectedFields: selectedFieldIds,
    matchedCount,
    noMatchCount,
    invalidCount,
    duplicateCount,
    status: 'COMPLETED',
    progress: 100,
    results,
    originalColumns,
    executionTimeMs: Math.round(performance.now() - startTime),
  };

  saveHistoryRecord({
    id: `hist_${Date.now()}`,
    timestamp: new Date().toISOString(),
    mode: 'bulk',
    searchType,
    inputSummary: `${fileName} (${totalRows} rows)`,
    inputCount: totalRows,
    matchedCount,
    noMatchCount,
    status: 'COMPLETED',
    selectedFieldLabels: getLabelsForFieldIds(selectedFieldIds),
  });

  return job;
}

/**
 * Traverses relations in synthetic dataset and returns merged unified record
 */
function lookupInSyntheticDataset(searchType: SearchType, normalizedVal: string): Record<string, any> | null {
  let matchedFormNum: number | null = null;
  let matchedClientCode: string | null = null;

  if (searchType === 'mobile') {
    const addr = SYNTHETIC_DATASET.user_address_details.find(
      (a) => (a.user_mobile_number || '').trim() === normalizedVal
    );
    if (!addr) return null;
    matchedFormNum = Number(addr.form_number);
    const acc = SYNTHETIC_DATASET.user_account_information.find(
      (a) => Number(a.form_number) === matchedFormNum
    );
    if (acc) matchedClientCode = acc.client_code;
  } else if (searchType === 'client_code') {
    const cUp = normalizedVal.toUpperCase();
    const uDet = SYNTHETIC_DATASET.user_details.find(
      (u) => (u.client_code || '').trim().toUpperCase() === cUp
    );
    if (!uDet) return null;
    matchedClientCode = uDet.client_code;
    const acc = SYNTHETIC_DATASET.user_account_information.find(
      (a) => (a.client_code || '').trim().toUpperCase() === cUp
    );
    if (acc) matchedFormNum = Number(acc.form_number);
  } else if (searchType === 'form_number') {
    const num = Number(normalizedVal);
    const acc = SYNTHETIC_DATASET.user_account_information.find(
      (a) => Number(a.form_number) === num
    );
    if (!acc) return null;
    matchedFormNum = num;
    matchedClientCode = acc.client_code;
  }

  if (!matchedFormNum && !matchedClientCode) return null;

  const uDet = matchedClientCode
    ? SYNTHETIC_DATASET.user_details.find((u) => u.client_code === matchedClientCode)
    : null;
  const uAcc = matchedFormNum
    ? SYNTHETIC_DATASET.user_account_information.find((a) => Number(a.form_number) === matchedFormNum)
    : null;
  const uAddr = matchedFormNum
    ? SYNTHETIC_DATASET.user_address_details.find((a) => Number(a.form_number) === matchedFormNum)
    : null;
  const uPers = matchedFormNum
    ? SYNTHETIC_DATASET.user_personal_details.find((p) => Number(p.form_number) === matchedFormNum)
    : null;
  const cDet = matchedFormNum
    ? SYNTHETIC_DATASET.client_details.find((c) => Number(c.form_number) === matchedFormNum)
    : (matchedClientCode ? SYNTHETIC_DATASET.client_details.find((c) => c.client_code === matchedClientCode) : null);

  return {
    ...(uDet || {}),
    ...(uAcc || {}),
    ...(uAddr || {}),
    ...(uPers || {}),
    ...(cDet || {}),
  };
}

/**
 * Filters and maps a merged database record to friendly output field labels
 */
function mapRecordToSelectedFields(
  rawRecord: Record<string, any>,
  selectedFieldIds: string[]
): Record<string, any> {
  const result: Record<string, any> = {};

  OUTPUT_FIELDS_CATALOG.forEach((f) => {
    if (selectedFieldIds.includes(f.id)) {
      result[f.label] = rawRecord[f.column] ?? null;
    }
  });

  return result;
}

function getLabelsForFieldIds(ids: string[]): string[] {
  return OUTPUT_FIELDS_CATALOG.filter((f) => ids.includes(f.id)).map((f) => f.label);
}

/**
 * Retrieval History Management
 */
export function getRetrievalHistory(): RetrievalHistoryRecord[] {
  try {
    const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveHistoryRecord(item: RetrievalHistoryRecord): void {
  try {
    const current = getRetrievalHistory();
    const updated = [item, ...current].slice(0, 50);
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // Ignore storage issues
  }
}

export function clearRetrievalHistory(): void {
  try {
    localStorage.removeItem(HISTORY_STORAGE_KEY);
  } catch {
    // Ignore
  }
}

/**
 * Diagnostics and Validation summaries (Preserved for Admin/Diagnostics view)
 */
export async function getValidationSummary(): Promise<ValidationSummary> {
  const tableStats = (Object.keys(TABLES_METADATA) as TableName[]).map((tbl) => {
    const records = SYNTHETIC_DATASET[tbl] || [];
    const meta = TABLES_METADATA[tbl];
    const pk = meta.primaryKey;

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

  const clientCodes = new Set(SYNTHETIC_DATASET.user_details.map((u) => u.client_code));
  const formNumbers = new Set(SYNTHETIC_DATASET.user_account_information.map((a) => Number(a.form_number)));

  const relationshipChecks = RELATIONSHIPS_METADATA.map((rel) => {
    let orphans = 0;
    let sourceCount = 0;
    let linkedCount = 0;

    switch (rel.code) {
      case 'R1':
        sourceCount = SYNTHETIC_DATASET.user_details.length;
        linkedCount = SYNTHETIC_DATASET.user_account_information.filter((a) => clientCodes.has(a.client_code)).length;
        orphans = SYNTHETIC_DATASET.user_account_information.length - linkedCount;
        break;
      case 'R2':
        sourceCount = SYNTHETIC_DATASET.user_details.length;
        linkedCount = SYNTHETIC_DATASET.client_details.filter((c) => clientCodes.has(c.client_code)).length;
        orphans = SYNTHETIC_DATASET.client_details.length - linkedCount;
        break;
      case 'R3':
        sourceCount = SYNTHETIC_DATASET.user_account_information.length;
        linkedCount = SYNTHETIC_DATASET.user_address_details.filter((ad) => formNumbers.has(Number(ad.form_number))).length;
        orphans = SYNTHETIC_DATASET.user_address_details.length - linkedCount;
        break;
      case 'R4':
        sourceCount = SYNTHETIC_DATASET.user_account_information.length;
        linkedCount = SYNTHETIC_DATASET.user_personal_details.filter((p) => formNumbers.has(Number(p.form_number))).length;
        orphans = SYNTHETIC_DATASET.user_personal_details.length - linkedCount;
        break;
      case 'R5':
        sourceCount = SYNTHETIC_DATASET.user_account_information.length;
        linkedCount = SYNTHETIC_DATASET.client_details.filter((c) => formNumbers.has(Number(c.form_number))).length;
        orphans = SYNTHETIC_DATASET.client_details.length - linkedCount;
        break;
    }

    return {
      id: rel.id,
      code: rel.code,
      name: rel.description,
      status: (orphans === 0 ? 'VALID' : 'FAIL') as 'VALID' | 'FAIL',
      sourceCount,
      linkedCount,
      orphans,
      message: orphans === 0 ? '100% matched keys with 0 orphan records.' : `${orphans} orphans detected.`,
    };
  });

  const totalRecords = tableStats.reduce((acc, t) => acc + t.count, 0);

  return {
    totalTables: tableStats.length,
    totalRecords,
    validRecords: totalRecords,
    invalidRecords: 0,
    orphanRecords: 0,
    relationshipsChecked: relationshipChecks.length,
    tableStats,
    relationshipChecks,
  };
}

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

  return {
    records: list.slice(startIndex, startIndex + limit),
    total: list.length,
  };
}
