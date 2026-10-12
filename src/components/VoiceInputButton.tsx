import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  appendWithoutOverlap,
  mergeSpeechRecognitionResults,
  transcribeAudioWithGemini,
} from '../services/ai';

export type VoiceInputStatus = 'idle' | 'listening' | 'processing' | 'error';

export interface RecordedVoicePayload {
  dataUrl: string;
  mimeType: string;
  durationSeconds: number;
  transcriptText: string;
}

export interface VoiceInputButtonProps {
  /** Current value of the controlled text field */
  value: string;
  /** Called in real-time (interim + final) with the updated text */
  onChange: (newText: string) => void;
  /** Called when final transcription is committed */
  onFinalResult?: (finalText: string) => void;
  /** Optional callback to receive the recorded audio + duration + transcript */
  onAudioRecorded?: (payload: RecordedVoicePayload) => void | Promise<void>;
  /** If true (default), appends new speech to existing text; if false, replaces text */
  append?: boolean;
  /** Visual variant: 'icon' for compact search bars, 'pill' for field headers */
  variant?: 'icon' | 'pill';
  /** Custom label when in pill mode */
  label?: string;
  /** Extra classes for wrapper */
  className?: string;
  /** Optional callback to notify parent of status/error changes */
  onStatusChange?: (status: VoiceInputStatus, errorMessage: string | null) => void;
}

