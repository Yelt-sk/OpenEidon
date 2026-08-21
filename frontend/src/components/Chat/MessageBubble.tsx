import { useState, useMemo, lazy, Suspense } from 'react';
import { Copy, Check } from 'lucide-react';

const MarkdownContent = lazy(() => import('./MarkdownContent'));
import { AudioPlayer } from './AudioPlayer';
import { ToolCallCard } from './ToolCallCard';
import { XRayFooter } from './XRayFooter';
import type { ChatMessage } from '../../types';

function stripThinkTags(text: string): string {
  let cleaned = text.replace(/<think>[\s\S]*?<\/think>\s*/gi, '');
  cleaned = cleaned.replace(/^[\s\S]*?<\/think>\s*/i, '');
  return cleaned.trim();
}

interface Props {
  message: ChatMessage;
}

function CopyMessageButton({ content }: { content: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className="p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
      style={{ color: 'var(--color-text-tertiary)' }}
      title="Copy message"
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
    </button>
  );
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

export function MessageBubble({ message }: Props) {
  const isUser = message.role === 'user';
  const cleanContent = useMemo(() => (isUser ? message.content : stripThinkTags(message.content)), [message.content, isUser]);

  if (isUser) {
    return (
      <div className="msg user">
        <div className="av">AV</div>
        <div className="bubble">
          <div className="who">
            <span>YOU</span>
            <span className="time">{message.timestamp ? formatTime(message.timestamp) : ''}</span>
          </div>
          <div className="text" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {cleanContent}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="msg eidon">
      <div className="av">E</div>
      <div className="bubble">
        <div className="who">
          <span>EIDON</span>
          <span className="time">{message.timestamp ? formatTime(message.timestamp) : ''}</span>
        </div>
        <div className="text">
          {/* Tool calls */}
          {message.toolCalls && message.toolCalls.length > 0 && (
            <div style={{ marginBottom: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {message.toolCalls.map((tc) => (
                <div key={tc.id} className="tool-inline">
                  <div className="ti-head">
                    <span className="ti-name">{tc.tool}</span>
                    <span className={`ti-status ${tc.status}`}>
                      {tc.status === 'running' ? '● running' : tc.status === 'success' ? '✓ done' : '✗ error'}
                      {tc.latency != null && ` · ${tc.latency < 1000 ? Math.round(tc.latency) + 'ms' : (tc.latency / 1000).toFixed(1) + 's'}`}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Audio */}
          {message.audio?.url && <AudioPlayer src={message.audio.url} />}

          {/* Markdown content */}
          {cleanContent && (
            <div className="prose max-w-none" style={{ color: 'var(--ink)' }}>
              <Suspense
                fallback={
                  <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {cleanContent}
                  </div>
                }
              >
                <MarkdownContent content={cleanContent} />
              </Suspense>
            </div>
          )}

          {/* Copy + telemetry */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
            <CopyMessageButton content={cleanContent} />
          </div>
          <XRayFooter usage={message.usage} telemetry={message.telemetry} />
        </div>
      </div>
    </div>
  );
}
