// src/components/Navbar.tsx
// Top navigation bar for the AIU Audit Intelligence Unit Dashboard

import React from 'react';
import {
  ShieldCheck,
  Search,
  CheckCircle2,
  GitFork,
  Database,
  History,
  LayoutDashboard,
} from 'lucide-react';

export type NavTab =
  | 'dashboard'
  | 'retrieval'
  | 'validation'
  | 'schema'
  | 'explorer'
  | 'history';

interface NavbarProps {
  activeTab: NavTab;
  onTabChange: (tab: NavTab) => void;
}

export const Navbar: React.FC<NavbarProps> = ({ activeTab, onTabChange }) => {
  const tabs = [
    { id: 'dashboard' as NavTab, label: 'Dashboard', icon: LayoutDashboard },
    { id: 'retrieval' as NavTab, label: 'Data Retrieval', icon: Search, badge: 'V2' },
    { id: 'validation' as NavTab, label: 'Data Validation', icon: CheckCircle2 },
    { id: 'schema' as NavTab, label: 'Schema & Relationships', icon: GitFork },
    { id: 'explorer' as NavTab, label: 'Data Explorer', icon: Database },
    { id: 'history' as NavTab, label: 'Query History', icon: History },
  ];

  return (
    <header className="bg-slate-900 border-b border-slate-800 text-white sticky top-0 z-50 shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Brand & AIU Logo */}
          <div className="flex items-center space-x-3 cursor-pointer" onClick={() => onTabChange('dashboard')}>
            <div className="w-10 h-10 rounded-lg bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center text-white shadow-inner font-bold">
              <ShieldCheck className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-bold text-lg tracking-tight text-slate-100">AIU Audit Intelligence</span>
                <span className="px-2 py-0.5 text-xs font-semibold rounded bg-blue-500/20 text-blue-400 border border-blue-500/30">
                  V2 RELATIONAL
                </span>
              </div>
              <p className="text-xs text-slate-400">Enterprise Audit &amp; Data Retrieval Unit</p>
            </div>
          </div>

          {/* Nav Items */}
          <nav className="flex items-center space-x-1">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => onTabChange(tab.id)}
                  className={`flex items-center space-x-2 px-3.5 py-2 rounded-md text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{tab.label}</span>
                  {tab.badge && (
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded font-bold uppercase tracking-wider ${
                        isActive ? 'bg-blue-800 text-blue-100' : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      }`}
                    >
                      {tab.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Right Status Badge */}
          <div className="hidden lg:flex items-center space-x-2 text-xs text-slate-400 bg-slate-800/60 px-3 py-1.5 rounded-full border border-slate-700/50">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>Dataset: 5 Tables / 250 Records</span>
          </div>
        </div>
      </div>
    </header>
  );
};
