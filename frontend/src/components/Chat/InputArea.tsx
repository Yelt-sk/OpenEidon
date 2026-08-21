import { useState, useRef, useCallback, useEffect } from 'react';
import { Send, Square, VolumeX } from 'lucide-react';
import { useAppStore, generateId } from '../../lib/store';
import { streamChat } from '../../lib/sse';
import {
  ensureDesktopChatAgent,
  fetchChatCompletion,
  fetchSavings,
  generateProjectFromPrompt,
  getBase,
  buildSiteTarget,
  extractSitesSearchQuery,
  isTauri,
  isOpenAppIntent,
  isOpenSiteIntent,
  isOpenMultipleSitesIntent,
  isProjectCreateIntent,
  isResearchThenVideoIntent,
  isDirectPlaybackIntent,
  isContextualPlaybackIntent,
  extractBoldEntities,
  isWorkAppsIntent,
  buildAgentPlan,
  fetchInstalledApps,
  fetchRunningProcesses,
  openLocalAppDirect,
  setReminder,
  fetchReminders,
  getUserPreferences,
  setUserPreferences,
  openLocalApp,
  openExternalTarget,
  openSearchSites,
  playYouTubeQuery,
  researchThenOpenYouTube,
  routeDesktopIntentFinal,
  sendAgentMessage,
  webSearch,
  isWebSearchIntent,
  readFile,
  writeFile,
  listFiles,
  findAndOpenFile,
  getFileRoots,
} from '../../lib/api';
import type { AgentAction } from '../../lib/api';
import { MicButton } from './MicButton';
import { useSpeech } from '../../hooks/useSpeech';
import type { ChatMessage, ToolCallInfo, TokenUsage, MessageTelemetry } from '../../types';

