// src/components/DataRetrieval.tsx
// AIU Data Retrieval: Two primary modes - Single Search & Bulk Search with Output Field Control and Export

import React, { useState, useRef } from 'react';
import {
  Search,
  Upload,
  FileSpreadsheet,
  Download,
  CheckCircle2,
  AlertCircle,
  Clock,
  Sparkles,
  FileText,
  Filter,
  Layers,
  ArrowRight,
  Database,
  RefreshCw,
  HelpCircle,
} from 'lucide-react';
import {
  SearchType,
  SearchMode,
  SingleSearchResult,
  BulkSearchJob,
  ResultStatus,
} from '../lib/types';
import {
  SEARCH_OPTIONS,
  OUTPUT_FIELDS_CATALOG,
} from '../lib/metadata';
import {
  executeSingleSearch,
  executeBulkSearch,
  getDataSourceMode,
  setDataSourceMode,
} from '../lib/api';
import { parseUploadedFile, validateColumnCompatibility, ParsedFileInfo } from '../lib/fileParser';
import { exportResults, ExportFormat } from '../lib/exportUtils';
import { OutputFieldSelector } from './OutputFieldSelector';

export const DataRetrieval: React.FC = () => {
  // Mode selection: 'single' | 'bulk'
  const [searchMode, setSearchMode] = useState<SearchMode>('single');

  // Active data source mode ('demo' | 'live')
  const [dataSourceMode, setDataSourceModeState] = useState<'demo' | 'live'>(getDataSourceMode());

  // Output fields state shared across both modes
  const [selectedFieldIds, setSelectedFieldIds] = useState<string[]>(
    OUTPUT_FIELDS_CATALOG.filter((f) => f.defaultSelected).map((f) => f.id)
  );

  // -------------------------------------------------------------
  // SINGLE SEARCH STATE
  // -------------------------------------------------------------
  const [singleSearchType, setSingleSearchType] = useState<SearchType>('mobile');
  const [singleSearchValue, setSingleSearchValue] = useState<string>('');
  const [isSingleLoading, setIsSingleLoading] = useState<boolean>(false);
  const [singleResult, setSingleResult] = useState<SingleSearchResult | null>(null);
  const [singleError, setSingleError] = useState<string | null>(null);

  // -------------------------------------------------------------
  // BULK SEARCH STATE
  // -------------------------------------------------------------
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadedFile, setUploadedFile] = useState<ParsedFileInfo | null>(null);
  const [bulkSearchType, setBulkSearchType] = useState<SearchType>('client_code');
  const [selectedInputCol, setSelectedInputCol] = useState<string>('');
  const [columnWarning, setColumnWarning] = useState<string | null>(null);
  const [isBulkProcessing, setIsBulkProcessing] = useState<boolean>(false);
  const [bulkProgress, setBulkProgress] = useState<{ pct: number; done: number; total: number }>({
    pct: 0,
    done: 0,
    total: 0,
  });
  const [bulkJob, setBulkJob] = useState<BulkSearchJob | null>(null);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkFilterTab, setBulkFilterTab] = useState<'ALL' | 'MATCHED' | 'NO MATCH' | 'INVALID'>('ALL');

  // Handle switching data source mode
  const handleToggleDataSource = (mode: 'demo' | 'live') => {
    setDataSourceMode(mode);
    setDataSourceModeState(mode);
    setSingleResult(null);
    setBulkJob(null);
  };

  // -------------------------------------------------------------
  // SINGLE SEARCH HANDLERS
  // -------------------------------------------------------------
  const handleSingleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!singleSearchValue.trim()) return;
    if (selectedFieldIds.length === 0) {
      setSingleError('Please select at least one output field.');
      return;
    }

    setIsSingleLoading(true);
    setSingleError(null);
    setSingleResult(null);

    try {
      const res = await executeSingleSearch(
        singleSearchType,
        singleSearchValue,
        selectedFieldIds
      );
      setSingleResult(res);
      if (res.status === 'INVALID INPUT') {
        setSingleError(res.errorMessage || 'Invalid input value.');
      }
    } catch (err: any) {
      setSingleError(err.message || 'Single search retrieval failed.');
    } finally {
      setIsSingleLoading(false);
    }
  };

  const handleApplySinglePreset = (type: SearchType, val: string) => {
    setSingleSearchType(type);
    setSingleSearchValue(val);
  };

  const handleExportSingle = (format: ExportFormat) => {
    if (!singleResult || !singleResult.data) return;

    const headers = selectedFieldIds.map((id) => {
      const f = OUTPUT_FIELDS_CATALOG.find((item) => item.id === id);
      return { key: f?.label || id, label: f?.label || id };
    });

    // Add identifier & status
    const allHeaders = [
      { key: 'Search Identifier', label: 'Search Identifier' },
      { key: 'Status', label: 'Status' },
      ...headers,
    ];

    const row = {
      'Search Identifier': singleResult.searchValue,
      Status: singleResult.status,
      ...singleResult.data,
    };

    exportResults(format, [row], allHeaders, `AIU_Retrieval_Result_${singleResult.searchValue}`);
  };

  // -------------------------------------------------------------
  // BULK SEARCH HANDLERS
  // -------------------------------------------------------------
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setBulkError(null);
    setBulkJob(null);

    try {
      const parsed = await parseUploadedFile(file);
      setUploadedFile(parsed);

      // Guess best matching column
      const lowerCols = parsed.columns.map((c) => c.toLowerCase());
      let autoCol = parsed.columns[0];

      if (bulkSearchType === 'mobile') {
        const found = parsed.columns.find((c) => c.toLowerCase().includes('mobile') || c.toLowerCase().includes('phone'));
        if (found) autoCol = found;
      } else if (bulkSearchType === 'client_code') {
        const found = parsed.columns.find((c) => c.toLowerCase().includes('client') || c.toLowerCase().includes('code'));
        if (found) autoCol = found;
      } else if (bulkSearchType === 'form_number') {
        const found = parsed.columns.find((c) => c.toLowerCase().includes('form'));
        if (found) autoCol = found;
      }

      setSelectedInputCol(autoCol);
      checkColCompatibility(bulkSearchType, autoCol, parsed.rows);
    } catch (err: any) {
      setBulkError(err.message || 'Failed to read uploaded file.');
      setUploadedFile(null);
    }
  };

  const checkColCompatibility = (type: SearchType, col: string, rows: Record<string, any>[]) => {
    const { warning } = validateColumnCompatibility(type, col, rows);
    setColumnWarning(warning || null);
  };

  const handleProcessBulk = async () => {
    if (!uploadedFile) {
      setBulkError('Please upload an input file first.');
      return;
    }
    if (!selectedInputCol) {
      setBulkError('Please select the input column.');
      return;
    }
    if (selectedFieldIds.length === 0) {
      setBulkError('Please select at least one output field.');
      return;
    }

    setIsBulkProcessing(true);
    setBulkError(null);
    setBulkJob(null);
    setBulkProgress({ pct: 0, done: 0, total: uploadedFile.rowCount });

    try {
      const job = await executeBulkSearch(
        bulkSearchType,
        selectedInputCol,
        uploadedFile.rows,
        selectedFieldIds,
        uploadedFile.fileName,
        (pct, done, total) => {
          setBulkProgress({ pct, done, total });
        }
      );
      setBulkJob(job);
    } catch (err: any) {
      setBulkError(err.message || 'Bulk retrieval processing failed.');
    } finally {
      setIsBulkProcessing(false);
    }
  };

  const handleExportBulk = (format: ExportFormat, scope: 'ALL' | 'MATCHED' | 'UNMATCHED') => {
    if (!bulkJob) return;

    let targetRows = bulkJob.results;
    if (scope === 'MATCHED') {
      targetRows = bulkJob.results.filter((r) => r.status === 'MATCHED' || r.status === 'DUPLICATE');
    } else if (scope === 'UNMATCHED') {
      targetRows = bulkJob.results.filter((r) => r.status === 'NO MATCH' || r.status === 'INVALID INPUT');
    }

    const fieldLabels = selectedFieldIds.map((id) => {
      const f = OUTPUT_FIELDS_CATALOG.find((item) => item.id === id);
      return f?.label || id;
    });

    const headers = [
      { key: 'Row Number', label: 'Row Number' },
      { key: 'Input Identifier', label: 'Input Identifier' },
      { key: 'Status', label: 'Status' },
      ...fieldLabels.map((l) => ({ key: l, label: l })),
    ];

    const rows = targetRows.map((r) => ({
      'Row Number': r.rowNumber,
      'Input Identifier': r.inputIdentifier,
      Status: r.status,
      ...r.data,
    }));

    const prefix = `AIU_Bulk_${scope}_${bulkJob.fileName.replace(/\.[^/.]+$/, '')}`;
    exportResults(format, rows, headers, prefix);
  };

  // Filtered rows for Bulk Preview
  const displayedBulkRows = bulkJob
    ? bulkJob.results.filter((r) => {
        if (bulkFilterTab === 'MATCHED') return r.status === 'MATCHED' || r.status === 'DUPLICATE';
        if (bulkFilterTab === 'NO MATCH') return r.status === 'NO MATCH';
        if (bulkFilterTab === 'INVALID') return r.status === 'INVALID INPUT';
        return true;
      })
    : [];

  return (
    <div className="space-y-6">
      {/* Top Banner & Mode Toggle */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 gap-3">
          <div>
            <h2 className="text-xl font-bold text-slate-900 flex items-center space-x-2">
              <Search className="w-5 h-5 text-blue-600" />
              <span>AIU Client Data Retrieval</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Retrieve records by Single Identifier or process Batch Input files (CSV, Excel, TXT).
            </p>
          </div>

          {/* Data Source Mode Indicator & Switcher */}
          <div className="flex items-center space-x-2 bg-slate-50 p-1 rounded-lg border border-slate-200 text-xs">
            <span className="text-slate-500 font-medium px-2">Data Source:</span>
            <button
              onClick={() => handleToggleDataSource('demo')}
              className={`px-2.5 py-1 rounded font-semibold transition-colors ${
                dataSourceMode === 'demo'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Test Dataset (50/tbl)
            </button>
            <button
              onClick={() => handleToggleDataSource('live')}
              className={`px-2.5 py-1 rounded font-semibold transition-colors ${
                dataSourceMode === 'live'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Live Supabase
            </button>
          </div>
        </div>

        {/* Primary Search Mode Selector Tabs */}
        <div className="pt-4 flex items-center justify-center sm:justify-start space-x-3">
          <button
            onClick={() => setSearchMode('single')}
            className={`flex items-center space-x-2 px-5 py-2.5 rounded-lg text-sm font-bold transition-all ${
              searchMode === 'single'
                ? 'bg-blue-600 text-white shadow-sm ring-2 ring-blue-600/30'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
            }`}
          >
            <Search className="w-4 h-4" />
            <span>Single Search</span>
          </button>
          <button
            onClick={() => setSearchMode('bulk')}
            className={`flex items-center space-x-2 px-5 py-2.5 rounded-lg text-sm font-bold transition-all ${
              searchMode === 'bulk'
                ? 'bg-blue-600 text-white shadow-sm ring-2 ring-blue-600/30'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Bulk Search (File Upload)</span>
          </button>
        </div>
      </div>

      {/* ============================================================= */}
      {/* 1. SINGLE SEARCH MODE */}
      {/* ============================================================= */}
      {searchMode === 'single' && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800 mb-3 flex items-center justify-between">
              <span>Step 1 &amp; 2: Specify Identifier</span>
              <div className="flex items-center space-x-1.5 text-xs font-normal">
                <span className="text-slate-400">Auditor Presets:</span>
                <button
                  type="button"
                  onClick={() => handleApplySinglePreset('mobile', '9820123401')}
                  className="px-2 py-0.5 rounded bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 font-mono text-[11px]"
                >
                  Mobile: 9820123401
                </button>
                <button
                  type="button"
                  onClick={() => handleApplySinglePreset('client_code', 'CL00101')}
                  className="px-2 py-0.5 rounded bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 font-mono text-[11px]"
                >
                  Client: CL00101
                </button>
                <button
                  type="button"
                  onClick={() => handleApplySinglePreset('form_number', '1000000001')}
                  className="px-2 py-0.5 rounded bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 font-mono text-[11px]"
                >
                  Form: 1000000001
                </button>
              </div>
            </h3>

            <form onSubmit={handleSingleSearch} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                {/* Search By */}
                <div className="md:col-span-4">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Search By
                  </label>
                  <select
                    value={singleSearchType}
                    onChange={(e) => {
                      setSingleSearchType(e.target.value as SearchType);
                      setSingleSearchValue('');
                    }}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
                  >
                    {SEARCH_OPTIONS.map((opt) => (
                      <option key={opt.type} value={opt.type}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Search Value */}
                <div className="md:col-span-6">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Enter Search Value
                  </label>
                  <input
                    type="text"
                    value={singleSearchValue}
                    onChange={(e) => setSingleSearchValue(e.target.value)}
                    placeholder={
                      SEARCH_OPTIONS.find((o) => o.type === singleSearchType)?.placeholder ||
                      'Enter identifier...'
                    }
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono placeholder:font-sans placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
                  />
                </div>

                {/* Search Trigger */}
                <div className="md:col-span-2 flex items-end">
                  <button
                    type="submit"
                    disabled={isSingleLoading || !singleSearchValue.trim() || selectedFieldIds.length === 0}
                    className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-semibold py-2 px-4 rounded-lg shadow-xs transition-colors flex items-center justify-center space-x-2 text-sm"
                  >
                    {isSingleLoading ? (
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
            </form>

            {singleError && (
              <div className="mt-3 p-3 bg-rose-50 border border-rose-200 rounded-lg flex items-center space-x-2 text-rose-800 text-xs">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{singleError}</span>
              </div>
            )}
          </div>

          {/* Step 3: Reusable Output Field Selector */}
          <OutputFieldSelector
            selectedFieldIds={selectedFieldIds}
            onChange={setSelectedFieldIds}
          />

          {/* Single Search Results Preview */}
          {singleResult && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 gap-3">
                <div className="flex items-center space-x-3">
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-bold uppercase ${
                      singleResult.status === 'MATCHED'
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                        : 'bg-amber-100 text-amber-800 border border-amber-300'
                    }`}
                  >
                    {singleResult.status}
                  </span>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">
                      Result Preview for {singleResult.searchValue}
                    </h3>
                    <p className="text-xs text-slate-400">
                      Retrieved in {singleResult.executionTimeMs} ms &bull; Showing {selectedFieldIds.length} requested fields
                    </p>
                  </div>
                </div>

                {/* Export Buttons */}
                {singleResult.status === 'MATCHED' && singleResult.data && (
                  <div className="flex items-center space-x-2">
                    <span className="text-xs text-slate-500 font-semibold mr-1">Export:</span>
                    <button
                      onClick={() => handleExportSingle('csv')}
                      className="inline-flex items-center space-x-1 px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>CSV</span>
                    </button>
                    <button
                      onClick={() => handleExportSingle('excel')}
                      className="inline-flex items-center space-x-1 px-2.5 py-1 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-medium border border-emerald-200"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Excel</span>
                    </button>
                    <button
                      onClick={() => handleExportSingle('txt')}
                      className="inline-flex items-center space-x-1 px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>TXT</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Data Table */}
              {singleResult.status === 'MATCHED' && singleResult.data ? (
                <div className="overflow-x-auto border border-slate-200 rounded-lg">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-100 text-slate-700 font-bold uppercase tracking-wider">
                        {Object.keys(singleResult.data).map((label) => (
                          <th key={label} className="py-2.5 px-3 whitespace-nowrap">
                            {label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="bg-white divide-x divide-slate-100">
                        {Object.values(singleResult.data).map((val, idx) => (
                          <td key={idx} className="py-3 px-3 font-medium text-slate-800 whitespace-nowrap">
                            {val !== null && val !== undefined && val !== '' ? (
                              String(val)
                            ) : (
                              <span className="text-slate-300 italic">null</span>
                            )}
                          </td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-6 bg-slate-50 border border-dashed border-slate-200 rounded-lg text-center">
                  <AlertCircle className="w-8 h-8 text-amber-500 mx-auto mb-2" />
                  <h4 className="text-sm font-bold text-slate-800">No Matching Record Found</h4>
                  <p className="text-xs text-slate-500 mt-1">
                    The identifier "{singleResult.searchValue}" did not return a valid client record in the database.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ============================================================= */}
      {/* 2. BULK SEARCH MODE */}
      {/* ============================================================= */}
      {searchMode === 'bulk' && (
        <div className="space-y-6">
          {/* File Upload & Column Mapping Card */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 gap-2">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800">
                  Step 1 &amp; 2: Upload File &amp; Map Identifier Column
                </h3>
                <p className="text-xs text-slate-500">
                  Supported formats: CSV, Excel (.xlsx, .xls), or TXT (tab-delimited).
                </p>
              </div>

              {/* Sample Template helper */}
              <div className="text-xs text-blue-600 font-medium">
                <span>Accepts 1,000+ client rows with automatic deduplication &amp; batching</span>
              </div>
            </div>

            {/* Drag & Drop Upload Zone */}
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-300 hover:border-blue-500 bg-slate-50 hover:bg-blue-50/40 rounded-xl p-6 text-center cursor-pointer transition-colors"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv, .xlsx, .xls, .txt"
                onChange={handleFileUpload}
                className="hidden"
              />
              <Upload className="w-8 h-8 text-blue-600 mx-auto mb-2" />
              <div className="text-sm font-bold text-slate-800">
                Click to browse or drag and drop input file
              </div>
              <p className="text-xs text-slate-500 mt-1">
                CSV, XLSX, XLS or TXT containing Mobile Numbers, Client Codes or Form Numbers
              </p>
            </div>

            {/* File Info & Mapping Selectors (When file parsed) */}
            {uploadedFile && (
              <div className="bg-blue-50/60 border border-blue-200 rounded-lg p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center space-x-2">
                    <FileSpreadsheet className="w-4 h-4 text-blue-700" />
                    <span className="font-bold text-slate-800">{uploadedFile.fileName}</span>
                    <span className="px-2 py-0.5 rounded bg-blue-200 text-blue-900 font-bold">
                      {uploadedFile.fileType}
                    </span>
                  </div>
                  <div className="text-slate-600 font-mono">
                    <span className="font-bold text-blue-900">{uploadedFile.rowCount}</span> rows detected &bull;{' '}
                    <span className="font-bold text-blue-900">{uploadedFile.columns.length}</span> columns
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-blue-200/60">
                  {/* Search By */}
                  <div>
                    <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-1">
                      Search By
                    </label>
                    <select
                      value={bulkSearchType}
                      onChange={(e) => {
                        const newType = e.target.value as SearchType;
                        setBulkSearchType(newType);
                        if (uploadedFile && selectedInputCol) {
                          checkColCompatibility(newType, selectedInputCol, uploadedFile.rows);
                        }
                      }}
                      className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-medium text-slate-800"
                    >
                      {SEARCH_OPTIONS.map((opt) => (
                        <option key={opt.type} value={opt.type}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Input Column Selector */}
                  <div>
                    <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-1">
                      Select Input Column
                    </label>
                    <select
                      value={selectedInputCol}
                      onChange={(e) => {
                        setSelectedInputCol(e.target.value);
                        if (uploadedFile) {
                          checkColCompatibility(bulkSearchType, e.target.value, uploadedFile.rows);
                        }
                      }}
                      className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-medium text-slate-800"
                    >
                      {uploadedFile.columns.map((col) => (
                        <option key={col} value={col}>
                          {col} (e.g. "{String(uploadedFile.rows[0]?.[col] ?? '')}")
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {columnWarning && (
                  <div className="p-2.5 bg-amber-100 text-amber-900 rounded text-xs border border-amber-300 flex items-center space-x-2">
                    <AlertCircle className="w-4 h-4 text-amber-700 shrink-0" />
                    <span>{columnWarning}</span>
                  </div>
                )}
              </div>
            )}

            {bulkError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg flex items-center space-x-2 text-rose-800 text-xs">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{bulkError}</span>
              </div>
            )}
          </div>

          {/* Step 3: Reusable Output Field Selector */}
          <OutputFieldSelector
            selectedFieldIds={selectedFieldIds}
            onChange={setSelectedFieldIds}
          />

          {/* Process Button & Progress */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h4 className="text-sm font-bold text-slate-900">Execute Bulk File Retrieval</h4>
                <p className="text-xs text-slate-500">
                  Processes identifiers in batches, removes duplicates, and generates preview and export files.
                </p>
              </div>

              <button
                type="button"
                onClick={handleProcessBulk}
                disabled={isBulkProcessing || !uploadedFile || selectedFieldIds.length === 0}
                className="inline-flex items-center space-x-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white rounded-lg font-semibold text-sm shadow-xs transition-colors shrink-0"
              >
                {isBulkProcessing ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Processing {bulkProgress.pct}%</span>
                  </>
                ) : (
                  <>
                    <ArrowRight className="w-4 h-4" />
                    <span>Process File ({uploadedFile ? uploadedFile.rowCount : 0} Rows)</span>
                  </>
                )}
              </button>
            </div>

            {/* Progress Bar */}
            {isBulkProcessing && (
              <div className="mt-4 space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-600 font-semibold">
                  <span>Processing unique targets: {bulkProgress.done} / {bulkProgress.total}</span>
                  <span>{bulkProgress.pct}%</span>
                </div>
                <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-600 transition-all duration-200"
                    style={{ width: `${bulkProgress.pct}%` }}
                  ></div>
                </div>
              </div>
            )}
          </div>

          {/* Bulk Retrieval Summary & Preview Results */}
          {bulkJob && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 space-y-5">
              {/* Summary Cards */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 gap-3">
                <div>
                  <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900">
                    Bulk Retrieval Summary
                  </h3>
                  <p className="text-xs text-slate-400">
                    File: <span className="font-mono text-slate-700">{bulkJob.fileName}</span> &bull; Completed in {bulkJob.executionTimeMs} ms
                  </p>
                </div>

                {/* Export All / Matched / Unmatched */}
                <div className="flex items-center space-x-2 flex-wrap">
                  <span className="text-xs text-slate-500 font-bold mr-1">Export Results:</span>
                  <div className="inline-flex rounded-md shadow-xs" role="group">
                    <button
                      onClick={() => handleExportBulk('excel', 'ALL')}
                      className="px-2.5 py-1 text-xs font-semibold rounded-l-md bg-emerald-600 hover:bg-emerald-700 text-white"
                    >
                      All (Excel)
                    </button>
                    <button
                      onClick={() => handleExportBulk('csv', 'ALL')}
                      className="px-2.5 py-1 text-xs font-semibold bg-slate-700 hover:bg-slate-800 text-white"
                    >
                      All (CSV)
                    </button>
                    <button
                      onClick={() => handleExportBulk('excel', 'MATCHED')}
                      className="px-2.5 py-1 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white"
                    >
                      Matched Only
                    </button>
                    <button
                      onClick={() => handleExportBulk('excel', 'UNMATCHED')}
                      className="px-2.5 py-1 text-xs font-semibold rounded-r-md bg-amber-600 hover:bg-amber-700 text-white"
                    >
                      Unmatched Only
                    </button>
                  </div>
                </div>
              </div>

              {/* Metric Statistics */}
              <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                  <span className="text-[11px] font-bold text-slate-500 uppercase">Input Rows</span>
                  <div className="text-lg font-bold text-slate-900">{bulkJob.totalRows}</div>
                </div>
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                  <span className="text-[11px] font-bold text-slate-500 uppercase">Unique Targets</span>
                  <div className="text-lg font-bold text-indigo-700">{bulkJob.uniqueIdentifiers}</div>
                </div>
                <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-200">
                  <span className="text-[11px] font-bold text-emerald-700 uppercase">Matched</span>
                  <div className="text-lg font-bold text-emerald-800">{bulkJob.matchedCount}</div>
                </div>
                <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
                  <span className="text-[11px] font-bold text-amber-700 uppercase">No Match</span>
                  <div className="text-lg font-bold text-amber-800">{bulkJob.noMatchCount}</div>
                </div>
                <div className="p-3 bg-rose-50 rounded-lg border border-rose-200">
                  <span className="text-[11px] font-bold text-rose-700 uppercase">Invalid</span>
                  <div className="text-lg font-bold text-rose-800">{bulkJob.invalidCount}</div>
                </div>
                <div className="p-3 bg-purple-50 rounded-lg border border-purple-200">
                  <span className="text-[11px] font-bold text-purple-700 uppercase">Duplicates</span>
                  <div className="text-lg font-bold text-purple-800">{bulkJob.duplicateCount}</div>
                </div>
              </div>

              {/* Table Preview Filter Tabs */}
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <div className="flex items-center space-x-2 text-xs">
                  <span className="font-bold text-slate-700">Filter Preview:</span>
                  {(['ALL', 'MATCHED', 'NO MATCH', 'INVALID'] as const).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setBulkFilterTab(tab)}
                      className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
                        bulkFilterTab === tab
                          ? 'bg-slate-900 text-white'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                      }`}
                    >
                      {tab}
                    </button>
                  ))}
                </div>
                <span className="text-xs text-slate-500">
                  Showing {displayedBulkRows.length} rows
                </span>
              </div>

              {/* Result Preview Table */}
              <div className="overflow-x-auto border border-slate-200 rounded-lg max-h-96">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-slate-100 text-slate-700 font-bold uppercase sticky top-0 z-10">
                    <tr>
                      <th className="py-2.5 px-3">Row #</th>
                      <th className="py-2.5 px-3">Input Identifier</th>
                      <th className="py-2.5 px-3">Status</th>
                      {selectedFieldIds.map((id) => {
                        const f = OUTPUT_FIELDS_CATALOG.find((item) => item.id === id);
                        return (
                          <th key={id} className="py-2.5 px-3 whitespace-nowrap">
                            {f?.label || id}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono">
                    {displayedBulkRows.map((row) => (
                      <tr key={row.rowNumber} className="hover:bg-slate-50">
                        <td className="py-2.5 px-3 text-slate-400 font-sans">{row.rowNumber}</td>
                        <td className="py-2.5 px-3 font-bold text-slate-900">{row.inputIdentifier}</td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                              row.status === 'MATCHED'
                                ? 'bg-emerald-100 text-emerald-800'
                                : row.status === 'DUPLICATE'
                                ? 'bg-purple-100 text-purple-800'
                                : row.status === 'INVALID INPUT'
                                ? 'bg-rose-100 text-rose-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {row.status}
                          </span>
                        </td>
                        {selectedFieldIds.map((id) => {
                          const f = OUTPUT_FIELDS_CATALOG.find((item) => item.id === id);
                          const val = row.data[f?.label || ''];
                          return (
                            <td key={id} className="py-2.5 px-3 text-slate-800 whitespace-nowrap">
                              {val !== null && val !== undefined && val !== '' ? (
                                String(val)
                              ) : (
                                <span className="text-slate-300 italic">-</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
