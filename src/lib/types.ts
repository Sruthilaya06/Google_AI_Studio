// src/lib/types.ts
// Standardized types for AIU Retrieval Application V2

export type TableName =
  | 'user_details'
  | 'user_account_information'
  | 'user_address_details'
  | 'user_personal_details'
  | 'client_details';

export type SearchType = 'mobile' | 'pan' | 'client_code' | 'form_number' | 'name';

export type RetrievalStatus = 'MATCHED' | 'RELATED' | 'NO MATCH' | 'INVALID' | 'ORPHAN' | 'ERROR';

export interface ColumnDefinition {
  name: string;
  dataType: 'TEXT' | 'BIGINT' | 'DATE' | 'TIMESTAMPTZ' | 'JSONB';
  isPrimaryKey?: boolean;
  isForeignKey?: boolean;
  fkTarget?: {
    table: TableName;
    column: string;
  };
  description?: string;
  defaultVisible?: boolean;
}

export interface TableMetadata {
  id: TableName;
  displayName: string;
  description: string;
  primaryKey: string[];
  columns: ColumnDefinition[];
  displayColumns: string[];
}

export interface RelationshipMetadata {
  id: string;
  code: 'R1' | 'R2' | 'R3' | 'R4' | 'R5';
  parentTable: TableName;
  parentKey: string;
  childTable: TableName;
  childKey: string;
  description: string;
  cardinality: '1:1' | '1:N';
}

export interface SearchMetadata {
  type: SearchType;
  label: string;
  placeholder: string;
  description: string;
  sourceTable: TableName;
  sourceColumn: string;
  matchMethod: 'exact' | 'partial';
  exampleValue: string;
}

export interface OutputFieldOption {
  id: string;
  table: TableName;
  column: string;
  label: string;
  dataType: string;
  defaultSelected: boolean;
}

export interface RecordWithAuditMeta {
  [key: string]: any;
  _sourceTable: TableName;
  _matchReason: string;
  _status: RetrievalStatus;
  _relationshipPath?: string;
}

export interface SearchResponse {
  searchCriteria: string;
  searchType: SearchType;
  executionStatus: 'SUCCESS' | 'ERROR';
  validationStatus: 'PASS' | 'FAIL' | 'N/A';
  tablesReturned: number;
  relationshipPaths: string;
  recordCounts: {
    user_details: number;
    user_account_information: number;
    user_address_details: number;
    user_personal_details: number;
    client_details: number;
    total: number;
  };
  data: {
    user_details: any[];
    user_account_information: any[];
    user_address_details: any[];
    user_personal_details: any[];
    client_details: any[];
  };
  auditRecords?: RecordWithAuditMeta[];
  matchedPrimaryRecord?: RecordWithAuditMeta | null;
  errorMessage?: string;
}

export interface QueryHistoryItem {
  id: string;
  timestamp: string;
  searchType: SearchType;
  searchValue: string;
  resultCount: number;
  tablesReturned: number;
  status: RetrievalStatus;
  validationStatus: 'PASS' | 'FAIL' | 'N/A';
}

export interface ValidationSummary {
  totalTables: number;
  totalRecords: number;
  validRecords: number;
  invalidRecords: number;
  orphanRecords: number;
  relationshipsChecked: number;
  tableStats: {
    table: TableName;
    displayName: string;
    count: number;
    pkValid: boolean;
    fkValid: boolean;
    orphans: number;
  }[];
  relationshipChecks: {
    id: string;
    code: string;
    name: string;
    status: 'VALID' | 'FAIL';
    sourceCount: number;
    linkedCount: number;
    orphans: number;
    message: string;
  }[];
}
