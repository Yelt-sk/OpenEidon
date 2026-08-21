import { useState, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import 'katex/dist/katex.min.css';
import { Copy, Check } from 'lucide-react';
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

function getTextContent(node: any): string {
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map(getTextContent).join('');
  }
  if (node?.props?.children) {
    return getTextContent(node.props.children);
  }
  return '';
}

function CodeBlockPre({ children, ...props }: any) {
  const [copied, setCopied] = useState(false);
  const codeElement = Array.isArray(children) ? children[0] : children;
  const className = codeElement?.props?.className || '';
  const match = /language-([\w-]+)/.exec(className);
  const lang = match ? match[1] : '';
  const code = getTextContent(codeElement?.props?.children).replace(/\n$/, '');

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className="code-block-wrapper relative my-3"
      style={{ borderRadius: 'var(--radius-md)', overflow: 'hidden' }}
    >
      <div
        className="flex items-center justify-between px-4 py-1.5 text-xs"
        style={{ background: 'var(--color-bg-tertiary)', color: 'var(--color-text-tertiary)' }}
      >
        <span className="font-mono">{lang || 'code'}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 px-2 py-0.5 rounded transition-colors cursor-pointer"
          style={{ color: 'var(--color-text-tertiary)' }}
          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-text-secondary)')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-tertiary)')}
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre {...props} style={{ margin: 0, borderRadius: 0 }}>
        {children}
      </pre>
    </div>
  );
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
              <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkMath]}
                rehypePlugins={[[rehypeHighlight, { detect: true }], rehypeKatex]}
                components={{ pre: CodeBlockPre }}
              >
                {cleanContent}
              </ReactMarkdown>
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
