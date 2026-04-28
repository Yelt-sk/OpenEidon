import { useEffect, useRef } from 'react';
import { useAppStore } from '../lib/store';

const TTS_ENDPOINT = 'http://127.0.0.1:8000/v1/speech/tts';

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
    // Strip emoji
    .replace(/[\u{1F000}-\u{1FFFF}]/gu, '')
    .replace(/[\u{2600}-\u{27BF}]/gu, '')
    .replace(/[\u{FE00}-\u{FEFF}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Fallback to browser Web Speech API if backend TTS unavailable
function speakBrowser(text: string) {
  if (!('speechSynthesis' in window)) return;
  const isRu = /[А-Яа-яЁё]/.test(text);
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = isRu ? 'ru-RU' : 'en-US';
  utterance.rate = 1.05;
  utterance.pitch = 1.0;
  const voices = window.speechSynthesis.getVoices();
  const lang2 = utterance.lang.slice(0, 2);
  const pool = voices.filter((v) => v.lang.toLowerCase().startsWith(lang2));
  const best =
    pool.find((v) => /online.*natural|natural.*online/i.test(v.name)) ||
    pool.find((v) => /neural/i.test(v.name)) ||
    pool.find((v) => /microsoft/i.test(v.name)) ||
    pool[0];
  if (best) utterance.voice = best;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

let currentAudio: HTMLAudioElement | null = null;

export function stopCurrentAudio() {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.src = '';
    currentAudio = null;
  }
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
}

async function speakEdgeTTS(text: string): Promise<void> {
  const isRu = /[А-Яа-яЁё]/.test(text);
  const voice = isRu ? 'ru-RU-DmitryNeural' : 'en-US-GuyNeural';

  try {
    const response = await fetch(TTS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voice, rate: '+15%' }),
    });

    if (!response.ok) throw new Error('TTS backend error');

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);

    stopCurrentAudio();
    const audio = new Audio(url);
    currentAudio = audio;
    audio.onended = () => URL.revokeObjectURL(url);
    audio.onerror = () => URL.revokeObjectURL(url);
    await audio.play();
  } catch {
    // Backend unavailable — fallback to browser TTS
    speakBrowser(text);
  }
}

export function useSpeechOutput() {
  const messages = useAppStore((s) => s.messages);
  const activeId = useAppStore((s) => s.activeId);
  const streamState = useAppStore((s) => s.streamState);
  const speechOutputEnabled = useAppStore((s) => s.settings.speechOutputEnabled);
  const lastSpokenMessageIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!speechOutputEnabled || streamState.isStreaming) return;

    const lastAssistant = [...messages].reverse().find((msg) => msg.role === 'assistant');
    if (!lastAssistant || !lastAssistant.content.trim()) return;
    if (lastSpokenMessageIdRef.current === lastAssistant.id) return;

    const text = cleanSpeechText(lastAssistant.content);
    if (!text || /^error:/i.test(text) || /^no response was generated/i.test(text)) return;

    lastSpokenMessageIdRef.current = lastAssistant.id;
    speakEdgeTTS(text);
  }, [activeId, messages, speechOutputEnabled, streamState.isStreaming]);

  useEffect(() => {
    if (!speechOutputEnabled) stopCurrentAudio();
  }, [speechOutputEnabled]);

  useEffect(() => {
    lastSpokenMessageIdRef.current = null;
  }, [activeId]);
}
