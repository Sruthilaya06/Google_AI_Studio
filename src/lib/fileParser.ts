// src/lib/fileParser.ts
// Client-side file parser supporting CSV, Excel (.xlsx, .xls), and TXT formats for AIU Bulk Search

import * as XLSX from 'xlsx';

export interface ParsedFileInfo {
  fileName: string;
  fileType: string;
  rowCount: number;
  columns: string[];
  rows: Record<string, any>[];
}

/**
 * Parses user-uploaded file using FileReader and XLSX
 */
export async function parseUploadedFile(file: File): Promise<ParsedFileInfo> {
  const extension = file.name.split('.').pop()?.toLowerCase() || '';

  if (!['csv', 'xlsx', 'xls', 'txt'].includes(extension)) {
    throw new Error(
      `Unsupported file extension '.${extension}'. Please upload a CSV, Excel (.xlsx, .xls) or TXT file.`
    );
  }

  const buffer = await file.arrayBuffer();

  if (extension === 'csv' || extension === 'txt') {
    // Attempt parsing as text first, or fallback to XLSX
    const textDecoder = new TextDecoder('utf-8');
    const textContent = textDecoder.decode(buffer);

    if (!textContent.trim()) {
      throw new Error('The uploaded file is empty. Please provide a valid data file.');
    }

    // Determine delimiter: comma, tab, or semicolon
    const firstLine = textContent.split(/\r?\n/)[0] || '';
    let delimiter = ',';
    if (firstLine.includes('\t')) delimiter = '\t';
    else if (firstLine.includes(';') && !firstLine.includes(',')) delimiter = ';';

    const workbook = XLSX.read(textContent, { type: 'string', raw: true });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rawJson: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

    if (rawJson.length === 0) {
      throw new Error('No data rows found in the uploaded file.');
    }

    const columns = Object.keys(rawJson[0]);

    return {
      fileName: file.name,
      fileType: extension.toUpperCase(),
      rowCount: rawJson.length,
      columns,
      rows: rawJson,
    };
  }

  // Excel binary (.xlsx, .xls)
  const workbook = XLSX.read(buffer, { type: 'array' });
  if (workbook.SheetNames.length === 0) {
    throw new Error('The Excel workbook contains no sheets.');
  }

  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];
  const rawJson: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

  if (rawJson.length === 0) {
    throw new Error('The selected Excel sheet contains no data rows.');
  }

  const columns = Object.keys(rawJson[0]);

  return {
    fileName: file.name,
    fileType: extension.toUpperCase(),
    rowCount: rawJson.length,
    columns,
    rows: rawJson,
  };
}

/**
 * Validates whether the selected input column values appear consistent with the Search Type
 */
export function validateColumnCompatibility(
  searchType: string,
  columnName: string,
  sampleRows: Record<string, any>[]
): { compatible: boolean; warning?: string } {
  if (sampleRows.length === 0) return { compatible: true };

  const samples = sampleRows
    .slice(0, 15)
    .map((r) => String(r[columnName] ?? '').trim())
    .filter(Boolean);

  if (samples.length === 0) {
    return {
      compatible: false,
      warning: `The selected column '${columnName}' has empty values in the first sample rows.`,
    };
  }

  if (searchType === 'mobile') {
    const digitSamples = samples.filter((s) => /^\+?\d[\d\s-]{8,14}\d$/.test(s));
    if (digitSamples.length < samples.length * 0.5) {
      return {
        compatible: false,
        warning: `Notice: Values in '${columnName}' don't look like phone numbers (e.g. "${samples[0]}"). Ensure you selected the correct column.`,
      };
    }
  }

  if (searchType === 'form_number') {
    const numericSamples = samples.filter((s) => /^\d+(\.0+)?$/.test(s));
    if (numericSamples.length < samples.length * 0.5) {
      return {
        compatible: false,
        warning: `Notice: Values in '${columnName}' do not appear to be numeric Form Numbers (e.g. "${samples[0]}").`,
      };
    }
  }

  return { compatible: true };
}
