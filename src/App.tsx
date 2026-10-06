// src/App.tsx
// AIU Retrieval Application V2: Master Enterprise Container

import React, { useState } from 'react';
import { Navbar, NavTab } from './components/Navbar';
import { Dashboard } from './components/Dashboard';
import { DataRetrieval } from './components/DataRetrieval';
import { DataValidation } from './components/DataValidation';
import { SchemaAndRelationships } from './components/SchemaAndRelationships';
import { DataExplorer } from './components/DataExplorer';
import { QueryHistoryView } from './components/QueryHistoryView';
import { SearchType } from './lib/types';
import { ShieldCheck } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');
  const [retrievalParams, setRetrievalParams] = useState<{
    type: SearchType;
    value: string;
  }>({
    type: 'mobile',
    value: '',
  });

  const handleLaunchSearch = (type: SearchType, val: string) => {
    setRetrievalParams({ type, value: val });
    setActiveTab('retrieval');
  };

  return (
    <div className="min-h-screen bg-slate-100/70 text-slate-900 flex flex-col font-sans selection:bg-blue-600 selection:text-white">
      {/* Top Navigation */}
      <Navbar activeTab={activeTab} onTabChange={setActiveTab} />

      {/* Main View Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {activeTab === 'dashboard' && (
          <Dashboard
            onNavigate={setActiveTab}
            onSelectQuery={handleLaunchSearch}
          />
        )}

        {activeTab === 'retrieval' && (
          <DataRetrieval
            initialSearchType={retrievalParams.type}
            initialSearchValue={retrievalParams.value}
          />
        )}

        {activeTab === 'validation' && <DataValidation />}

        {activeTab === 'schema' && <SchemaAndRelationships />}

        {activeTab === 'explorer' && <DataExplorer />}

        {activeTab === 'history' && (
          <QueryHistoryView onReplaySearch={handleLaunchSearch} />
        )}
      </main>

      {/* Enterprise Audit Footer */}
      <footer className="bg-white border-t border-slate-200 py-4 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center space-x-2">
            <ShieldCheck className="w-4 h-4 text-blue-600" />
            <span className="font-semibold text-slate-700">Audit Intelligence Unit (AIU)</span>
            <span>&bull; Version 2.0 (Relational Multi-Identifier Upgrade)</span>
          </div>
          <div className="flex items-center space-x-4 text-[11px]">
            <span>Form Number: BIGINT</span>
            <span>&bull;</span>
            <span>Identifiers: TEXT</span>
            <span>&bull;</span>
            <span>Row Retention: JSONB</span>
            <span>&bull;</span>
            <span className="text-emerald-700 font-semibold">Integrity: 100% Pass</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
