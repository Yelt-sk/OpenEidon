import React, { useState } from 'react';
import { UpdateChecker } from './components/UpdateChecker';
import { SavingsDashboard } from './components/SavingsDashboard';
import { EnergyDashboard } from './components/EnergyDashboard';
import { TraceDebugger } from './components/TraceDebugger';
import { LearningCurve } from './components/LearningCurve';
import { MemoryBrowser } from './components/MemoryBrowser';
import { AdminPanel } from './components/AdminPanel';
import { SettingsPanel } from './components/SettingsPanel';
import { AgentsPanel } from './components/AgentsPanel';

type TabId = 'savings' | 'energy' | 'traces' | 'learning' | 'memory' | 'agents' | 'admin' | 'settings';

interface Tab {
  id: TabId;
  label: string;
}

const TABS: Tab[] = [
  { id: 'savings', label: 'Savings' },
  { id: 'energy', label: 'Energy' },
  { id: 'traces', label: 'Traces' },
  { id: 'learning', label: 'Learning' },
  { id: 'memory', label: 'Memory' },
  { id: 'agents', label: 'Agents' },
  { id: 'admin', label: 'Admin' },
  { id: 'settings', label: 'Settings' },
];

const API_URL = 'http://localhost:8000';

export function App() {
  const [activeTab, setActiveTab] = useState<TabId>('savings');

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1 style={styles.title}>OpenJarvis Desktop</h1>
        <nav style={styles.nav}>
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                ...styles.tabButton,
                ...(activeTab === tab.id ? styles.activeTab : {}),
              }}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </header>

      <UpdateChecker />

      <main style={styles.main}>
        {activeTab === 'savings' && <SavingsDashboard apiUrl={API_URL} />}
        {activeTab === 'energy' && <EnergyDashboard apiUrl={API_URL} />}
        {activeTab === 'traces' && <TraceDebugger apiUrl={API_URL} />}
        {activeTab === 'learning' && <LearningCurve apiUrl={API_URL} />}
        {activeTab === 'memory' && <MemoryBrowser apiUrl={API_URL} />}
        {activeTab === 'agents' && <AgentsPanel apiUrl={API_URL} />}
        {activeTab === 'admin' && <AdminPanel apiUrl={API_URL} />}
        {activeTab === 'settings' && <SettingsPanel />}
      </main>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    backgroundColor: '#1e1e2e',
    color: '#cdd6f4',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 24px',
    borderBottom: '1px solid #313244',
    backgroundColor: '#181825',
  },
  title: {
    fontSize: '18px',
    fontWeight: 600,
    margin: 0,
    color: '#89b4fa',
  },
  nav: {
    display: 'flex',
    gap: '4px',
  },
  tabButton: {
    padding: '8px 16px',
    border: 'none',
    borderRadius: '6px',
    backgroundColor: 'transparent',
    color: '#a6adc8',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 500,
    transition: 'all 0.15s ease',
  },
  activeTab: {
    backgroundColor: '#313244',
    color: '#cdd6f4',
  },
  main: {
    padding: '24px',
    height: 'calc(100vh - 60px)',
    overflow: 'auto',
  },
};