export function InputArea({ mode = 'chat' }: { mode?: 'chat' | 'cmd' | 'voice' | 'agent' }) {
  const [input, setInput] = useState('');
  const [speechSpeaking, setSpeechSpeaking] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pttPressedRef = useRef(false);

  const activeId = useAppStore((s) => s.activeId);
  const selectedModel = useAppStore((s) => s.selectedModel);
  const streamState = useAppStore((s) => s.streamState);
  const speechEnabled = useAppStore((s) => s.settings.speechEnabled);
  const speechAutoSend = useAppStore((s) => s.settings.speechAutoSend);
  const pushToTalkEnabled = useAppStore((s) => s.settings.pushToTalkEnabled);
  const maxTokens = useAppStore((s) => s.settings.maxTokens);
  const temperature = useAppStore((s) => s.settings.temperature);
  const createConversation = useAppStore((s) => s.createConversation);
  const addMessage = useAppStore((s) => s.addMessage);
  const updateLastAssistant = useAppStore((s) => s.updateLastAssistant);
  const setStreamState = useAppStore((s) => s.setStreamState);
  const resetStream = useAppStore((s) => s.resetStream);
  const modelLoading = useAppStore((s) => s.modelLoading);

  const { state: speechState, available: speechAvailable, startRecording, stopRecording } = useSpeech();

  const prevModelRef = useRef(selectedModel);
  useEffect(() => {
    if (prevModelRef.current !== selectedModel && streamState.isStreaming) {
      abortRef.current?.abort();
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      resetStream();
      abortRef.current = null;
    }
    prevModelRef.current = selectedModel;
  }, [selectedModel, streamState.isStreaming, resetStream]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [input]);

  const micDisabled = !speechEnabled || !speechAvailable || streamState.isStreaming;
  const micReason: 'not-enabled' | 'no-backend' | 'streaming' | undefined =
    !speechEnabled ? 'not-enabled'
    : !speechAvailable ? 'no-backend'
    : streamState.isStreaming ? 'streaming'
    : undefined;

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    resetStream();
  }, [resetStream]);

  const stopSpeechOutput = useCallback(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    setSpeechSpeaking(false);
  }, []);

  const submitText = useCallback(async (rawText: string) => {
    const content = rawText.trim();
    if (!content || streamState.isStreaming) return;

    let convId = activeId;
    if (!convId) {
      convId = createConversation(selectedModel);
    }

    const userMsg: ChatMessage = {
      id: generateId(),
      role: 'user',
      content,
      timestamp: Date.now(),
    };
    addMessage(convId, userMsg);

    const currentMessages = useAppStore.getState().messages;
    const apiMessages = currentMessages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const assistantMsg: ChatMessage = {
      id: generateId(),
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
    };
    addMessage(convId, assistantMsg);

    const startTime = Date.now();
    const timer = setInterval(() => {
      setStreamState({ elapsedMs: Date.now() - startTime });
    }, 100);
    timerRef.current = timer;

    const controller = new AbortController();
    abortRef.current = controller;

    let accumulatedContent = '';
    let usage: TokenUsage | undefined;
    let complexity: { score: number; tier: string; suggested_max_tokens: number } | undefined;
    const toolCalls: ToolCallInfo[] = [];
    let lastFlush = 0;
    let ttftMs: number | undefined;
    let desktopOnlyIntent = false;
    let optimisticDesktopReply = '';

    const appendActivity = (entry: string) => {
      const value = entry.trim();
      if (!value) return;
      const current = useAppStore.getState().streamState.activityLog || [];
      const next = current[current.length - 1] === value ? current : [...current, value].slice(-8);
      setStreamState({ activityLog: next });
    };

    setStreamState({
      isStreaming: true,
      phase: 'Generating...',
      elapsedMs: 0,
      activeToolCalls: [],
      content: '',
      activityLog: [],
    });
    useAppStore.getState().addLogEntry({
      timestamp: Date.now(),
      level: 'info',
      category: 'chat',
      message: `Request: "${content.slice(0, 80)}${content.length > 80 ? '...' : ''}" -> ${selectedModel}`,
    });

    try {
      // ----- Open all saved work apps -----
      try {
        if (!accumulatedContent && isWorkAppsIntent(content)) {
          setStreamState({ phase: 'Opening work apps...' });
          appendActivity('Opening work applications');
          const prefs = await getUserPreferences();
          if (prefs.work_apps.length === 0) {
            accumulatedContent = 'Список рабочих программ пуст. Скажи: "запомни, что для работы я использую figma, vs code, claude"';
          } else {
            for (const app of prefs.work_apps) {
              try { await openLocalApp(app); } catch {}
            }
            accumulatedContent = `Открываю рабочие программы: ${prefs.work_apps.join(', ')}`;
            toolCalls.push({ id: generateId(), tool: 'open_local_app', arguments: content, status: 'success', result: prefs.work_apps.join(', ') });
          }
          setStreamState({ activeToolCalls: [...toolCalls], phase: 'Done' });
          updateLastAssistant(convId, accumulatedContent, [...toolCalls]);
        }
      } catch (workAppsErr: any) {
        useAppStore.getState().addLogEntry({
          timestamp: Date.now(), level: 'warn', category: 'chat',
          message: `Work apps path failed: ${workAppsErr?.message || String(workAppsErr)}`,
        });
      }

      try {
        if (!accumulatedContent && isOpenAppIntent(content)) {
          setStreamState({ phase: 'Opening application...' });
          appendActivity('Opening local application');
          const opened = await openLocalApp(content);
          accumulatedContent = `Открыл приложение: ${opened.opened}`;
          toolCalls.push({
            id: generateId(),
            tool: 'open_local_app',
            arguments: content,
            status: 'success',
            result: opened.opened,
          });
          setStreamState({ activeToolCalls: [...toolCalls], phase: 'Done' });
          updateLastAssistant(convId, accumulatedContent, [...toolCalls]);
        }
      } catch (openAppErr: any) {
        useAppStore.getState().addLogEntry({
          timestamp: Date.now(),
          level: 'warn',
          category: 'chat',
          message: `Open app path failed, falling back to desktop agent: ${openAppErr?.message || String(openAppErr)}`,
        });
      }

      try {
        if (!accumulatedContent && isOpenMultipleSitesIntent(content)) {
          setStreamState({ phase: 'Opening sites...' });
          appendActivity('Opening multiple sites in browser');
          const query = extractSitesSearchQuery(content);
          const opened = await openSearchSites(query, 3);
          const openedTargets = opened.opened;
          accumulatedContent = `Открыл сайты:\n${openedTargets.join('\n')}`;
          toolCalls.push({
            id: generateId(),
            tool: 'open_external',
            arguments: content,
            status: 'success',
            result: openedTargets.join(', '),
          });
          setStreamState({ activeToolCalls: [...toolCalls], phase: 'Done' });
          updateLastAssistant(convId, accumulatedContent, [...toolCalls]);
        }
      } catch (openSitesErr: any) {
        useAppStore.getState().addLogEntry({
          timestamp: Date.now(),
          level: 'warn',
          category: 'chat',
          message: `Open multiple sites path failed, falling back to desktop agent: ${openSitesErr?.message || String(openSitesErr)}`,
        });
      }

      try {
        if (!accumulatedContent && isOpenSiteIntent(content)) {
          setStreamState({ phase: 'Opening site...' });
          appendActivity('Opening site in browser');
          const target = buildSiteTarget(content);
          const opened = await openExternalTarget(target);
          accumulatedContent = `Открыл сайт: ${opened.opened}`;
          toolCalls.push({
            id: generateId(),
            tool: 'open_external',
            arguments: content,
            status: 'success',
          });
          setStreamState({ activeToolCalls: [...toolCalls], phase: 'Done' });
          updateLastAssistant(convId, accumulatedContent, [...toolCalls]);
        }
      } catch (openSiteErr: any) {
        useAppStore.getState().addLogEntry({
          timestamp: Date.now(),
          level: 'warn',
          category: 'chat',
          message: `Open site path failed, falling back to desktop agent: ${openSiteErr?.message || String(openSiteErr)}`,
        });
      }

      // ----- Contextual playback: "включи какую-нибудь из них" -----
      try {
        if (!accumulatedContent && isContextualPlaybackIntent(content)) {
          const lastAssistantContent = [...apiMessages].reverse().find((m) => m.role === 'assistant')?.content || '';
          const entities = extractBoldEntities(lastAssistantContent);
          if (entities.length > 0) {
            const pick = entities[Math.floor(Math.random() * entities.length)];
            setStreamState({ phase: 'Opening YouTube playback...' });
            appendActivity(`Playing: ${pick}`);
            const result = await playYouTubeQuery(pick);
            accumulatedContent = `Включаю **${pick}** на YouTube`;
            toolCalls.push({
              id: generateId(),
              tool: 'play_youtube_query',
              arguments: pick,
              status: 'success',
              result: result.message,
            });
            setStreamState({ activeToolCalls: [...toolCalls], phase: 'Done' });
            updateLastAssistant(convId, accumulatedContent, [...toolCalls]);
          }
        }
      } catch (ctxPlayErr: any) {
        useAppStore.getState().addLogEntry({
          timestamp: Date.now(), level: 'warn', category: 'chat',
          message: `Contextual playback failed: ${ctxPlayErr?.message || String(ctxPlayErr)}`,
        });
      }

      // ----- Web search fast-path -----
      try {
        if (!accumulatedContent && isWebSearchIntent(content)) {
          setStreamState({ phase: 'Searching the web...' });
          appendActivity('Searching the internet');
          const searchResult = await webSearch(content);
          if (searchResult.success && searchResult.content) {
            appendActivity('Synthesizing results');
            setStreamState({ phase: 'Summarizing results...' });
            const synthesis = await fetchChatCompletion({
              model: selectedModel,
              messages: [
                {
                  role: 'system',
                  content: 'You are Eidon. Summarize the web search results into a clear, concise answer in Russian. Include key facts. Do not say you cannot access the internet.',
                },
                {
                  role: 'user',
                  content: `User asked: ${content}\n\nSearch results:\n${searchResult.content}`,
                },
              ],
              temperature: 0.3,
              max_tokens: 1000,
            });
            accumulatedContent =
              synthesis?.choices?.[0]?.message?.content?.trim() ||
              searchResult.content;
          }
          toolCalls.push({ id: generateId(), tool: 'web_search', arguments: content, status: searchResult.success ? 'success' : 'error' });
          setStreamState({ activeToolCalls: [...toolCalls], phase: 'Done' });
          updateLastAssistant(convId, accumulatedContent, [...toolCalls]);
        }
      } catch (webSearchErr: any) {
        useAppStore.getState().addLogEntry({
          timestamp: Date.now(), level: 'warn', category: 'chat',
          message: `Web search fast-path failed: ${webSearchErr?.message || String(webSearchErr)}`,
        });
      }

      try {
        if (!accumulatedContent && isResearchThenVideoIntent(content)) {
          setStreamState({ phase: 'Researching and opening YouTube...' });
          appendActivity('Researching topic on the web');
          appendActivity('Opening YouTube video');
          const researched = await researchThenOpenYouTube(content);
          accumulatedContent = `${researched.answer}\n\nОткрыл видео по запросу: ${researched.youtube_query}`;
          toolCalls.push({
            id: generateId(),
            tool: 'research_then_open_youtube',
            arguments: content,
            status: 'success',
            result: researched.opened,
          });
        } else if (isDirectPlaybackIntent(content)) {
          setStreamState({ phase: 'Opening YouTube playback...' });
          // For generic "включи музыку" / "play music" — inject saved genre preference
          let playQuery = content;
          if (/^(включи|play|поставь)\s+(музыку?|music)$/i.test(content.trim()) ||
              /мою любимую|любимую музыку|мою музыку/i.test(content)) {
            try {
              const prefs = await getUserPreferences();
              if (prefs.music.artists.length > 0) {
                playQuery = prefs.music.artists[0];
              } else if (prefs.music.genres.length > 0) {
                playQuery = `${prefs.music.genres[0]} music`;
              }
            } catch {}
          }
          const directPlayback = await playYouTubeQuery(playQuery);
          accumulatedContent = directPlayback.message || 'Playback started in the browser.';
          toolCalls.push({
            id: generateId(),
            tool: 'play_youtube_query',
            arguments: content,
            status: 'success',
          });
        }
      } catch (directPlaybackErr: any) {
        useAppStore.getState().addLogEntry({
          timestamp: Date.now(),
          level: 'warn',
          category: 'chat',
          message: `Direct playback path failed, falling back to desktop agent: ${directPlaybackErr?.message || String(directPlaybackErr)}`,
        });
        accumulatedContent = `Не удалось включить видео: ${directPlaybackErr?.message || String(directPlaybackErr)}`;
        toolCalls.push({
          id: generateId(),
          tool: 'play_youtube_query',
          arguments: content,
          status: 'error',
          result: accumulatedContent,
        });
        setStreamState({ activeToolCalls: [...toolCalls], phase: 'Playback failed' });
        updateLastAssistant(convId, accumulatedContent, [...toolCalls]);
      }

      try {
        if (!accumulatedContent && isProjectCreateIntent(content)) {
          setStreamState({ phase: 'Creating project...' });
          appendActivity('Creating project files');
          const project = await generateProjectFromPrompt(content, selectedModel);
          accumulatedContent =
            `Готово. Проект "${project.project_name}" создан.\n` +
            `Файлы: ${project.files.join(', ')}\n` +
            `Открыт: ${project.opened_path}`;
          toolCalls.push({
            id: generateId(),
            tool: 'project_generator',
            arguments: '',
            status: 'success',
            result: `Created ${project.files.length} files`,
          });
          setStreamState({ activeToolCalls: [...toolCalls], phase: 'Done' });
          updateLastAssistant(convId, accumulatedContent, [...toolCalls]);
        }
      } catch (projectErr: any) {
        useAppStore.getState().addLogEntry({
          timestamp: Date.now(),
          level: 'warn',
          category: 'chat',
          message: `Direct project path failed, falling back to desktop agent: ${projectErr?.message || String(projectErr)}`,
        });
      }

      // ----- List installed apps fast-path -----
      try {
        if (!accumulatedContent && /скачан|установлен|приложени|программ|apps?\s*(на|у меня|на пк|на компьютер)/i.test(content) && /какие|список|покажи|что|что есть|что у меня|что стоит/i.test(content)) {
          setStreamState({ phase: 'Fetching installed apps...' });
          appendActivity('Scanning installed applications');
          const apps = await fetchInstalledApps();
          accumulatedContent = `Установленные приложения на твоём ПК (${apps.length}):\n\n${apps.join('\n')}`;
          toolCalls.push({ id: generateId(), tool: 'list_installed_apps', arguments: content, status: 'success', result: String(apps.length) });
          setStreamState({ activeToolCalls: [...toolCalls], phase: 'Done' });
          updateLastAssistant(convId, accumulatedContent, [...toolCalls]);
        }
      } catch (listAppsErr: any) {
        useAppStore.getState().addLogEntry({ timestamp: Date.now(), level: 'warn', category: 'chat', message: `List apps fast-path failed: ${listAppsErr?.message}` });
      }

      // ----- LLM tool router (runs for any request that fast-paths didn't handle) -----
      try {
        if (!accumulatedContent) {
          setStreamState({ phase: 'Planning actions...' });
          appendActivity('Building action plan');
          const [prefs, installedApps, fileRootsData] = await Promise.all([getUserPreferences(), fetchInstalledApps(), getFileRoots()]);
          const plan = await buildAgentPlan(content, prefs, selectedModel, installedApps, fileRootsData.roots);
          if (plan && plan.steps.length > 0) {
            accumulatedContent = plan.summary || 'Выполняю...';
            updateLastAssistant(convId, accumulatedContent, [...toolCalls]);

            const executeAction = async (action: AgentAction) => {
              const tc: ToolCallInfo = {
                id: generateId(),
                tool: action.tool,
                arguments: JSON.stringify(action),
                status: 'running',
              };
              toolCalls.push(tc);
              setStreamState({ activeToolCalls: [...toolCalls] });
              try {
                switch (action.tool) {
                  case 'open_app':
                    if (action.name) {
                      try {
                        await openLocalAppDirect(action.name);
                      } catch {
                        await openLocalApp(action.name);
                      }
                      appendActivity(`Открыл: ${action.name}`);
                    }
                    break;
                  case 'play_youtube':
                    if (action.query) {
                      await playYouTubeQuery(action.query);
                      appendActivity(`Воспроизвожу: ${action.query}`);
                    }
                    break;
                  case 'open_site':
                    if (action.url) {
                      await openExternalTarget(action.url);
                      appendActivity(`Открыл сайт: ${action.url}`);
                    }
                    break;
                  case 'open_work_apps':
                    if (prefs.work_apps.length > 0) {
                      for (const app of prefs.work_apps) {
                        try { await openLocalApp(app); } catch {}
                      }
                      appendActivity(`Открыл рабочие программы: ${prefs.work_apps.join(', ')}`);
                    } else {
                      appendActivity('Рабочие программы не сохранены');
                    }
                    break;
                  case 'show_message':
                    if (action.text) appendActivity(action.text);
                    break;
                  case 'list_installed_apps': {
                    const apps = await fetchInstalledApps();
                    accumulatedContent = `Установленные приложения на твоём ПК (${apps.length}):\n\n${apps.join('\n')}`;
                    break;
                  }
                  case 'list_running_processes': {
                    const procs = await fetchRunningProcesses();
                    accumulatedContent = `Запущенные процессы (${procs.length}):\n\n${procs.join('\n')}`;
                    break;
                  }
                  case 'set_reminder': {
                    const result = await setReminder(action.text || '', action.delay_seconds, action.due_at);
                    const r = result.reminder;
                    const mins = action.delay_seconds ? Math.round(action.delay_seconds / 60) : null;
                    const timeStr = mins !== null
                      ? (mins >= 60 ? `${Math.floor(mins / 60)} ч ${mins % 60} мин`.replace(' 0 мин', '') : `${mins} мин`)
                      : r.due_at ? new Date(r.due_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '';
                    accumulatedContent = `Напоминание установлено${timeStr ? ` через ${timeStr}` : ''}: **${r.text}**`;
                    break;
                  }
                  case 'list_reminders': {
                    const reminders = await fetchReminders();
                    if (reminders.length === 0) {
                      accumulatedContent = 'Активных напоминаний нет.';
                    } else {
                      accumulatedContent = `Активные напоминания (${reminders.length}):\n\n` +
                        reminders.map(r => `• **${r.text}** — ${new Date(r.due_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`).join('\n');
                    }
                    break;
                  }
                  case 'web_search': {
                    appendActivity(`Searching: ${action.query || content}`);
                    const searchResult = await webSearch(action.query || content);
                    if (searchResult.success && searchResult.content) {
                      const synthesis = await fetchChatCompletion({
                        model: selectedModel,
                        messages: [
                          {
                            role: 'system',
                            content: 'You are Eidon. Summarize the web search results into a clear, concise answer in Russian. Include key facts.',
                          },
                          {
                            role: 'user',
                            content: `User asked: ${content}\n\nSearch results:\n${searchResult.content}`,
                          },
                        ],
                        temperature: 0.3,
                        max_tokens: 1000,
                      });
                      accumulatedContent = synthesis?.choices?.[0]?.message?.content?.trim() || searchResult.content;
                    }
                    break;
                  }
                  case 'save_preference': {
                    const cat = action.category || 'note';
                    const val = action.value || '';
                    const currentPrefs = await getUserPreferences();
                    if (cat === 'music_artist') {
                      await setUserPreferences('music', { genres: currentPrefs.music.genres, artists: [...new Set([...currentPrefs.music.artists, val])] });
                      accumulatedContent = `Запомнил: исполнитель **${val}**`;
                    } else if (cat === 'music_genre') {
                      await setUserPreferences('music', { genres: [...new Set([...currentPrefs.music.genres, val])], artists: currentPrefs.music.artists });
                      accumulatedContent = `Запомнил: жанр **${val}**`;
                    } else if (cat === 'work_app') {
                      await setUserPreferences('work_apps', { apps: [...new Set([...currentPrefs.work_apps, val])] });
                      accumulatedContent = `Запомнил: рабочая программа **${val}**`;
                    } else {
                      await setUserPreferences('custom', { ...currentPrefs.custom, [Date.now().toString()]: val });
                      accumulatedContent = `Запомнил: ${val}`;
                    }
                    appendActivity(`Saved: ${cat} = ${val}`);
                    break;
                  }
                  case 'read_file': {
                    if (!action.path) break;
                    appendActivity(`Reading: ${action.path}`);
                    const fileResult = await readFile(action.path);
                    const truncNote = fileResult.truncated ? `\n\n*(показаны первые ${fileResult.total_chars > 8000 ? '8000' : fileResult.total_chars} символов из ${fileResult.total_chars})*` : '';
                    accumulatedContent = `**${action.path}**\n\n\`\`\`\n${fileResult.content}\n\`\`\`${truncNote}`;
                    break;
                  }
                  case 'write_file': {
                    if (!action.path) break;
                    appendActivity(`Writing: ${action.path}`);
                    await writeFile(action.path, action.file_content || '');
                    accumulatedContent = `Файл сохранён: **${action.path}**`;
                    break;
                  }
                  case 'list_files': {
                    const dir = action.path || 'D:\\projects\\eidon';
                    appendActivity(`Listing: ${dir}`);
                    const listResult = await listFiles(dir);
                    const lines = listResult.entries.map(e =>
                      `${e.type === 'dir' ? '📁' : '📄'} ${e.name}${e.size !== null ? ` (${(e.size / 1024).toFixed(1)} KB)` : ''}`
                    );
                    accumulatedContent = `**${listResult.path}** (${listResult.entries.length} элементов):\n\n${lines.join('\n')}`;
                    break;
                  }
                  case 'find_and_open_file': {
                    const query = action.query || action.name || content;
                    appendActivity(`Searching: ${query}`);
                    const result = await findAndOpenFile(query);
                    accumulatedContent = result.message;
                    break;
                  }
                }
                tc.status = 'success';
              } catch (e: any) {
                tc.status = 'error';
                tc.result = e?.message || String(e);
              }
              setStreamState({ activeToolCalls: [...toolCalls] });
            };

            for (const step of plan.steps) {
              if (step.mode === 'parallel') {
                // open_app calls are always sequential — each one invokes LLM on backend
                const appActions = step.actions.filter(a => a.tool === 'open_app');
                const otherActions = step.actions.filter(a => a.tool !== 'open_app');
                await Promise.all([
                  (async () => { for (const a of appActions) await executeAction(a); })(),
                  ...otherActions.map(executeAction),
                ]);
              } else {
                for (const action of step.actions) {
                  await executeAction(action);
                }
              }
            }

            const failedApps = toolCalls
              .filter(tc => tc.status === 'error' && tc.tool === 'open_app')
              .map(tc => { try { return JSON.parse(tc.arguments).name; } catch { return ''; } })
              .filter(Boolean);

            let finalSummary = accumulatedContent || plan.summary;
            if (failedApps.length > 0) {
              finalSummary += `\n\nНе удалось открыть: **${failedApps.join(', ')}**. Попробуй открыть отдельно: «открой ${failedApps[0]}».`;
            }
            accumulatedContent = finalSummary;
            setStreamState({ activeToolCalls: [...toolCalls], phase: 'Done' });
            updateLastAssistant(convId, finalSummary, [...toolCalls]);
          }
        }
      } catch (multiActionErr: any) {
        useAppStore.getState().addLogEntry({
          timestamp: Date.now(), level: 'warn', category: 'chat',
          message: `Multi-action plan failed, falling through: ${multiActionErr?.message || String(multiActionErr)}`,
        });
        accumulatedContent = '';
      }

      try {
        if (!accumulatedContent) {
          const desktopAgent = await ensureDesktopChatAgent(selectedModel);
          const routedContent = routeDesktopIntentFinal(content);
          desktopOnlyIntent = routedContent !== content;
          if (desktopOnlyIntent) {
            optimisticDesktopReply = 'Command sent to the desktop agent. The browser or app may open within a few seconds.';
          }
          setStreamState({ phase: 'Desktop agent working...' });
          const desktopToolCall: ToolCallInfo = {
            id: generateId(),
            tool: 'desktop_agent',
            arguments: routedContent,
            status: 'running',
          };
          toolCalls.push(desktopToolCall);
          setStreamState({ activeToolCalls: [...toolCalls] });
          appendActivity('Desktop agent started');
          const response = await sendAgentMessage(desktopAgent.id, routedContent, 'immediate', {
            onProgress: (label) => {
              setStreamState({ phase: label });
              appendActivity(label);
            },
            onContentDelta: (_delta, fullContent) => {
              accumulatedContent = fullContent;
              setStreamState({ content: accumulatedContent, phase: 'Finishing response...' });
              updateLastAssistant(
                convId,
                accumulatedContent,
                toolCalls.length > 0 ? [...toolCalls] : undefined,
              );
            },
            onDone: (fullContent) => {
              accumulatedContent = fullContent || accumulatedContent;
              appendActivity('Done');
            },
          });
          accumulatedContent = response.content || accumulatedContent;
          desktopToolCall.status = 'success';
          desktopToolCall.result = accumulatedContent;
          setStreamState({ activeToolCalls: [...toolCalls], phase: 'Done' });
          if (accumulatedContent) {
            updateLastAssistant(convId, accumulatedContent, [...toolCalls]);
          }
        }
      } catch (agentErr: any) {
        const runningDesktopTool = toolCalls.find((tc) => tc.tool === 'desktop_agent' && tc.status === 'running');
        if (runningDesktopTool) {
          runningDesktopTool.status = 'error';
          runningDesktopTool.result = agentErr?.message || String(agentErr);
          setStreamState({ activeToolCalls: [...toolCalls], phase: 'Desktop agent failed' });
          appendActivity(`Desktop agent error: ${agentErr?.message || String(agentErr)}`);
        }
        useAppStore.getState().addLogEntry({
          timestamp: Date.now(),
          level: 'warn',
          category: 'chat',
          message: `Desktop agent path failed, falling back to raw chat: ${agentErr?.message || String(agentErr)}`,
        });
        if (desktopOnlyIntent) {
          accumulatedContent = optimisticDesktopReply || 'Command sent to the desktop agent. Wait a few seconds for the browser or app to react.';
        }
      }

      try {
        if (!accumulatedContent) {
          if (isTauri()) {
            const fallback = await fetchChatCompletion({
              model: selectedModel,
              messages: apiMessages,
              temperature,
              max_tokens: maxTokens,
            });
            accumulatedContent =
              fallback?.choices?.[0]?.message?.content?.trim?.() ||
              fallback?.choices?.[0]?.message?.content ||
              '';
            if (fallback?.usage) usage = fallback.usage;
            if (fallback?.complexity) complexity = fallback.complexity;
          } else {
            for await (const sseEvent of streamChat(
              { model: selectedModel, messages: apiMessages, stream: true, temperature, max_tokens: maxTokens },
              controller.signal,
            )) {
              const eventName = sseEvent.event;

              if (eventName === 'agent_turn_start') {
                setStreamState({ phase: 'Agent thinking...' });
                appendActivity('Agent thinking');
              } else if (eventName === 'inference_start') {
                setStreamState({ phase: 'Generating...' });
                appendActivity('Generating response');
                useAppStore.getState().addLogEntry({
                  timestamp: Date.now(),
                  level: 'info',
                  category: 'chat',
                  message: `Generating with ${selectedModel}...`,
                });
              } else if (eventName === 'tool_call_start') {
                try {
                  const data = JSON.parse(sseEvent.data);
                  const tc: ToolCallInfo = {
                    id: generateId(),
                    tool: data.tool,
                    arguments: data.arguments || '',
                    status: 'running',
                  };
                  toolCalls.push(tc);
                  setStreamState({
                    phase: `Calling ${data.tool}...`,
                    activeToolCalls: [...toolCalls],
                  });
                  appendActivity(`Calling ${data.tool}`);
                  updateLastAssistant(convId, accumulatedContent, [...toolCalls]);
                  useAppStore.getState().addLogEntry({
                    timestamp: Date.now(),
                    level: 'info',
                    category: 'tool',
                    message: `Calling ${data.tool}(${data.arguments || ''})`,
                  });
                } catch {}
              } else if (eventName === 'tool_call_end') {
                try {
                  const data = JSON.parse(sseEvent.data);
                  const tc = toolCalls.find((t) => t.tool === data.tool && t.status === 'running');
                  if (tc) {
                    tc.status = data.success ? 'success' : 'error';
                    tc.latency = data.latency;
                    tc.result = data.result;
                  }
                  setStreamState({
                    phase: 'Generating...',
                    activeToolCalls: [...toolCalls],
                  });
                  appendActivity(`${data.tool} ${data.success ? 'done' : 'failed'}`);
                  updateLastAssistant(convId, accumulatedContent, [...toolCalls]);
                } catch {}
              } else {
                try {
                  const data = JSON.parse(sseEvent.data);
                  const delta = data.choices?.[0]?.delta;
                  if (data.usage) usage = data.usage;
                  if (data.complexity) complexity = data.complexity;
                  if (delta?.content) {
                    if (!ttftMs) ttftMs = Date.now() - startTime;
                    accumulatedContent += delta.content;
                    setStreamState({ content: accumulatedContent, phase: '' });

                    const now = Date.now();
                    if (now - lastFlush >= 80) {
                      updateLastAssistant(
                        convId,
                        accumulatedContent,
                        toolCalls.length > 0 ? [...toolCalls] : undefined,
                      );
                      lastFlush = now;
                    }
                  }
                  if (data.choices?.[0]?.finish_reason === 'stop') break;
                } catch {}
              }
            }
          }
        }
      } catch (err: any) {
        if (err.name === 'AbortError') {
          if (!accumulatedContent) accumulatedContent = '(Generation stopped)';
        } else {
          const errMsg = err?.message || String(err);
          accumulatedContent = accumulatedContent || `Error: ${errMsg}`;
          useAppStore.getState().addLogEntry({
            timestamp: Date.now(),
            level: 'error',
            category: 'chat',
            message: `Stream error: ${errMsg}`,
          });
        }
      }
    } finally {
      if (!accumulatedContent) {
        try {
          const fallback = await fetchChatCompletion({
            model: selectedModel,
            messages: apiMessages,
            temperature,
            max_tokens: maxTokens,
          });
          accumulatedContent =
            fallback?.choices?.[0]?.message?.content?.trim?.() ||
            fallback?.choices?.[0]?.message?.content ||
            '';
          if (fallback?.usage) usage = fallback.usage;
          if (fallback?.complexity) complexity = fallback.complexity;
          useAppStore.getState().addLogEntry({
            timestamp: Date.now(),
            level: 'warn',
            category: 'chat',
            message: 'Streaming returned no content, used non-stream fallback',
          });
        } catch (fallbackErr: any) {
          useAppStore.getState().addLogEntry({
            timestamp: Date.now(),
            level: 'error',
            category: 'chat',
            message: `Non-stream fallback error: ${fallbackErr?.message || String(fallbackErr)}`,
          });
        }
      }

      if (!accumulatedContent) {
        accumulatedContent = 'No response was generated. Please try again.';
      }

      const totalMs = Date.now() - startTime;
      const _CLOUD_PREFIXES = ['gpt-', 'o1-', 'o3-', 'o4-', 'claude-', 'gemini-', 'openrouter/', 'MiniMax-', 'chatgpt-'];
      const engineLabel = _CLOUD_PREFIXES.some((p) => selectedModel.startsWith(p)) ? 'cloud' : 'ollama';
      const telemetry: MessageTelemetry = {
        engine: engineLabel,
        model_id: selectedModel,
        total_ms: totalMs,
        ttft_ms: ttftMs,
        tokens_per_sec: usage?.completion_tokens ? usage.completion_tokens / (totalMs / 1000) : undefined,
        complexity_score: complexity?.score,
        complexity_tier: complexity?.tier,
        suggested_max_tokens: complexity?.suggested_max_tokens,
      };

      let audioMeta: { url: string } | undefined;
      try {
        const digestRes = await fetch(`${getBase()}/api/digest`);
        if (digestRes.ok) {
          const digest = await digestRes.json();
          if (digest.audio_available) {
            audioMeta = { url: `${getBase()}/api/digest/audio` };
          }
        }
      } catch {}

      updateLastAssistant(
        convId,
        accumulatedContent,
        toolCalls.length > 0 ? toolCalls : undefined,
        usage,
        telemetry,
        audioMeta,
      );

      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      resetStream();
      useAppStore.getState().addLogEntry({
        timestamp: Date.now(),
        level: 'info',
        category: 'chat',
        message: `Response: ${accumulatedContent.length} chars`,
      });
      abortRef.current = null;

      fetchSavings()
        .then((data) => useAppStore.getState().setSavings(data))
        .catch(() => {});
    }
  }, [
    mode,
    activeId,
    selectedModel,
    streamState.isStreaming,
    createConversation,
    addMessage,
    updateLastAssistant,
    setStreamState,
    resetStream,
    temperature,
    maxTokens,
  ]);

  const handleMicClick = useCallback(async () => {
    if (speechState === 'recording') {
      try {
        const text = await stopRecording();
        if (text) {
          if (speechAutoSend) {
            await submitText(text);
          } else {
            setInput((prev) => (prev ? `${prev} ${text}` : text));
          }
        }
      } catch {}
    } else {
      await startRecording();
    }
  }, [speechState, stopRecording, startRecording, speechAutoSend, submitText]);

  const sendMessage = useCallback(async () => {
    const content = input.trim();
    if (!content || streamState.isStreaming) return;
    setInput('');
    await submitText(content);
  }, [input, streamState.isStreaming, submitText]);

  useEffect(() => {
    if (!pushToTalkEnabled || !speechEnabled || !speechAvailable) return;

    const isHotkey = (event: KeyboardEvent) =>
      event.ctrlKey && event.shiftKey && event.code === 'Space';

    const onKeyDown = async (event: KeyboardEvent) => {
      if (!isHotkey(event) || pttPressedRef.current || streamState.isStreaming) return;
      event.preventDefault();
      pttPressedRef.current = true;
      if (speechState === 'idle') {
        await startRecording();
      }
    };

    const onKeyUp = async (event: KeyboardEvent) => {
      if (!isHotkey(event) || !pttPressedRef.current) return;
      event.preventDefault();
      pttPressedRef.current = false;
      if (speechState !== 'recording') return;
      try {
        const text = await stopRecording();
        if (!text) return;
        if (speechAutoSend) {
          setInput('');
          await submitText(text);
        } else {
          setInput((prev) => (prev ? `${prev} ${text}` : text));
        }
      } catch {}
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [
    pushToTalkEnabled,
    speechEnabled,
    speechAvailable,
    streamState.isStreaming,
    speechState,
    startRecording,
    stopRecording,
    speechAutoSend,
    submitText,
  ]);

  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

    const syncSpeaking = () => setSpeechSpeaking(window.speechSynthesis.speaking);
    syncSpeaking();
    const interval = window.setInterval(syncSpeaking, 200);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !window.speechSynthesis.speaking) return;
      event.preventDefault();
      stopSpeechOutput();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [stopSpeechOutput]);

  // Voice mode: auto-start recording when switching to voice
  useEffect(() => {
    if (mode === 'voice' && speechEnabled && speechAvailable && !streamState.isStreaming && speechState === 'idle') {
      startRecording().catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <>
      <textarea
        ref={textareaRef}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Ask Eidon to do something — files, mail, browser, code…"
        rows={1}
        className="ci-textarea"
        disabled={streamState.isStreaming || modelLoading}
      />
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
        {streamState.isStreaming ? (
          <button onClick={stopStreaming} className="ci-stop" title="Stop">
            <Square size={14} />
          </button>
        ) : (
          <>
            {speechSpeaking && (
              <button
                onClick={stopSpeechOutput}
                title="Stop voice"
                style={{ width: 32, height: 32, borderRadius: '50%', border: '1px solid var(--line)', background: 'transparent', color: 'var(--ink-dim)', cursor: 'pointer', display: 'grid', placeItems: 'center' }}
              >
                <VolumeX size={14} />
              </button>
            )}
            <MicButton state={speechState} onClick={handleMicClick} disabled={micDisabled} reason={micReason} />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || modelLoading}
              className="ci-send"
              title="Send"
            >
              ↵
            </button>
          </>
        )}
      </div>
    </>
  );
}
