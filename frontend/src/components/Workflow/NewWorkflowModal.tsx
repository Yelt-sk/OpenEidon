import { useState } from 'react';
import { X } from 'lucide-react';
import { useAppStore } from '../../lib/store';
import type { Workflow } from '../../lib/store';

const TOOLS = [
  { id: 'web_search', label: 'Browser', sub: 'search · web' },
  { id: 'play_youtube', label: 'YouTube', sub: 'music · video' },
  { id: 'open_app', label: 'Apps', sub: 'open · launch' },
  { id: 'set_reminder', label: 'Reminders', sub: 'set · manage' },
  { id: 'open_site', label: 'Sites', sub: 'navigate' },
  { id: 'save_preference', label: 'Memory', sub: 'read · write' },
  { id: 'open_work_apps', label: 'Work Setup', sub: 'all work apps' },
  { id: 'list_installed_apps', label: 'System', sub: 'apps · processes' },
];

const AUTONOMY_LABELS = [
  { level: 1, title: 'Observe', desc: 'watch only — never act on my behalf' },
  { level: 2, title: 'Preview', desc: 'show me the plan before any external action' },
  { level: 3, title: 'Supervised', desc: 'do reads freely · ask once before writes' },
  { level: 4, title: 'Autopilot', desc: 'run end-to-end · notify me after' },
];

const WEEKDAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function generateId() {
  return Math.random().toString(36).slice(2, 10);
}

interface Props {
  onClose: () => void;
}

