import { useMemo, useCallback } from 'react';
import { Activity, Bot, Mic, SquareTerminal, Volume2, Maximize2 } from 'lucide-react';
import { InputArea } from '../components/Chat/InputArea';
import { useAppStore } from '../lib/store';
import { useSpeechOutput } from '../hooks/useSpeechOutput';

function trimText(value: string, max = 220): string {
  const text = value.trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

export function OverlayPage() {
  useSpeechOutput();
  const messages = useAppStore((s) => s.messages);
  const streamState = useAppStore((s) => s.streamState);
  const settings = useAppStore((s) => s.settings);

  const goToApp = useCallback(() => {
    const url = new URL(window.location.href);
    url.searchParams.set('eidon', '1');
    url.searchParams.delete('overlay');
    window.location.href = url.toString();
  }, []);

  const lastAssistant = useMemo(
    () => [...messages].reverse().find((msg) => msg.role === 'assistant'),
    [messages],
  );

  const statusLabel = streamState.isStreaming
    ? streamState.phase || 'Working...'
    : 'Ready';

  return (
    <div
      className="h-screen w-screen p-3"
      style={{
        background: 'transparent',
      }}
    >
      <div
        className="h-full rounded-[24px] overflow-hidden"
        style={{
          background:
            'linear-gradient(180deg, rgba(7,14,26,0.96) 0%, rgba(8,11,20,0.9) 100%)',
          border: '1px solid rgba(123, 214, 255, 0.35)',
          boxShadow: '0 18px 60px rgba(0, 0, 0, 0.45), inset 0 0 0 1px rgba(255,255,255,0.04)',
          backdropFilter: 'blur(16px)',
        }}
      >
        <div
          data-tauri-drag-region
          className="px-4 py-3 flex items-center justify-between"
          style={{
            borderBottom: '1px solid rgba(123,214,255,0.16)',
            cursor: 'move',
            userSelect: 'none',
          }}
        >
          <div className="flex items-center gap-3">
            <div
              className="h-10 w-10 rounded-full flex items-center justify-center"
              style={{
                background: 'radial-gradient(circle, rgba(72,205,255,0.95), rgba(29,79,153,0.35))',
                boxShadow: '0 0 24px rgba(72,205,255,0.45)',
              }}
            >
              <Bot size={20} />
            </div>
            <div>
              <div className="text-xl font-semibold" style={{ color: '#eef7ff' }}>Eidon</div>
              <div className="text-xs" style={{ color: 'rgba(167, 214, 255, 0.72)' }}>
                {statusLabel}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs" style={{ color: 'rgba(167, 214, 255, 0.7)' }}>
            <Activity size={14} />
            {settings.speechOutputEnabled ? <Volume2 size={14} /> : <SquareTerminal size={14} />}
            {settings.speechEnabled ? <Mic size={14} /> : null}
            {/* Switch to full app */}
            <button
              onClick={goToApp}
              title="Open full app"
              className="cursor-pointer rounded-lg p-1 transition-all"
              style={{ color: 'rgba(167,214,255,0.65)', marginLeft: 2 }}
              onMouseEnter={(e) => { e.currentTarget.style.color = 'rgba(72,205,255,0.95)'; e.currentTarget.style.background = 'rgba(72,205,255,0.1)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(167,214,255,0.65)'; e.currentTarget.style.background = 'transparent'; }}
            >
              <Maximize2 size={13} />
            </button>
          </div>
        </div>

        <div className="px-4 py-3 flex flex-col gap-3 h-[calc(100%-65px)]">
          <div
            className="rounded-2xl px-4 py-3 min-h-[88px]"
            style={{
              background: 'linear-gradient(180deg, rgba(13,26,43,0.9), rgba(8,15,28,0.82))',
              border: '1px solid rgba(123,214,255,0.12)',
            }}
          >
            <div className="text-xs mb-2 uppercase tracking-[0.18em]" style={{ color: 'rgba(105,198,255,0.75)' }}>
              Last response
            </div>
            <div className="text-sm leading-6" style={{ color: '#dcecff' }}>
              {trimText(streamState.content || lastAssistant?.content || 'Нет ответа')}
            </div>
          </div>

          <div
            className="rounded-2xl px-4 py-3 flex-1 min-h-0"
            style={{
              background: 'linear-gradient(180deg, rgba(8,15,28,0.9), rgba(5,10,19,0.82))',
              border: '1px solid rgba(123,214,255,0.12)',
            }}
          >
            <div className="text-xs mb-2 uppercase tracking-[0.18em]" style={{ color: 'rgba(105,198,255,0.75)' }}>
              Activity
            </div>
            <div className="flex flex-col gap-2 text-xs overflow-y-auto max-h-full pr-1">
              {(streamState.activityLog.length > 0 ? streamState.activityLog : ['Ожидание команды']).slice(-5).map((item, index) => (
                <div key={`${index}-${item}`} style={{ color: 'rgba(224,241,255,0.8)' }}>
                  • {trimText(item, 120)}
                </div>
              ))}
              {streamState.activeToolCalls.slice(-3).map((tool) => (
                <div key={tool.id} style={{ color: 'rgba(123,214,255,0.8)' }}>
                  {tool.tool} • {tool.status}
                </div>
              ))}
            </div>
          </div>

          <div
            className="rounded-2xl p-2"
            style={{
              background: 'rgba(8,15,28,0.82)',
              border: '1px solid rgba(123,214,255,0.12)',
            }}
          >
            <InputArea />
          </div>
        </div>
      </div>
    </div>
  );
}
