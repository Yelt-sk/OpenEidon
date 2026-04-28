const HISTORY_KEY = 'jarvis_checkin_history';
const MAX_HISTORY = 10;

export interface CheckInEntry {
  timestamp: number;
  userMessage: string;
}

export function loadHistory(): CheckInEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? (JSON.parse(raw) as CheckInEntry[]) : [];
  } catch {
    return [];
  }
}

export function saveEntry(entry: CheckInEntry): void {
  const history = loadHistory();
  history.push(entry);
  if (history.length > MAX_HISTORY) history.splice(0, history.length - MAX_HISTORY);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}

export function buildCheckInPrompt(userResponse: string, history: CheckInEntry[]): string {
  const historyText =
    history.length > 0
      ? history
          .slice(-5)
          .map((e) => {
            const t = new Date(e.timestamp).toLocaleTimeString('ru-RU', {
              hour: '2-digit',
              minute: '2-digit',
            });
            return `[${t}] ${e.userMessage}`;
          })
          .join('\n')
      : 'История пуста — это первый check-in.';

  return `Ты Eidon, персональный AI-ассистент. Пользователь делает периодические check-in раз в несколько десятков минут.

История последних check-inов:
${historyText}

Текущий ответ пользователя: "${userResponse}"

Правила анализа паттерна:
- Если 2+ раза подряд упоминается работа (работаю, пишу код, делаю задачу, учусь, работа) → предложи короткий перерыв (встать, потянуться, воды выпить)
- Если 2+ раза подряд ничего не делает (ничего, отдыхаю, лежу, скучно, лень) → предложи что-то полезное, вспомни чем он обычно занимается по истории
- Иначе → коротко отреагируй и спроси чем можешь помочь

Ответь 1-2 предложениями на русском. Будь дружелюбным и кратким. Не повторяй вопрос пользователю.`;
}
