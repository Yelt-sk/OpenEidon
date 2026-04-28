import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { checkConnection, streamChat } from "./lib/api";
import { routeIntent } from "./lib/intent";
import { buildCheckInPrompt, loadHistory, saveEntry } from "./lib/checkin";

const MicIcon = () => (
  <svg
    aria-hidden="true"
    className="w-[33px] h-7"
    viewBox="0 0 33 28"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M16.5 18.375C19.5376 18.375 22 15.9126 22 12.875V6.125C22 3.08743 19.5376 0.625 16.5 0.625C13.4624 0.625 11 3.08743 11 6.125V12.875C11 15.9126 13.4624 18.375 16.5 18.375Z"
      fill="currentColor"
    />
    <path
      d="M6.875 12.25C6.875 17.5667 11.1833 21.875 16.5 21.875C21.8167 21.875 26.125 17.5667 26.125 12.25"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
    />
    <path
      d="M16.5 21.875V27.125"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
    />
    <path
      d="M12.125 27.125H20.875"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
    />
  </svg>
);

const Slider = ({
  value,
  onChange,
  label,
}: {
  value: number;
  onChange: (value: number) => void;
  label: string;
}) => (
  <label className="absolute right-[-18px] top-1/2 z-20 flex h-[75px] w-[11px] -translate-y-1/2 items-center justify-center">
    <span className="sr-only">{label}</span>
    <input
      aria-label={label}
      className="jarvis-slider"
      max={100}
      min={0}
      onChange={(event) => onChange(Number(event.target.value))}
      type="range"
      value={value}
    />
  </label>
);

const baseButtonClassName =
  "no-drag flex h-[52px] w-[84px] items-center justify-center rounded-[100px] text-white/95 transition hover:bg-white/15 active:scale-[0.98]";

const BlinkingCursor = () => (
  <span
    className="inline-block w-[2px] h-[18px] ml-[2px] bg-[#d9d0ff]/70 align-middle"
    style={{ animation: "blink 1s step-end infinite" }}
  />
);

const isCheckInMode = new URLSearchParams(window.location.search).get('checkin') === '1';

