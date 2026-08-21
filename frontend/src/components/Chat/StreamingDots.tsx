interface Props {
  phase: string;
}

export function StreamingDots({ phase }: Props) {
  return (
    <div className="flex items-center gap-2 py-2">
      <div className="flex gap-1">
        <span
          className="w-1.5 h-1.5 rounded-full animate-bounce"
          style={{ background: 'var(--color-text-tertiary)', animationDelay: '0ms' }}
        />
        <span
          className="w-1.5 h-1.5 rounded-full animate-bounce"
          style={{ background: 'var(--color-text-tertiary)', animationDelay: '150ms' }}
        />
        <span
          className="w-1.5 h-1.5 rounded-full animate-bounce"
          style={{ background: 'var(--color-text-tertiary)', animationDelay: '300ms' }}
        />
      </div>
      {phase && (
        <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
          {phase}
        </span>
      )}
    </div>
  );
}