export const VoiceInputButton: React.FC<VoiceInputButtonProps> = ({
  value,
  onChange,
  onFinalResult,
  onAudioRecorded,
  append = true,
  variant = 'pill',
  label = 'ورودی صوتی',
  className = '',
  onStatusChange,
}) => {
  const [status, setStatus] = useState<VoiceInputStatus>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const recognitionRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef<number>(0);

  // Text present in the field right when user started recording
  const baseTextRef = useRef<string>('');
  // Accumulated deduplicated text within the current recording session
  const sessionTextRef = useRef<string>('');
  // Keep latest value & callbacks in refs to avoid stale closures
  const latestValueRef = useRef<string>(value);
  const onChangeRef = useRef(onChange);
  const onFinalResultRef = useRef(onFinalResult);
  const onAudioRecordedRef = useRef(onAudioRecorded);
  const isStoppingRef = useRef<boolean>(false);

  useEffect(() => {
    latestValueRef.current = value;
  }, [value]);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    onFinalResultRef.current = onFinalResult;
  }, [onFinalResult]);

  useEffect(() => {
    onAudioRecordedRef.current = onAudioRecorded;
  }, [onAudioRecorded]);

  const updateStatus = useCallback(
    (nextStatus: VoiceInputStatus, nextError: string | null = null) => {
      setStatus(nextStatus);
      setErrorMsg(nextError);
      onStatusChange?.(nextStatus, nextError);
    },
    [onStatusChange]
  );

  const cleanupMediaStream = useCallback(() => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
    mediaRecorderRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      isStoppingRef.current = true;
      try {
        recognitionRef.current?.abort();
      } catch {}
      cleanupMediaStream();
    };
  }, [cleanupMediaStream]);

  /**
   * Unified Recording Flow:
   * 1. Starts MediaRecorder so real audio is ALWAYS captured when microphone is available.
   * 2. In parallel, starts Web Speech API (fa-IR) if available for live interim text.
   * 3. Keeps recording until user clicks Stop (does not prematurely abort if SpeechRecognition pauses).
   * 4. On Stop, awaits audio DataURL conversion + optional Gemini fallback transcription + onAudioRecorded callback.
   */
  const startListening = useCallback(async () => {
    baseTextRef.current = append ? (latestValueRef.current || '').trim() : '';
    sessionTextRef.current = '';
    isStoppingRef.current = false;
    audioChunksRef.current = [];
    startTimeRef.current = Date.now();

    let recorderStarted = false;

    // 1. Start MediaRecorder first so we reliably capture the audio stream
    if (
      typeof navigator !== 'undefined' &&
      navigator.mediaDevices?.getUserMedia &&
      typeof MediaRecorder !== 'undefined'
    ) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaStreamRef.current = stream;

        const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : MediaRecorder.isTypeSupported('audio/mp4')
          ? 'audio/mp4'
          : '';

        const recorder = mimeType
          ? new MediaRecorder(stream, { mimeType })
          : new MediaRecorder(stream);

        mediaRecorderRef.current = recorder;

        recorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) {
            audioChunksRef.current.push(e.data);
          }
        };

        recorder.onstop = async () => {
          const actualMime = recorder.mimeType || 'audio/webm';
          const durationSeconds = Math.max(
            1,
            Math.round((Date.now() - startTimeRef.current) / 1000)
          );
          cleanupMediaStream();

          const blob = new Blob(audioChunksRef.current, { type: actualMime });
          const fullDataUrl =
            blob.size > 100
              ? await new Promise<string>((resolve) => {
                  const reader = new FileReader();
                  reader.onloadend = () =>
                    resolve(typeof reader.result === 'string' ? reader.result : '');
                  reader.onerror = () => resolve('');
                  reader.readAsDataURL(blob);
                })
              : '';

          updateStatus('processing', null);

          let finalTranscript = sessionTextRef.current
            ? append
              ? appendWithoutOverlap(baseTextRef.current, sessionTextRef.current)
              : sessionTextRef.current
            : latestValueRef.current || '';

          let fallbackErrorNotice: string | null = null;

          // If Web Speech API did not produce any transcript, try Gemini transcription fallback
          if (!sessionTextRef.current && fullDataUrl && blob.size >= 400) {
            try {
              const commaIdx = fullDataUrl.indexOf(',');
              const base64Audio =
                commaIdx >= 0 ? fullDataUrl.slice(commaIdx + 1) : fullDataUrl;
              const geminiText = await transcribeAudioWithGemini(base64Audio, actualMime);
              if (geminiText && geminiText.trim()) {
                finalTranscript = append
                  ? appendWithoutOverlap(baseTextRef.current, geminiText.trim())
                  : geminiText.trim();
                onChangeRef.current(finalTranscript);
                onFinalResultRef.current?.(finalTranscript);
              }
            } catch (err: any) {
              if (!onAudioRecordedRef.current) {
                const code = err?.message || '';
                if (code === 'MISSING_API_KEY') {
                  fallbackErrorNotice =
                    'کلید هوش مصنوعی در تنظیمات ثبت نشده است؛ برای تبدیل صوت به متن، کلید Gemini را در تنظیمات وارد کنید.';
                } else if (code === 'OFFLINE') {
                  fallbackErrorNotice =
                    'در حالت آفلاین تبدیل خودکار صوت به متن در دسترس نیست.';
                } else {
                  fallbackErrorNotice =
                    'ارتباط با سرویس تبدیل صوت به متن برقرار نشد؛ لطفاً متن را دستی وارد کنید.';
                }
              }
            }
          } else if (sessionTextRef.current) {
            onChangeRef.current(finalTranscript);
            onFinalResultRef.current?.(finalTranscript);
          }

          if (onAudioRecordedRef.current && fullDataUrl) {
            try {
              await onAudioRecordedRef.current({
                dataUrl: fullDataUrl,
                mimeType: actualMime,
                durationSeconds,
                transcriptText: finalTranscript,
              });
            } catch (e) {
              console.error('Error saving recorded voice note:', e);
            }
          }

          if (fallbackErrorNotice) {
            updateStatus('error', fallbackErrorNotice);
          } else {
            updateStatus('idle', null);
          }
        };

        recorder.start(250);
        recorderStarted = true;
        updateStatus('listening', null);
      } catch (err: any) {
        cleanupMediaStream();
        const name = err?.name || '';
        if (
          name === 'NotAllowedError' ||
          name === 'PermissionDeniedError' ||
          name === 'SecurityError'
        ) {
          updateStatus(
            'error',
            'دسترسی به میکروفون رد شده است. لطفاً مجوز میکروفون را در تنظیمات مرورگر فعال کنید.'
          );
          return;
        }
      }
    }

    // 2. Also start Web Speech API for live Persian speech-to-text if available
    const SpeechRecognition =
      typeof window !== 'undefined'
        ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
        : null;

    if (SpeechRecognition && navigator.onLine) {
      try {
        const recog = new SpeechRecognition();
        recog.lang = 'fa-IR';
        const isAndroid =
          typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent);
        recog.continuous = !isAndroid;
        recog.interimResults = true;
        recog.maxAlternatives = 1;

        recog.onstart = () => {
          updateStatus('listening', null);
        };

        recog.onresult = (event: any) => {
          const { combinedTranscript } = mergeSpeechRecognitionResults(event.results);
          if (!combinedTranscript) return;

          sessionTextRef.current = combinedTranscript;
          const updatedFieldText = append
            ? appendWithoutOverlap(baseTextRef.current, combinedTranscript)
            : combinedTranscript;

          onChangeRef.current(updatedFieldText);
        };

        recog.onerror = (event: any) => {
          const errorCode = event?.error || '';
          // If MediaRecorder is actively recording, do not kill the recording session on speech service hiccups
          if (
            mediaRecorderRef.current &&
            mediaRecorderRef.current.state === 'recording'
          ) {
            return;
          }
          if (errorCode === 'aborted' && isStoppingRef.current) {
            updateStatus('idle', null);
            return;
          }
          if (errorCode === 'not-allowed' || errorCode === 'service-not-allowed') {
            updateStatus(
              'error',
              'دسترسی به میکروفون رد شده است. لطفاً مجوز میکروفون را در تنظیمات مرورگر فعال کنید.'
            );
          } else {
            updateStatus('idle', null);
          }
        };

        recog.onend = () => {
          // If MediaRecorder is still running and user hasn't clicked stop, keep listening
          if (
            mediaRecorderRef.current &&
            mediaRecorderRef.current.state === 'recording' &&
            !isStoppingRef.current
          ) {
            return;
          }
          if (!recorderStarted) {
            if (sessionTextRef.current) {
              const finalCombined = append
                ? appendWithoutOverlap(baseTextRef.current, sessionTextRef.current)
                : sessionTextRef.current;
              onChangeRef.current(finalCombined);
              onFinalResultRef.current?.(finalCombined);
            }
            updateStatus('idle', null);
          }
        };

        recognitionRef.current = recog;
        recog.start();
      } catch {
        if (!recorderStarted) {
          updateStatus(
            'error',
            'مرورگر شما از قابلیت ضبط و تبدیل گفتار به متن پشتیبانی نمی‌کند.'
          );
        }
      }
    } else if (!recorderStarted) {
      updateStatus(
        'error',
        'مرورگر شما از قابلیت ضبط و تبدیل گفتار به متن پشتیبانی نمی‌کند.'
      );
    }
  }, [append, cleanupMediaStream, updateStatus]);

  const stopListening = useCallback(() => {
    isStoppingRef.current = true;

    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
    }

    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== 'inactive'
    ) {
      try {
        mediaRecorderRef.current.stop();
      } catch {
        cleanupMediaStream();
        updateStatus('idle', null);
      }
    } else {
      cleanupMediaStream();
      updateStatus('idle', null);
    }
  }, [cleanupMediaStream, updateStatus]);

  const handleToggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (status === 'processing') return;

    if (status === 'listening') {
      stopListening();
    } else {
      startListening();
    }
  };

  if (variant === 'icon') {
    return (
      <div className={`inline-flex flex-col items-end ${className}`}>
        <button
          type="button"
          onClick={handleToggle}
          disabled={status === 'processing'}
          title={
            status === 'listening'
              ? 'در حال گوش دادن... (برای توقف لمس کنید)'
              : status === 'processing'
              ? 'در حال ذخیره و پردازش صوت...'
              : label
          }
          aria-label={label}
          className={`relative w-9 h-9 rounded-xl flex items-center justify-center transition-all cursor-pointer shrink-0 ${
            status === 'listening'
              ? 'bg-rose-500 text-white border border-rose-300 shadow-[0_0_18px_rgba(244,63,94,0.8)] animate-pulse scale-105'
              : status === 'processing'
              ? 'bg-amber-500/20 text-[#f1cb83] border border-[#f1cb83]/50 cursor-wait'
              : status === 'error'
              ? 'bg-rose-500/20 text-rose-400 border border-rose-500/50 hover:bg-rose-500/30'
              : 'bg-white/5 border border-[#f1cb83]/30 text-[#f1cb83] hover:bg-[#f1cb83]/15 active:scale-95'
          }`}
        >
          {status === 'listening' && (
            <span className="absolute -inset-1 rounded-xl border border-rose-400 animate-ping pointer-events-none opacity-60" />
          )}
          <span
            className={`material-symbols-outlined text-[18px] ${
              status === 'processing' ? 'animate-spin' : ''
            }`}
          >
            {status === 'listening'
              ? 'stop_circle'
              : status === 'processing'
              ? 'progress_activity'
              : status === 'error'
              ? 'mic_off'
              : 'mic'}
          </span>
        </button>
        {errorMsg && (
          <div className="mt-1.5 px-2.5 py-1 rounded-lg bg-rose-950/90 border border-rose-500/40 text-rose-300 text-[11px] font-medium flex items-center gap-1 shadow-lg max-w-xs text-right">
            <span className="material-symbols-outlined text-[14px] text-rose-400 shrink-0">error</span>
            <span>{errorMsg}</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                updateStatus('idle', null);
              }}
              className="mr-1 text-rose-300 hover:text-white"
            >
              ×
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`flex flex-col items-end gap-1 ${className}`}>
      <button
        type="button"
        onClick={handleToggle}
        disabled={status === 'processing'}
        className={`relative min-h-[40px] px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer select-none ${
          status === 'listening'
            ? 'bg-rose-500 text-white border border-rose-300 shadow-[0_0_20px_rgba(244,63,94,0.75)] animate-pulse'
            : status === 'processing'
            ? 'bg-amber-500/20 text-[#f1cb83] border border-[#f1cb83]/50 cursor-wait'
            : status === 'error'
            ? 'bg-rose-500/15 text-rose-300 border border-rose-500/40 hover:bg-rose-500/25'
            : 'bg-[#f1cb83]/15 hover:bg-[#f1cb83]/25 text-[#f1cb83] border border-[#f1cb83]/40 active:scale-95 shadow-sm'
        }`}
      >
        {status === 'listening' && (
          <span className="w-2 h-2 rounded-full bg-white animate-ping shrink-0" />
        )}
        <span
          className={`material-symbols-outlined text-[16px] ${
            status === 'processing' ? 'animate-spin' : ''
          }`}
        >
          {status === 'listening'
            ? 'stop_circle'
            : status === 'processing'
            ? 'progress_activity'
            : status === 'error'
            ? 'mic_off'
            : 'mic'}
        </span>
        <span>
          {status === 'listening'
            ? 'در حال ضبط صدا... (توقف و ذخیره)'
            : status === 'processing'
            ? 'در حال ذخیره صوت...'
            : status === 'error'
            ? 'تلاش مجدد صوتی'
            : label}
        </span>
      </button>

      {status === 'listening' && (
        <span className="text-[10px] text-emerald-400 font-semibold flex items-center gap-1 animate-pulse">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          در حال ضبط صدا و نوشتن هم‌زمان متن؛ پس از پایان روی دکمه توقف بزنید...
        </span>
      )}

      {errorMsg && (
        <div className="w-full mt-1 p-2 rounded-xl bg-rose-950/85 border border-rose-500/40 text-rose-300 text-[11px] font-medium flex items-center justify-between gap-2 text-right shadow-md">
          <div className="flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[15px] text-rose-400 shrink-0">error</span>
            <span>{errorMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => updateStatus('idle', null)}
            className="text-rose-300 hover:text-white px-1 font-bold text-xs shrink-0"
          >
            بستن
          </button>
        </div>
      )}
    </div>
  );
};