export const Box = (): JSX.Element => {
  const [inputValue, setInputValue] = useState("");
  const [responseText, setResponseText] = useState(
    isCheckInMode ? "Привет! Чем сейчас занимаешься? Могу чем-то помочь?" : ""
  );
  const [isListening, setIsListening] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isConnected, setIsConnected] = useState(true);
  const [currentTool, setCurrentTool] = useState<string | null>(null);
  const [responseScroll, setResponseScroll] = useState(18);
  const [inputScroll, setInputScroll] = useState(12);
  const [checkInDone, setCheckInDone] = useState(false);
  const responseRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);

  const statusText = useMemo(() => {
    if (!isConnected) return "offline";
    if (isListening) return "listening";
    if (isStreaming) return "typing...";
    return "working..";
  }, [isConnected, isListening, isStreaming]);

  const handleSend = useCallback(() => {
    const trimmed = inputValue.trim();
    if (!trimmed || isStreaming) return;

    const controller = new AbortController();
    abortRef.current = controller;

    setResponseText("");
    setIsStreaming(true);
    setInputValue("");

    if (isCheckInMode) {
      const history = loadHistory();
      const prompt = buildCheckInPrompt(trimmed, history);
      saveEntry({ timestamp: Date.now(), userMessage: trimmed });

      streamChat(
        prompt,
        (chunk) => setResponseText((prev) => prev + chunk),
        () => {
          setIsStreaming(false);
          setCurrentTool(null);
          setCheckInDone(true);
          abortRef.current = null;
        },
        (err) => {
          setResponseText(err);
          setIsStreaming(false);
          setCurrentTool(null);
          abortRef.current = null;
        },
        controller.signal,
      );
      return;
    }

    routeIntent(
      trimmed,
      (chunk) => setResponseText((prev) => prev + chunk),
      () => {
        setIsStreaming(false);
        setCurrentTool(null);
        abortRef.current = null;
      },
      (err) => {
        setResponseText(err);
        setIsStreaming(false);
        setCurrentTool(null);
        setIsConnected(false);
        abortRef.current = null;
      },
      controller.signal,
      (tool) => setCurrentTool(tool),
    );
  }, [inputValue, isStreaming]);

  const handleAbort = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsStreaming(false);
  }, []);

  const handleConnect = useCallback(async () => {
    const ok = await checkConnection();
    setIsConnected(ok);
  }, []);

  const startMic = useCallback(() => {
    if (isListening) return;

    type AnyWindow = Window & {
      webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
      SpeechRecognition?: new () => SpeechRecognitionInstance;
    };
    type SpeechRecognitionInstance = {
      lang: string;
      interimResults: boolean;
      continuous: boolean;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      onresult: ((event: any) => void) | null;
      onend: (() => void) | null;
      onerror: (() => void) | null;
      start: () => void;
      stop: () => void;
    };

    const w = window as AnyWindow;
    const SR = w.webkitSpeechRecognition ?? w.SpeechRecognition;
    if (!SR) return;

    const recognition = new SR();
    recognition.lang = "ru-RU";
    recognition.interimResults = false;
    recognition.continuous = true;
    recognitionRef.current = recognition;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      const transcript = (event.results[event.results.length - 1]?.[0]?.transcript as string) ?? "";
      setInputValue((prev) => (prev ? prev + " " + transcript : transcript));
    };

    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => setIsListening(false);

    recognition.start();
    setIsListening(true);
  }, [isListening]);

  const stopMic = useCallback(() => {
    recognitionRef.current?.stop();
    setIsListening(false);
  }, []);

  useEffect(() => {
    const element = responseRef.current;
    if (!element) return;
    const maxScroll = Math.max(element.scrollHeight - element.clientHeight, 0);
    element.scrollTop = (responseScroll / 100) * maxScroll;
  }, [responseScroll, responseText]);

  useEffect(() => {
    const element = inputRef.current;
    if (!element) return;
    const maxScroll = Math.max(element.scrollHeight - element.clientHeight, 0);
    element.scrollTop = (inputScroll / 100) * maxScroll;
  }, [inputScroll, inputValue]);

  // Scroll response to bottom when streaming
  useEffect(() => {
    const element = responseRef.current;
    if (!element || !isStreaming) return;
    element.scrollTop = element.scrollHeight;
  }, [responseText, isStreaming]);

  const handleClose = useCallback(() => {
    window.close();
  }, []);

  const handleClearResponse = useCallback(() => {
    setResponseText("");
  }, []);

  // Check connection on mount
  useEffect(() => {
    handleConnect();
  }, [handleConnect]);

  return (
    <div className="relative h-[245px] w-[340px] overflow-visible bg-transparent">
      <div className="absolute left-0 top-0 h-[348px] w-[498px] scale-[0.68] origin-top-left">
        <div className="relative h-full w-full overflow-visible rounded-[46px] bg-[#5e5e5e88] shadow-[0_24px_64px_rgba(0,0,0,0.35)] backdrop-blur-[34px] backdrop-brightness-[100%] [-webkit-backdrop-filter:blur(34px)_brightness(100%)] before:pointer-events-none before:absolute before:inset-0 before:z-[1] before:rounded-[46px] before:p-[1.4px] before:content-[''] before:[background:linear-gradient(168deg,rgba(255,255,255,0.4)_0%,rgba(255,255,255,0)_41%,rgba(255,255,255,0)_57%,rgba(255,255,255,0.1)_100%)] before:[-webkit-mask:linear-gradient(#fff_0_0)_content-box,linear-gradient(#fff_0_0)] before:[-webkit-mask-composite:xor] before:[mask-composite:exclude]">
          <div className="drag-region absolute left-[24px] top-[10px] z-20 h-[60px] w-[408px] rounded-[20px]" />

          {/* Close button */}
          <button
            aria-label="Закрыть"
            className="no-drag absolute right-[12px] top-[12px] z-30 flex h-[28px] w-[28px] items-center justify-center rounded-full text-white/30 transition hover:bg-[rgba(255,66,69,0.7)] hover:text-white/90 active:scale-90"
            onClick={handleClose}
            type="button"
          >
            <svg viewBox="0 0 14 14" fill="none" className="w-[14px] h-[14px]">
              <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>

          <div className="absolute left-[37px] top-[21px]">
            <div className="font-headline text-[length:var(--headline-font-size)] font-[number:var(--headline-font-weight)] leading-[var(--headline-line-height)] text-labelsprimary">
              Eidon
            </div>
            <div className="font-callout text-[length:var(--callout-font-size)] font-[number:var(--callout-font-weight)] leading-[var(--callout-line-height)] text-labelssecondary truncate max-w-[260px]">
              {currentTool ? (
                <span className="text-[#a8d8a8]">{currentTool}</span>
              ) : (
                "Ollama Qwen 3.5:cloud"
              )}
            </div>
          </div>

          <button
            aria-label={isConnected ? "Отключить" : "Подключить"}
            className="no-drag absolute right-[38px] top-[21px] h-[21px] w-[21px] rounded-full transition hover:scale-105"
            onClick={handleConnect}
            type="button"
          >
            <span
              className={`block h-full w-full rounded-full ${
                isConnected ? "bg-[#087323]" : "bg-[#8a2020]"
              }`}
            />
          </button>

          <div className="absolute left-[368px] top-[38px] text-right font-callout text-[length:var(--callout-font-size)] font-[number:var(--callout-font-weight)] leading-[var(--callout-line-height)] text-white">
            <div>{statusText}</div>
          </div>

          <div className="absolute left-0 top-[90px] h-[88px] w-[498px] rounded-[22px] bg-[#64718d]/90 px-[32px] py-[9px]">
            {/* Clear response button */}
            {responseText && !isStreaming && (
              <button
                aria-label="Очистить ответ"
                className="no-drag absolute right-[20px] top-[8px] z-10 flex h-[22px] w-[22px] items-center justify-center rounded-full text-white/25 transition hover:bg-white/10 hover:text-white/60"
                onClick={handleClearResponse}
                type="button"
              >
                <svg viewBox="0 0 12 12" fill="none" className="w-[10px] h-[10px]">
                  <path d="M1.5 1.5l9 9M10.5 1.5l-9 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                </svg>
              </button>
            )}
            <div
              className="h-full overflow-y-auto rounded-[14px] pr-6 text-2xl font-medium leading-5 text-[#d9d0ff] scrollbar-none"
              ref={responseRef}
            >
              <div className="min-h-full">
                {responseText ? (
                  <>
                    {responseText}
                    {isStreaming && <BlinkingCursor />}
                  </>
                ) : (
                  <span className="text-white/35">
                    Здесь будет ответ ИИ...
                  </span>
                )}
              </div>
            </div>
            <Slider
              label="Прокрутка ответа"
              onChange={setResponseScroll}
              value={responseScroll}
            />
          </div>

          <div className="absolute left-0 top-[204px] h-[73px] w-[498px] rounded-[22px] bg-[#747983]/90 px-[32px] py-[5px] z-10">
            <div className="relative h-full">
              <textarea
                className="no-drag h-full w-[434px] resize-none overflow-y-auto bg-transparent text-2xl font-medium leading-5 text-[#e7d5f8] placeholder:text-[#d97b88] scrollbar-none"
                onChange={(event) => setInputValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Напишите запрос или произнесите вслух"
                ref={inputRef}
                value={inputValue}
              />
            </div>
            <Slider
              label="Прокрутка ввода"
              onChange={setInputScroll}
              value={inputScroll}
            />
          </div>

          <div className="absolute left-[22px] right-[22px] top-[286px] flex items-center justify-between">
            {isCheckInMode && checkInDone ? (
              <button
                className={`${baseButtonClassName} w-full bg-[linear-gradient(0deg,rgba(94,94,94,0.18)_0%,rgba(94,94,94,0.18)_100%),linear-gradient(0deg,rgba(255,255,255,0.07)_0%,rgba(255,255,255,0.07)_100%)] text-2xl font-medium`}
                onClick={handleClose}
                type="button"
              >
                Закрыть
              </button>
            ) : (
              <>
                <button
                  className={`${baseButtonClassName} bg-[linear-gradient(0deg,rgba(94,94,94,0.18)_0%,rgba(94,94,94,0.18)_100%),linear-gradient(0deg,rgba(255,255,255,0.07)_0%,rgba(255,255,255,0.07)_100%)]`}
                  onClick={handleConnect}
                  type="button"
                >
                  <div className="flex items-center gap-3 text-2xl">
                    <span>⌘</span>
                    <span
                      className={`h-5 w-5 rounded-full ${
                        isConnected ? "bg-[#05ae2f]" : "bg-white/20"
                      }`}
                    />
                  </div>
                </button>

                <button
                  className={`${baseButtonClassName} relative bg-[linear-gradient(0deg,rgba(94,94,94,0.18)_0%,rgba(94,94,94,0.18)_100%),linear-gradient(0deg,rgba(255,255,255,0.07)_0%,rgba(255,255,255,0.07)_100%)] select-none`}
                  onMouseDown={startMic}
                  onMouseUp={stopMic}
                  onMouseLeave={stopMic}
                  onTouchStart={startMic}
                  onTouchEnd={stopMic}
                  type="button"
                >
                  {isListening && (
                    <span className="absolute inset-0 rounded-[100px] animate-ping bg-[#5df28a]/20" />
                  )}
                  <span className={isListening ? "text-[#5df28a]" : ""}>
                    <MicIcon />
                  </span>
                </button>

                <button
                  className={`${baseButtonClassName} bg-[linear-gradient(0deg,rgba(94,94,94,0.18)_0%,rgba(94,94,94,0.18)_100%),linear-gradient(0deg,rgba(255,255,255,0.07)_0%,rgba(255,255,255,0.07)_100%)]`}
                  onClick={handleAbort}
                  type="button"
                >
                  <div className={`flex gap-[7px] ${isStreaming ? "opacity-100" : "opacity-30"}`}>
                    <div className="h-8 w-[14px] rounded-full bg-white/95" />
                    <div className="h-8 w-[14px] rounded-full bg-white/95" />
                  </div>
                </button>

                <button
                  className={`${baseButtonClassName} bg-colorsred`}
                  onClick={isStreaming ? handleAbort : handleSend}
                  type="button"
                >
                  <span className="text-[44px] leading-none">
                    {isStreaming ? "■" : "×"}
                  </span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
