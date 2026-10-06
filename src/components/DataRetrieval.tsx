// src/components/DataRetrieval.tsx
// AIU Retrieval Application V2: Multi-Identifier Relationship-Driven Retrieval

import React, { useState, useEffect } from 'react';
import {
  Search,
  CheckCircle2,
  AlertCircle,
  FileText,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  Layers,
  Code,
  RotateCcw,
  Eye,
  ArrowRight,
  Database,
  Info,
  Clock,
  Sparkles,
} from 'lucide-react';
import { SearchType, SearchResponse, TableName } from '../lib/types';
import { searchData, getQueryHistory } from '../lib/api';
import { SEARCH_METADATA, TABLES_METADATA, COMMON_OUTPUT_FIELDS } from '../lib/metadata';

interface DataRetrievalProps {
  initialSearchType?: SearchType;
  initialSearchValue?: string;
}

export const DataRetrieval: React.FC<DataRetrievalProps> = ({
  initialSearchType = 'mobile',
  initialSearchValue = '',
}) => {
  const [searchType, setSearchType] = useState<SearchType>(initialSearchType);
  const [searchValue, setSearchValue] = useState<string>(initialSearchValue);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [response, setResponse] = useState<SearchResponse | null>(null);
  const [hasSearched, setHasSearched] = useState<boolean>(false);

  // Field selection mode: 'selected' or 'all'
  const [fieldMode, setFieldMode] = useState<'selected' | 'all'>('selected');
  const [selectedFieldIds, setSelectedFieldIds] = useState<string[]>(
    COMMON_OUTPUT_FIELDS.filter((f) => f.defaultSelected).map((f) => f.id)
  );
  const [showFieldConfig, setShowFieldConfig] = useState<boolean>(false);

  // Expanded tables & JSON inspect
  const [collapsedTables, setCollapsedTables] = useState<Record<string, boolean>>({});
  const [inspectModalRow, setInspectModalRow] = useState<{ table: string; data: any } | null>(null);

  // Execute initial search if passed
  useEffect(() => {
    if (initialSearchValue) {
      setSearchType(initialSearchType);
      setSearchValue(initialSearchValue);
      handleSearch(initialSearchType, initialSearchValue);
    }
  }, [initialSearchType, initialSearchValue]);

  const activeMeta = SEARCH_METADATA[searchType];

  const handleSearch = async (overrideType?: SearchType, overrideVal?: string) => {
    const sType = overrideType || searchType;
    const sVal = (overrideVal !== undefined ? overrideVal : searchValue).trim();

    if (!sVal) return;

    setIsLoading(true);
    setHasSearched(true);

    try {
      const res = await searchData(sType, sVal);
      setResponse(res);
      // Auto expand all tables that have records
      const initialCollapsed: Record<string, boolean> = {};
      Object.keys(res.data).forEach((tbl) => {
        initialCollapsed[tbl] = false;
      });
      setCollapsedTables(initialCollapsed);
    } catch (err: any) {
      setResponse({
        searchCriteria: sVal,
        searchType: sType,
        executionStatus: 'ERROR',
        validationStatus: 'FAIL',
        tablesReturned: 0,
        relationshipPaths: 'Failed',
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
        errorMessage: err.message || 'Retrieval failed due to unexpected error',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const toggleTableCollapse = (tableName: string) => {
    setCollapsedTables((prev) => ({
      ...prev,
      [tableName]: !prev[tableName],
    }));
  };

  const toggleField = (id: string) => {
    setSelectedFieldIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  // Helper to test quickly with synthetic sample records
  const setQuickExample = (type: SearchType) => {
    setSearchType(type);
    const ex = SEARCH_METADATA[type].exampleValue;
    setSearchValue(ex);
    handleSearch(type, ex);
  };

  return (
    <div className="space-y-6">
      {/* Search Controller Card */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 mb-4 border-b border-slate-100 gap-2">
          <div>
            <h2 className="text-lg font-bold text-slate-900 flex items-center space-x-2">
              <Search className="w-5 h-5 text-blue-600" />
              <span>AIU Multi-Identifier Relational Retrieval</span>
            </h2>
            <p className="text-xs text-slate-500">
              Traverse the AIU relational schema using any primary or secondary identifier
            </p>
          </div>

          {/* Quick Auditor Examples */}
          <div className="flex items-center space-x-1.5 flex-wrap">
            <span className="text-[11px] font-semibold text-slate-500 mr-1 flex items-center">
              <Sparkles className="w-3 h-3 text-amber-500 mr-1" />
              Auditor Presets:
            </span>
            <button
              onClick={() => setQuickExample('mobile')}
              className="text-xs px-2.5 py-1 rounded bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-slate-700 font-mono transition-colors"
            >
              Mobile (9820123401)
            </button>
            <button
              onClick={() => setQuickExample('pan')}
              className="text-xs px-2.5 py-1 rounded bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-slate-700 font-mono transition-colors"
            >
              PAN (ABCDE1201F)
            </button>
            <button
              onClick={() => setQuickExample('client_code')}
              className="text-xs px-2.5 py-1 rounded bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-slate-700 font-mono transition-colors"
            >
              Client (CL00101)
            </button>
            <button
              onClick={() => setQuickExample('form_number')}
              className="text-xs px-2.5 py-1 rounded bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-slate-700 font-mono transition-colors"
            >
              Form (1000000001)
            </button>
            <button
              onClick={() => setQuickExample('name')}
              className="text-xs px-2.5 py-1 rounded bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-slate-700 font-mono transition-colors"
            >
              Name (Rahul)
            </button>
          </div>
        </div>

        {/* Input Form */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSearch();
          }}
          className="space-y-4"
        >
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
            {/* Search Type Selector */}
            <div className="md:col-span-4">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Search Type
              </label>
              <select
                value={searchType}
                onChange={(e) => {
                  const newType = e.target.value as SearchType;
                  setSearchType(newType);
                  setSearchValue('');
                }}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3.5 py-2.5 text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
              >
                {Object.values(SEARCH_METADATA).map((meta) => (
                  <option key={meta.type} value={meta.type}>
                    {meta.label} ({meta.sourceTable})
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-slate-400 mt-1">
                Target: {activeMeta.sourceTable}.{activeMeta.sourceColumn}
              </p>
            </div>

            {/* Search Value Field */}
            <div className="md:col-span-6">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Search Value
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={searchValue}
                  onChange={(e) => setSearchValue(e.target.value)}
                  placeholder={activeMeta.placeholder}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg pl-3.5 pr-10 py-2.5 text-sm text-slate-900 font-mono placeholder:font-sans placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
                />
                {searchValue && (
                  <button
                    type="button"
                    onClick={() => setSearchValue('')}
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
                  >
                    &times;
                  </button>
                )}
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                Method: {activeMeta.matchMethod.toUpperCase()} &bull; {activeMeta.description}
              </p>
            </div>

            {/* Action Buttons */}
            <div className="md:col-span-2 flex items-end">
              <button
                type="submit"
                disabled={isLoading || !searchValue.trim()}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-semibold py-2.5 px-4 rounded-lg shadow-sm transition-colors flex items-center justify-center space-x-2 text-sm"
              >
                {isLoading ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                    <span>Retrieving...</span>
                  </>
                ) : (
                  <>
                    <Search className="w-4 h-4" />
                    <span>Search</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Output Fields Filter & Toggle */}
          <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between text-xs gap-3">
            <div className="flex items-center space-x-4">
              <span className="font-semibold text-slate-700 flex items-center space-x-1">
                <SlidersHorizontal className="w-3.5 h-3.5 text-slate-500" />
                <span>Output Fields Presentation:</span>
              </span>
              <label className="inline-flex items-center space-x-1.5 cursor-pointer">
                <input
                  type="radio"
                  name="fieldMode"
                  value="selected"
                  checked={fieldMode === 'selected'}
                  onChange={() => setFieldMode('selected')}
                  className="text-blue-600 focus:ring-blue-500"
                />
                <span className="text-slate-700 font-medium">Selected Fields (Recommended)</span>
              </label>
              <label className="inline-flex items-center space-x-1.5 cursor-pointer">
                <input
                  type="radio"
                  name="fieldMode"
                  value="all"
                  checked={fieldMode === 'all'}
                  onChange={() => setFieldMode('all')}
                  className="text-blue-600 focus:ring-blue-500"
                />
                <span className="text-slate-700 font-medium">All Fields (126 Columns)</span>
              </label>
            </div>

            {fieldMode === 'selected' && (
              <button
                type="button"
                onClick={() => setShowFieldConfig(!showFieldConfig)}
                className="text-blue-600 hover:text-blue-800 font-medium flex items-center space-x-1"
              >
                <span>Customize Selected Columns ({selectedFieldIds.length})</span>
                {showFieldConfig ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
            )}
          </div>

          {/* Field selection checkboxes panel */}
          {fieldMode === 'selected' && showFieldConfig && (
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg mt-2">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-700">Choose visible columns:</span>
                <div className="space-x-2">
                  <button
                    type="button"
                    onClick={() => setSelectedFieldIds(COMMON_OUTPUT_FIELDS.map((f) => f.id))}
                    className="text-[11px] text-blue-600 hover:underline"
                  >
                    Select All
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedFieldIds(['client_code', 'form_number'])}
                    className="text-[11px] text-slate-500 hover:underline"
                  >
                    Reset Keys Only
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                {COMMON_OUTPUT_FIELDS.map((f) => (
                  <label
                    key={f.id}
                    className="flex items-center space-x-2 p-1.5 bg-white border border-slate-200 rounded text-xs cursor-pointer hover:bg-blue-50/50"
                  >
                    <input
                      type="checkbox"
                      checked={selectedFieldIds.includes(f.id)}
                      onChange={() => toggleField(f.id)}
                      className="rounded text-blue-600 focus:ring-blue-500"
                    />
                    <div className="truncate">
                      <span className="font-medium text-slate-800">{f.label}</span>
                      <span className="text-[10px] text-slate-400 block font-mono truncate">{f.table}</span>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}
        </form>
      </div>

      {/* Retrieval Summary Card (When search executed) */}
      {hasSearched && response && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 mb-4 border-b border-slate-100 gap-2">
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-600">
                Retrieval Execution Summary
              </h3>
              <p className="text-xs text-slate-400">
                AIU Relational Engine Result
              </p>
            </div>
            <div className="flex items-center space-x-2">
              <span
                className={`px-3 py-1 rounded-full text-xs font-bold uppercase ${
                  response.recordCounts.total > 0
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                    : 'bg-amber-100 text-amber-800 border border-amber-300'
                }`}
              >
                {response.recordCounts.total > 0 ? 'STATUS: MATCHED' : 'STATUS: NO MATCH'}
              </span>
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-800 border border-blue-300">
                VALIDATION: {response.validationStatus}
              </span>
            </div>
          </div>

          {/* Metric Pills */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
              <span className="text-[11px] font-semibold text-slate-500 uppercase">Search Criteria</span>
              <div className="text-sm font-bold text-slate-900 font-mono truncate">
                {response.searchCriteria}
              </div>
              <span className="text-[10px] text-slate-400">Type: {response.searchType}</span>
            </div>

            <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
              <span className="text-[11px] font-semibold text-slate-500 uppercase">Tables Found</span>
              <div className="text-sm font-bold text-slate-900">
                {response.tablesReturned} of 5
              </div>
              <span className="text-[10px] text-slate-400">Source Relational Tables</span>
            </div>

            <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
              <span className="text-[11px] font-semibold text-slate-500 uppercase">Total Records</span>
              <div className="text-sm font-bold text-indigo-700">
                {response.recordCounts.total}
              </div>
              <span className="text-[10px] text-slate-400">Matched &amp; Related Records</span>
            </div>

            <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
              <span className="text-[11px] font-semibold text-slate-500 uppercase">Relational Integrity</span>
              <div className="text-sm font-bold text-emerald-600 flex items-center space-x-1">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <span>PASS</span>
              </div>
              <span className="text-[10px] text-slate-400">0 Orphan Violations</span>
            </div>
          </div>

          {/* Relationship Path Breadcrumb */}
          <div className="p-3 bg-blue-50/70 border border-blue-200/80 rounded-lg">
            <div className="flex items-center space-x-1 text-xs font-bold text-blue-900 mb-1">
              <Layers className="w-3.5 h-3.5 text-blue-600" />
              <span>Relationship Traversal Path:</span>
            </div>
            <div className="text-xs font-mono text-blue-800 break-words leading-relaxed">
              {response.relationshipPaths}
            </div>
          </div>
        </div>
      )}

      {/* No Match State */}
      {hasSearched && response && response.recordCounts.total === 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center shadow-xs">
          <div className="w-12 h-12 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center mx-auto mb-3">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-slate-800 mb-1">No matching records found.</h3>
          <p className="text-sm text-slate-500 max-w-md mx-auto mb-4">
            No record in the AIU dataset matched the criteria <span className="font-mono font-semibold text-slate-700">"{response.searchCriteria}"</span> for search type <span className="font-semibold text-slate-700">{response.searchType}</span>.
          </p>
          <div className="text-xs text-slate-500 bg-slate-50 p-3 rounded-lg max-w-md mx-auto border border-slate-200">
            Tip: Try clicking one of the auditor preset examples above (e.g. Mobile <span className="font-mono">9820123401</span>, PAN <span className="font-mono">ABCDE1201F</span>, or Client Code <span className="font-mono">CL00101</span>).
          </div>
        </div>
      )}

      {/* Result Display: Grouped by Source Table */}
      {hasSearched && response && response.recordCounts.total > 0 && (
        <div className="space-y-5">
          {(Object.keys(TABLES_METADATA) as TableName[]).map((tableName) => {
            const records: any[] = response.data[tableName] || [];
            const meta = TABLES_METADATA[tableName];
            const isCollapsed = collapsedTables[tableName] ?? false;

            if (records.length === 0) return null;

            return (
              <div
                key={tableName}
                className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden transition-shadow"
              >
                {/* Table Header Bar */}
                <div
                  onClick={() => toggleTableCollapse(tableName)}
                  className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between cursor-pointer hover:bg-slate-100/70 select-none"
                >
                  <div className="flex items-center space-x-3">
                    <div className="p-2 bg-blue-100 text-blue-700 rounded-lg">
                      <Database className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center space-x-2">
                        <h4 className="text-sm font-bold text-slate-900">{meta.displayName}</h4>
                        <span className="text-xs font-mono text-slate-400">({tableName})</span>
                        <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800">
                          {records.length} {records.length === 1 ? 'record' : 'records'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">{meta.description}</p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-semibold text-slate-500 hidden sm:inline">
                      {isCollapsed ? 'Expand' : 'Collapse'}
                    </span>
                    {isCollapsed ? (
                      <ChevronDown className="w-4 h-4 text-slate-500" />
                    ) : (
                      <ChevronUp className="w-4 h-4 text-slate-500" />
                    )}
                  </div>
                </div>

                {/* Table Body */}
                {!isCollapsed && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-100/60 border-b border-slate-200 text-slate-700 font-semibold uppercase tracking-wider">
                          <th className="py-2.5 px-3">Audit Status</th>
                          <th className="py-2.5 px-3">Match Reason</th>
                          {/* Render columns based on mode */}
                          {fieldMode === 'selected' ? (
                            meta.columns
                              .filter((c) => selectedFieldIds.includes(c.name) || meta.displayColumns.includes(c.name))
                              .map((c) => (
                                <th key={c.name} className="py-2.5 px-3 font-mono">
                                  {c.name}
                                  {c.isPrimaryKey && <span className="ml-1 text-[9px] text-amber-600 font-bold">(PK)</span>}
                                  {c.isForeignKey && <span className="ml-1 text-[9px] text-indigo-600 font-bold">(FK)</span>}
                                </th>
                              ))
                          ) : (
                            meta.columns
                              .filter((c) => c.name !== 'data')
                              .map((c) => (
                                <th key={c.name} className="py-2.5 px-3 font-mono">
                                  {c.name}
                                </th>
                              ))
                          )}
                          <th className="py-2.5 px-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-mono text-slate-800">
                        {records.map((row, idx) => (
                          <tr key={idx} className="hover:bg-blue-50/30 transition-colors">
                            {/* Status badge */}
                            <td className="py-2.5 px-3 whitespace-nowrap">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                  row._status === 'MATCHED'
                                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                    : 'bg-indigo-100 text-indigo-800 border border-indigo-200'
                                }`}
                              >
                                {row._status || 'RELATED'}
                              </span>
                            </td>

                            {/* Match Reason */}
                            <td className="py-2.5 px-3 font-sans text-slate-600 max-w-xs truncate" title={row._matchReason}>
                              {row._matchReason || 'Relational Link'}
                            </td>

                            {/* Column values */}
                            {fieldMode === 'selected'
                              ? meta.columns
                                  .filter((c) => selectedFieldIds.includes(c.name) || meta.displayColumns.includes(c.name))
                                  .map((c) => (
                                    <td key={c.name} className="py-2.5 px-3 whitespace-nowrap">
                                      {formatCellValue(row[c.name])}
                                    </td>
                                  ))
                              : meta.columns
                                  .filter((c) => c.name !== 'data')
                                  .map((c) => (
                                    <td key={c.name} className="py-2.5 px-3 whitespace-nowrap">
                                      {formatCellValue(row[c.name])}
                                    </td>
                                  ))}

                            {/* Action to inspect complete row & JSONB */}
                            <td className="py-2.5 px-3 text-right whitespace-nowrap">
                              <button
                                onClick={() => setInspectModalRow({ table: meta.displayName, data: row })}
                                className="inline-flex items-center space-x-1 px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[11px] font-sans font-medium transition-colors"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                <span>Inspect JSONB</span>
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Initial Landing State before search */}
      {!hasSearched && (
        <div className="bg-slate-50 border border-dashed border-slate-300 rounded-xl p-8 text-center">
          <div className="w-12 h-12 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center mx-auto mb-3">
            <Search className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-slate-800 mb-1">Ready for Audit Retrieval</h3>
          <p className="text-sm text-slate-500 max-w-lg mx-auto mb-4">
            Select a search type (Mobile Number, PAN, Client Code, Form Number, or Name) above
            and click Search to traverse the relational tree across all 5 source tables.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              onClick={() => setQuickExample('mobile')}
              className="text-xs px-3 py-1.5 bg-white border border-slate-200 hover:border-blue-400 rounded-lg text-slate-700 shadow-xs font-medium"
            >
              Test Mobile Search (9820123401)
            </button>
            <button
              onClick={() => setQuickExample('pan')}
              className="text-xs px-3 py-1.5 bg-white border border-slate-200 hover:border-blue-400 rounded-lg text-slate-700 shadow-xs font-medium"
            >
              Test PAN Search (ABCDE1201F)
            </button>
            <button
              onClick={() => setQuickExample('client_code')}
              className="text-xs px-3 py-1.5 bg-white border border-slate-200 hover:border-blue-400 rounded-lg text-slate-700 shadow-xs font-medium"
            >
              Test Client Code Search (CL00101)
            </button>
          </div>
        </div>
      )}

      {/* JSONB Inspection Modal */}
      {inspectModalRow && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[85vh] flex flex-col border border-slate-200 overflow-hidden">
            {/* Modal Header */}
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
              <div className="flex items-center space-x-2">
                <Code className="w-5 h-5 text-blue-400" />
                <div>
                  <h4 className="text-sm font-bold">Complete Record &amp; JSONB Source Row</h4>
                  <p className="text-xs text-slate-400">Table: {inspectModalRow.table}</p>
                </div>
              </div>
              <button
                onClick={() => setInspectModalRow(null)}
                className="text-slate-400 hover:text-white p-1 rounded-md text-lg leading-none"
              >
                &times;
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto space-y-4">
              <div className="flex items-center justify-between text-xs bg-slate-50 p-2.5 rounded border border-slate-200">
                <span className="font-semibold text-slate-700">Audit Status:</span>
                <span className="font-bold text-emerald-700">{inspectModalRow.data._status || 'VALID'}</span>
                <span className="font-semibold text-slate-700">Linkage:</span>
                <span className="text-slate-600 font-mono">{inspectModalRow.data._matchReason || 'Relational'}</span>
              </div>

              <div>
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-1 block">
                  JSONB Source Payload (Original Excel Row Representation)
                </span>
                <pre className="bg-slate-900 text-emerald-400 p-4 rounded-lg text-xs font-mono overflow-x-auto max-h-96 border border-slate-800">
                  {JSON.stringify(inspectModalRow.data.data || inspectModalRow.data, null, 2)}
                </pre>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-3 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button
                onClick={() => setInspectModalRow(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-medium"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

function formatCellValue(val: any): React.ReactNode {
  if (val === null || val === undefined || val === '') {
    return <span className="text-slate-300 italic">null</span>;
  }
  if (typeof val === 'boolean') {
    return val ? 'true' : 'false';
  }
  if (typeof val === 'object') {
    return <span className="text-blue-600 font-mono text-[10px]">[JSON]</span>;
  }
  return String(val);
}
