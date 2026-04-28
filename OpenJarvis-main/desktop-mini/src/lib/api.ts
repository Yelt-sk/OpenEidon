const API_BASE = "http://127.0.0.1:8000";
const MODEL = "qwen3.5:cloud";

export interface CheckInSettings {
  enabled: boolean;
  interval_minutes: number;
}

export async function fetchCheckInSettings(): Promise<CheckInSettings> {
  try {
    const res = await fetch(`${API_BASE}/v1/checkin/settings`, { signal: AbortSignal.timeout(3000) });
    if (res.ok) return res.json() as Promise<CheckInSettings>;
  } catch { /* fallback below */ }
  return { enabled: true, interval_minutes: 30 };
}

export async function saveCheckInSettings(settings: CheckInSettings): Promise<void> {
  await fetch(`${API_BASE}/v1/checkin/settings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  });
}

export async function checkConnection(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}

export function streamChat(
  message: string,
  onChunk: (text: string) => void,
  onDone: () => void,
  onError: (err: string) => void,
  signal: AbortSignal,
): void {
  fetch(`${API_BASE}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "user", content: message }],
      stream: true,
    }),
    signal,
  })
    .then(async (res) => {
      if (!res.ok) {
        onError(`Ошибка ${res.status}`);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        onError("Нет тела ответа");
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") {
            onDone();
            return;
          }
          try {
            const json = JSON.parse(data);
            const chunk = json.choices?.[0]?.delta?.content;
            if (chunk) onChunk(chunk);
          } catch {
            // skip malformed chunk
          }
        }
      }

      onDone();
    })
    .catch((err: unknown) => {
      if (err instanceof Error && err.name === "AbortError") return;
      onError("Ошибка подключения к агенту.");
    });
}