export function NewWorkflowModal({ onClose }: Props) {
  const addWorkflow = useAppStore(s => s.addWorkflow);

  const [name, setName] = useState('');
  const [hour, setHour] = useState(7);
  const [minute, setMinute] = useState(0);
  const [ampm, setAmpm] = useState<'AM' | 'PM'>('AM');
  const [regularity, setRegularity] = useState<Workflow['regularity']>('weekdays');
  const [weekdays, setWeekdays] = useState<number[]>([0, 1, 2, 3, 4]); // M-F
  const [selectedTools, setSelectedTools] = useState<string[]>(['web_search', 'open_app']);
  const [instructions, setInstructions] = useState('');
  const [autonomy, setAutonomy] = useState<1 | 2 | 3 | 4>(2);

  const toggleTool = (id: string) => {
    setSelectedTools(prev =>
      prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]
    );
  };

  const toggleWeekday = (idx: number) => {
    setWeekdays(prev =>
      prev.includes(idx) ? prev.filter(d => d !== idx) : [...prev, idx]
    );
  };

  const setQuickTime = (h24: string) => {
    const [h, m] = h24.split(':').map(Number);
    if (h >= 12) {
      setAmpm('PM');
      setHour(h === 12 ? 12 : h - 12);
    } else {
      setAmpm('AM');
      setHour(h === 0 ? 12 : h);
    }
    setMinute(m);
  };

  const getTime24 = () => {
    let h = hour;
    if (ampm === 'PM' && h !== 12) h += 12;
    if (ampm === 'AM' && h === 12) h = 0;
    return `${String(h).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  };

  const handleCreate = () => {
    if (!name.trim() || !instructions.trim()) return;
    const wf: Workflow = {
      id: generateId(),
      name: name.trim(),
      time: getTime24(),
      regularity,
      weekdays,
      tools: selectedTools,
      instructions: instructions.trim(),
      autonomy,
      enabled: true,
    };
    addWorkflow(wf);
    onClose();
  };

  const currentAutonomy = AUTONOMY_LABELS.find(a => a.level === autonomy)!;
  const showWeekdays = regularity === 'weekdays' || regularity === 'weekly';

  return (
    <div className="wf-overlay" onClick={onClose}>
      <div className="wf-modal" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="wf-header">
          <div>
            <div className="wf-title">New workflow</div>
            <div className="wf-subtitle">Automate a recurring task at a set time</div>
          </div>
          <button className="wf-close" onClick={onClose}><X size={14} /></button>
        </div>

        <div className="wf-body">

          {/* Field 01 — NAME */}
          <div className="wf-field">
            <div className="wf-field-label"><span className="wf-n">01</span> NAME</div>
            <input
              className="wf-input"
              placeholder="e.g. Morning ritual"
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </div>

          {/* Field 02 — TIME */}
          <div className="wf-field">
            <div className="wf-field-label"><span className="wf-n">02</span> TIME</div>
            <div className="wf-time-row">
              <div className="wf-time-picker">
                <input
                  className="wf-time-input"
                  type="number"
                  min={1} max={12}
                  value={hour}
                  onChange={e => setHour(Math.max(1, Math.min(12, Number(e.target.value))))}
                />
                <span className="wf-time-sep">:</span>
                <input
                  className="wf-time-input"
                  type="number"
                  min={0} max={59}
                  value={String(minute).padStart(2, '0')}
                  onChange={e => setMinute(Math.max(0, Math.min(59, Number(e.target.value))))}
                />
                <div className="wf-ampm">
                  {(['AM', 'PM'] as const).map(v => (
                    <button
                      key={v}
                      className={`wf-ampm-btn ${ampm === v ? 'active' : ''}`}
                      onClick={() => setAmpm(v)}
                    >{v}</button>
                  ))}
                </div>
              </div>
              <div className="wf-quick-times">
                {['07:00', '09:30', '12:00', '18:00'].map(t => (
                  <button key={t} className="wf-chip" onClick={() => setQuickTime(t)}>{t}</button>
                ))}
              </div>
            </div>
          </div>

          {/* Field 03 — REGULARITY */}
          <div className="wf-field">
            <div className="wf-field-label"><span className="wf-n">03</span> REGULARITY</div>
            <div className="wf-seg">
              {(['once', 'daily', 'weekdays', 'weekly', 'monthly'] as const).map(r => (
                <button
                  key={r}
                  className={`wf-seg-btn ${regularity === r ? 'active' : ''}`}
                  onClick={() => setRegularity(r)}
                >
                  {r.charAt(0).toUpperCase() + r.slice(1)}
                </button>
              ))}
            </div>
            {showWeekdays && (
              <div className="wf-weekdays">
                {WEEKDAY_LABELS.map((label, idx) => (
                  <button
                    key={idx}
                    className={`wf-day-btn ${weekdays.includes(idx) ? 'active' : ''}`}
                    onClick={() => toggleWeekday(idx)}
                  >{label}</button>
                ))}
              </div>
            )}
          </div>

          {/* Field 04 — TOOLS */}
          <div className="wf-field">
            <div className="wf-field-label"><span className="wf-n">04</span> TOOLS</div>
            <div className="wf-tools-grid">
              {TOOLS.map(tool => (
                <button
                  key={tool.id}
                  className={`wf-tool-chip ${selectedTools.includes(tool.id) ? 'active' : ''}`}
                  onClick={() => toggleTool(tool.id)}
                >
                  <span className="wf-tool-name">{tool.label}</span>
                  <span className="wf-tool-sub">{tool.sub}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Field 05 — INSTRUCTIONS */}
          <div className="wf-field">
            <div className="wf-field-label"><span className="wf-n">05</span> INSTRUCTIONS</div>
            <textarea
              className="wf-textarea"
              placeholder="Describe what Eidon should do when this workflow runs..."
              value={instructions}
              onChange={e => setInstructions(e.target.value)}
              rows={4}
            />
            <div className="wf-hints">
              {['summarize news', 'open work apps', 'check reminders', 'play focus music'].map(h => (
                <button
                  key={h}
                  className="wf-chip"
                  onClick={() => setInstructions(prev => prev ? `${prev}, ${h}` : h)}
                >+ {h}</button>
              ))}
            </div>
          </div>

          {/* Field 06 — AUTONOMY */}
          <div className="wf-field">
            <div className="wf-field-label"><span className="wf-n">06</span> AUTONOMY</div>
            <div className="wf-autonomy">
              <input
                type="range"
                min={1} max={4}
                value={autonomy}
                onChange={e => setAutonomy(Number(e.target.value) as 1|2|3|4)}
                className="wf-slider"
              />
              <div className="wf-autonomy-desc">
                <span className="wf-autonomy-level">Level {autonomy} — {currentAutonomy.title}</span>
                <span className="wf-autonomy-text">{currentAutonomy.desc}</span>
              </div>
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="wf-footer">
          <span className="wf-summary">
            {name || 'Workflow'} · {getTime24()} · {regularity} · {selectedTools.length} tools
          </span>
          <div className="wf-footer-btns">
            <button className="wf-btn-cancel" onClick={onClose}>Cancel</button>
            <button
              className="wf-btn-create"
              onClick={handleCreate}
              disabled={!name.trim() || !instructions.trim()}
            >Create workflow</button>
          </div>
        </div>

      </div>
    </div>
  );
}
