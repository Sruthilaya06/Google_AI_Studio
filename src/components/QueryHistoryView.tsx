// src/components/QueryHistoryView.tsx
// Local Query History view with one-click search replay and export

import React, { useState, useEffect } from 'react';
import {
  History,
  Search,
  Trash2,
  ArrowRight,
  Clock,
  CheckCircle2,
  AlertCircle,
  RotateCcw,
} from 'lucide-react';
import { QueryHistoryItem, SearchType } from '../lib/types';
import { getQueryHistory, clearQueryHistory } from '../lib/api';

interface QueryHistoryViewProps {
  onReplaySearch: (type: SearchType, val: string) => void;
}

export const QueryHistoryView: React.FC<QueryHistoryViewProps> = ({ onReplaySearch }) => {
  const [history, setHistory] = useState<QueryHistoryItem[]>([]);

  useEffect(() => {
    setHistory(getQueryHistory());
  }, []);

  const handleClear = () => {
    if (confirm('Clear all local query audit history?')) {
      clearQueryHistory();
      setHistory([]);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded text-xs font-semibold bg-blue-100 text-blue-800 border border-blue-200 mb-1.5">
            <History className="w-3.5 h-3.5 text-blue-600" />
            <span>Audit Trail &bull; Local Query Log</span>
          </div>
          <h2 className="text-xl font-bold text-slate-900">Auditor Query History</h2>
          <p className="text-xs text-slate-500">
            Chronological audit trail of all searches performed during the session. Click any query to re-execute.
          </p>
        </div>

        {history.length > 0 && (
          <button
            onClick={handleClear}
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-xs font-semibold transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Clear History</span>
          </button>
        )}
      </div>

      {/* History Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        {history.length === 0 ? (
          <div className="p-8 text-center">
            <Clock className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <h4 className="text-sm font-bold text-slate-700">No Query History Recorded</h4>
            <p className="text-xs text-slate-400 mt-1">
              Searches performed in the Data Retrieval tab will be logged here automatically.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100/60 border-b border-slate-200 text-slate-700 font-semibold uppercase tracking-wider">
                  <th className="py-3 px-4">Timestamp</th>
                  <th className="py-3 px-4">Search Type</th>
                  <th className="py-3 px-4">Search Query</th>
                  <th className="py-3 px-4">Tables Returned</th>
                  <th className="py-3 px-4">Records Count</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Replay Query</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {history.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3 px-4 text-slate-500 whitespace-nowrap">
                      {new Date(item.timestamp).toLocaleString()}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-slate-100 text-slate-800">
                        {item.searchType.toUpperCase()}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-bold text-slate-900 whitespace-nowrap">
                      {item.searchValue}
                    </td>
                    <td className="py-3 px-4 text-slate-700 font-mono">
                      {item.tablesReturned} of 5
                    </td>
                    <td className="py-3 px-4 font-bold text-indigo-700 font-mono">
                      {item.resultCount} records
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          item.status === 'MATCHED'
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                            : 'bg-amber-100 text-amber-800 border border-amber-200'
                        }`}
                      >
                        {item.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <button
                        onClick={() => onReplaySearch(item.searchType, item.searchValue)}
                        className="inline-flex items-center space-x-1 px-3 py-1 bg-blue-50 hover:bg-blue-600 hover:text-white text-blue-700 rounded-md font-sans font-medium text-xs transition-colors"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Run Search</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
