/**
 * Markdown renderer for assistant messages.
 *
 * Kept in its own module so the heavy chain (react-markdown, highlight,
 * katex + its CSS and fonts) lands in a lazy chunk instead of the entry
 * bundle — the app shell renders before any of it is fetched.
 */
import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import 'katex/dist/katex.min.css';
import { Copy, Check } from 'lucide-react';

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

export default function MarkdownContent({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[[rehypeHighlight, { detect: true }], rehypeKatex]}
      components={{ pre: CodeBlockPre }}
    >
      {content}
    </ReactMarkdown>
  );
}
