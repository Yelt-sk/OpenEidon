import { useEffect, useRef } from 'react';
import { acknowledgeReminder, fetchReminderAlerts } from '../lib/api';
import { generateId, useAppStore } from '../lib/store';

function cleanSpeechText(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[(.*?)\]\((.*?)\)/g, '$1')
    .replace(/^>\s+/gm, '')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/:([a-z0-9_+-]+):/gi, ' ')
    .replace(/[*_~#]+/g, ' ')
    .replace(/[^\S\r\n]*[\u2022\u25CF\u25AA\u25E6]+[^\S\r\n]*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function playReminderTone() {
  if (typeof window === 'undefined') return;
  const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) return;
  const audioContext = new AudioContextCtor();
  const now = audioContext.currentTime;
  [0, 0.25].forEach((offset) => {
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, now + offset);
    gain.gain.exponentialRampToValueAtTime(0.2, now + offset + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.18);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start(now + offset);
    oscillator.stop(now + offset + 0.2);
  });
  setTimeout(() => {
    void audioContext.close().catch(() => {});
  }, 1000);
}

function selectPreferredVoice(lang: string): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;

  const normalizedLang = lang.toLowerCase();
  const langVoices = voices.filter((voice) => voice.lang.toLowerCase().startsWith(normalizedLang.slice(0, 2)));
  const pool = langVoices.length ? langVoices : voices;

  const maleHints = ['male', 'man', 'pavel', 'dmitry', 'ivan', 'aleksey', 'alexander', 'microsoft david', 'microsoft pavel'];
  const preferred =
    pool.find((voice) => maleHints.some((hint) => `${voice.name} ${voice.voiceURI}`.toLowerCase().includes(hint))) ||
    pool.find((voice) => /microsoft/i.test(voice.name)) ||
    pool[0];

  return preferred || null;
}

function speakReminder(text: string) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  const cleanedText = cleanSpeechText(text);
  if (!cleanedText) return;
  const utterance = new SpeechSynthesisUtterance(cleanedText);
  utterance.lang = /[А-Яа-яЁё]/.test(text) ? 'ru-RU' : 'en-US';
  utterance.rate = 1.3;
  const voice = selectPreferredVoice(utterance.lang);
  if (voice) utterance.voice = voice;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

export function useReminderAlerts() {
  const activeId = useAppStore((s) => s.activeId);
  const addMessage = useAppStore((s) => s.addMessage);
  const seenRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    let stopped = false;

    const poll = async () => {
      try {
        const alerts = await fetchReminderAlerts();
        for (const alert of alerts) {
          if (seenRef.current.has(alert.id)) continue;
          seenRef.current.add(alert.id);
          playReminderTone();
          speakReminder(alert.text);
          if (activeId) {
            addMessage(activeId, {
              id: generateId(),
              role: 'assistant',
              content: `Reminder: ${alert.text}`,
              timestamp: Date.now(),
            });
          }
          await acknowledgeReminder(alert.id);
        }
      } catch {
      }
      if (!stopped) {
        window.setTimeout(poll, 2000);
      }
    };

    void poll();
    return () => {
      stopped = true;
    };
  }, [activeId, addMessage]);
}
