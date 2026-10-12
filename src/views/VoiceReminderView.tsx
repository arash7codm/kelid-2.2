import React, { useState, useRef, useEffect } from 'react';
import { Property, Collaborator, Applicant, ReminderTask } from '../types';
import { getTodayJalali, toPersianDigits } from '../utils/jalali';
import {
  extractReminderFromTranscript,
  mergeSpeechRecognitionResults,
  transcribeAudioWithGemini,
} from '../services/ai';
import { VoiceInputButton } from '../components/VoiceInputButton';
import { saveBlob, resolveBlobUrl, preloadAllBlobs } from '../db';

interface VoiceReminderViewProps {
  properties: Property[];
  collaborators: Collaborator[];
  applicants: Applicant[];
  onSaveReminder: (reminder: ReminderTask) => void;
  onOpenInbox: () => void;
  onClose: () => void;
  initialReminder?: ReminderTask | null;
  linkedCode?: string;
  initialDate?: string;
}

export const VoiceReminderView: React.FC<VoiceReminderViewProps> = ({
  properties,
  collaborators,
  applicants,
  onSaveReminder,
  onOpenInbox,
  onClose,
  initialReminder = null,
  linkedCode,
  initialDate,
}) => {
  const today = getTodayJalali();
  const isRenewal = Boolean(initialReminder);

  const [viewMode, setViewMode] = useState<'recording' | 'saved'>('recording');
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const [secondsElapsed, setSecondsElapsed] = useState(0);

  const timerRef = useRef<any>(null);
  const dateInputRef = useRef<HTMLInputElement>(null);
  const scheduleSectionRef = useRef<HTMLDivElement>(null);

  const [transcript, setTranscript] = useState(
    initialReminder?.transcript || initialReminder?.title || ''
  );
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiFallbackNotice, setAiFallbackNotice] = useState<string | null>(null);

  const [title, setTitle] = useState(initialReminder?.title || '');
  const [category, setCategory] = useState<ReminderTask['category']>(
    initialReminder?.category || 'تماس تلفنی'
  );
  const [priority, setPriority] = useState<ReminderTask['priority']>(
    initialReminder?.priority || 'فوری و بحرانی'
  );
  const [dateJalali, setDateJalali] = useState(
    initialReminder?.dateJalali || initialDate || today.formatted || '۱۴۰۵/۰۷/۲۴'
  );
  const [timeStr, setTimeStr] = useState(initialReminder?.timeStr || '');
  const [linkedPropertyCode, setLinkedPropertyCode] = useState(
    initialReminder?.linkedPropertyCode ||
      (linkedCode && /^F-/i.test(linkedCode) ? linkedCode : '')
  );
  const [linkedPropertyId, setLinkedPropertyId] = useState<string | undefined>(
    initialReminder?.linkedPropertyId
  );
  const [linkedPersonName, setLinkedPersonName] = useState(
    initialReminder?.linkedPersonName || ''
  );
  const [linkedPersonCode, setLinkedPersonCode] = useState(
    initialReminder?.linkedPersonCode ||
      (linkedCode && !/^F-/i.test(linkedCode) ? linkedCode : '')
  );
  const [linkedPersonPhone, setLinkedPersonPhone] = useState<string | undefined>(
    initialReminder?.linkedPersonPhone
  );
  const [notifyPush, setNotifyPush] = useState<boolean>(
    initialReminder?.notifyPush ?? true
  );
  const [notifySms, setNotifySms] = useState<boolean>(
    initialReminder?.notifySms ?? true
  );

  // Recorded audio reference (IndexedDB blob hash or data URL)
  const [audioBlobUrl, setAudioBlobUrl] = useState<string | undefined>(
    initialReminder?.audioBlobUrl
  );
  const [isPlayingArchive, setIsPlayingArchive] = useState(false);
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);
  const [, setBlobTick] = useState(0);

  const [showPropertyPicker, setShowPropertyPicker] = useState(false);
  const [showPersonPicker, setShowPersonPicker] = useState(false);

  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const archiveAudioRef = useRef<HTMLAudioElement | null>(null);

  const recognitionRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const hasGotSpeechRef = useRef(false);
  const latestTranscriptRef = useRef(transcript);

  useEffect(() => {
    preloadAllBlobs().then(() => setBlobTick((t) => t + 1));
  }, [audioBlobUrl]);

  useEffect(() => {
    latestTranscriptRef.current = transcript;
  }, [transcript]);

  useEffect(() => {
    if (!initialReminder && linkedCode) {
      if (/^F-/i.test(linkedCode)) {
        setLinkedPropertyCode(linkedCode);
        const foundProp = properties.find(
          (p) => p.code.toLowerCase() === linkedCode.toLowerCase()
        );
        if (foundProp) {
          setLinkedPropertyId(foundProp.id);
          if (!linkedPersonName && foundProp.ownerName) {
            setLinkedPersonName(foundProp.ownerName);
            setLinkedPersonPhone(foundProp.ownerPhone);
          }
        }
      } else {
        const foundApp = applicants.find((a) => a.code === linkedCode);
        if (foundApp) {
          setLinkedPersonName(foundApp.fullName);
          setLinkedPersonCode(foundApp.code);
          setLinkedPersonPhone(foundApp.phone);
        } else {
          const foundCollab = collaborators.find((c) => c.code === linkedCode);
          if (foundCollab) {
            setLinkedPersonName(foundCollab.fullName);
            setLinkedPersonCode(foundCollab.code);
            setLinkedPersonPhone(foundCollab.phone);
          }
        }
      }
    }
  }, [initialReminder, linkedCode, applicants, collaborators, properties]);

  useEffect(() => {
    if (isRenewal) {
      const t = setTimeout(() => {
        scheduleSectionRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
        dateInputRef.current?.focus();
        dateInputRef.current?.select();
      }, 180);
      return () => clearTimeout(t);
    }
  }, [isRenewal]);

  useEffect(() => {
    return () => {
      clearInterval(timerRef.current);
      try {
        recognitionRef.current?.stop();
      } catch {}
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  const runSmartExtraction = async (rawText: string) => {
    if (!rawText.trim()) return;
    setIsAnalyzing(true);
    setAiFallbackNotice(null);
    try {
      const extracted = await extractReminderFromTranscript(
        rawText,
        properties,
        collaborators,
        applicants
      );
      if (extracted) {
        if (extracted.noticeMessage) {
          setAiFallbackNotice(extracted.noticeMessage);
        }
        if (extracted.title) setTitle(extracted.title);
        if (extracted.category) setCategory(extracted.category);
        if (extracted.priority) setPriority(extracted.priority);
        if (extracted.dateJalali) setDateJalali(extracted.dateJalali);
        if (extracted.timeStr) setTimeStr(extracted.timeStr);
        if (extracted.linkedPropertyCode) {
          setLinkedPropertyCode(extracted.linkedPropertyCode);
          const matchedProp = properties.find(
            (p) =>
              p.code.toLowerCase() === extracted.linkedPropertyCode?.toLowerCase()
          );
          if (matchedProp) setLinkedPropertyId(matchedProp.id);
        }
        if (extracted.linkedPersonName) setLinkedPersonName(extracted.linkedPersonName);
        if (extracted.linkedPersonCode) {
          setLinkedPersonCode(extracted.linkedPersonCode);
          const matchedApp = applicants.find(
            (a) => a.code === extracted.linkedPersonCode
          );
          const matchedCollab = collaborators.find(
            (c) => c.code === extracted.linkedPersonCode
          );
          if (matchedApp?.phone) setLinkedPersonPhone(matchedApp.phone);
          else if (matchedCollab?.phone) setLinkedPersonPhone(matchedCollab.phone);
        }
      }
    } catch {
      setAiFallbackNotice(
        'ارتباط با هوش مصنوعی برقرار نشد؛ اطلاعات با تحلیلگر محلی فارسی بررسی شد.'
      );
    } finally {
      setIsAnalyzing(false);
    }
  };

  /**
   * Starts MediaRecorder to capture and persist real audio in IndexedDB,
   * and optionally runs Gemini transcription if SpeechRecognition didn't produce text.
   */
  const startAudioCapture = async (transcribeOnStopIfSilent: boolean) => {
    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === 'undefined'
    ) {
      if (transcribeOnStopIfSilent) {
        setRecordingError(
          'مرورگر شما از تبدیل گفتار به متن و ضبط صوت پشتیبانی نمی‌کند.'
        );
        setIsRecording(false);
        clearInterval(timerRef.current);
      }
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      audioChunksRef.current = [];

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
        if (mediaStreamRef.current) {
          mediaStreamRef.current.getTracks().forEach((t) => t.stop());
          mediaStreamRef.current = null;
        }
        const actualMime = recorder.mimeType || 'audio/webm';
        const blob = new Blob(audioChunksRef.current, { type: actualMime });
        if (blob.size < 200) {
          if (transcribeOnStopIfSilent && !hasGotSpeechRef.current) {
            setRecordingError('صدایی شنیده نشد. لطفاً واضح‌تر صحبت کنید.');
          }
          setIsTranscribing(false);
          return;
        }

        // Convert Blob to DataURL and save in IndexedDB blobs
        const fullDataUrl = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () =>
            resolve(typeof reader.result === 'string' ? reader.result : '');
          reader.onerror = () => resolve('');
          reader.readAsDataURL(blob);
        });

        if (fullDataUrl) {
          const blobRef = await saveBlob(fullDataUrl, actualMime);
          setAudioBlobUrl(blobRef || fullDataUrl);
        }

        // If SpeechRecognition didn't produce text, try Gemini transcription
        if (!hasGotSpeechRef.current && fullDataUrl && blob.size >= 400) {
          setIsTranscribing(true);
          try {
            const base64Part = fullDataUrl.includes(',')
              ? fullDataUrl.split(',')[1]
              : fullDataUrl;
            const text = await transcribeAudioWithGemini(base64Part, actualMime);
            if (text && text.trim()) {
              setTranscript(text.trim());
              latestTranscriptRef.current = text.trim();
              setIsTranscribing(false);
              await runSmartExtraction(text.trim());
              return;
            }
          } catch (err: any) {
            const msg = err?.message || '';
            if (msg === 'MISSING_API_KEY') {
              setAiFallbackNotice(
                'صوت ذخیره شد. کلید هوش مصنوعی در تنظیمات ثبت نشده است؛ در صورت تمایل متن را بنویسید تا تحلیلگر محلی فارسی آن را استخراج کند.'
              );
            } else if (msg === 'OFFLINE') {
              setAiFallbackNotice(
                'صوت در حافظه دستگاه ذخیره شد (در حالت آفلاین تبدیل خودکار صوت به متن غیرفعال است).'
              );
            }
          } finally {
            setIsTranscribing(false);
          }
        }

        if (latestTranscriptRef.current.trim()) {
          await runSmartExtraction(latestTranscriptRef.current);
        }
      };

      recorder.start(250);
    } catch (err: any) {
      if (transcribeOnStopIfSilent) {
        setIsRecording(false);
        clearInterval(timerRef.current);
        if (
          err?.name === 'NotAllowedError' ||
          err?.name === 'PermissionDeniedError'
        ) {
          setRecordingError(
            'مجوز دسترسی به میکروفون رد شده است. لطفاً دسترسی میکروفون را فعال کنید.'
          );
        } else {
          setRecordingError('خطا در دسترسی به میکروفون دستگاه.');
        }
      }
    }
  };

  const handleStartRecording = async () => {
    setRecordingError(null);
    setIsRecording(true);
    setSecondsElapsed(0);
    hasGotSpeechRef.current = false;

    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setSecondsElapsed((s) => s + 1);
    }, 1000);

    const SpeechRec =
      typeof window !== 'undefined'
        ? (window as any).SpeechRecognition ||
          (window as any).webkitSpeechRecognition
        : null;

    // Always start MediaRecorder so real audio is captured and saved
    await startAudioCapture(!SpeechRec);

    if (SpeechRec && navigator.onLine) {
      try {
        const isAndroid =
          typeof navigator !== 'undefined' &&
          /android/i.test(navigator.userAgent);
        const rec = new SpeechRec();
        rec.lang = 'fa-IR';
        rec.continuous = !isAndroid;
        rec.interimResults = true;
        rec.maxAlternatives = 1;

        rec.onresult = (event: any) => {
          const { finalTranscript, interimTranscript } =
            mergeSpeechRecognitionResults(event.results);
          const combined = [finalTranscript, interimTranscript]
            .filter(Boolean)
            .join(' ')
            .trim();
          if (combined) {
            hasGotSpeechRef.current = true;
            setTranscript(combined);
            latestTranscriptRef.current = combined;
          }
        };

        rec.onerror = async (event: any) => {
          const code = event?.error;
          // If MediaRecorder is running, do not interrupt the user's audio recording
          if (
            mediaRecorderRef.current &&
            mediaRecorderRef.current.state === 'recording'
          ) {
            return;
          }
          if (code === 'not-allowed' || code === 'service-not-allowed') {
            setIsRecording(false);
            clearInterval(timerRef.current);
            setRecordingError(
              'مجوز دسترسی به میکروفون رد شده است. لطفاً در تنظیمات مرورگر اجازه دهید.'
            );
          }
        };

        rec.onend = () => {
          if (
            mediaRecorderRef.current &&
            mediaRecorderRef.current.state === 'recording'
          ) {
            return;
          }
          setIsRecording(false);
          clearInterval(timerRef.current);
          if (hasGotSpeechRef.current) {
            runSmartExtraction(latestTranscriptRef.current);
          }
        };

        recognitionRef.current = rec;
        rec.start();
      } catch {
        // MediaRecorder is already running
      }
    }
  };

  const handleStopRecording = async () => {
    setIsRecording(false);
    clearInterval(timerRef.current);
    try {
      recognitionRef.current?.stop();
    } catch {}
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== 'inactive'
    ) {
      try {
        mediaRecorderRef.current.stop();
      } catch {}
    } else if (latestTranscriptRef.current.trim()) {
      await runSmartExtraction(latestTranscriptRef.current);
    }
  };

  const handleClearRecording = () => {
    setIsRecording(false);
    setRecordingError(null);
    setSecondsElapsed(0);
    clearInterval(timerRef.current);
    try {
      recognitionRef.current?.stop();
    } catch {}
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== 'inactive'
    ) {
      try {
        mediaRecorderRef.current.stop();
      } catch {}
    }
    setTranscript('');
    setAudioBlobUrl(undefined);
    setIsPlayingPreview(false);
    setIsPlayingArchive(false);
  };

  const handleSave = () => {
    const finalTitle =
      title.trim() ||
      transcript.trim().slice(0, 80) ||
      initialReminder?.title ||
      'یادآور صوتی کلید';

    // Match property/person metadata if typed manually
    const matchedProp = linkedPropertyCode.trim()
      ? properties.find(
          (p) =>
            !p.deleted &&
            p.code.toLowerCase() === linkedPropertyCode.trim().toLowerCase()
        )
      : undefined;

    const matchedApp = linkedPersonName.trim()
      ? applicants.find(
          (a) =>
            !a.deleted &&
            (a.fullName === linkedPersonName.trim() ||
              a.code === linkedPersonCode.trim())
        )
      : undefined;
    const matchedCollab = linkedPersonName.trim()
      ? collaborators.find(
          (c) =>
            !c.deleted &&
            (c.fullName === linkedPersonName.trim() ||
              c.code === linkedPersonCode.trim())
        )
      : undefined;

    onSaveReminder({
      id: initialReminder?.id || `rem_${Date.now()}`,
      title: finalTitle,
      category,
      priority,
      dateJalali,
      timeStr: timeStr.trim() || '۱۱:۰۰ قبل‌ازظهر',
      dueDateTimeIso: new Date().toISOString(),
      linkedPropertyCode: linkedPropertyCode.trim() || undefined,
      linkedPropertyId:
        linkedPropertyId || matchedProp?.id || initialReminder?.linkedPropertyId,
      linkedPersonName: linkedPersonName.trim() || undefined,
      linkedPersonCode:
        linkedPersonCode.trim() ||
        matchedApp?.code ||
        matchedCollab?.code ||
        undefined,
      linkedPersonPhone:
        linkedPersonPhone ||
        matchedApp?.phone ||
        matchedCollab?.phone ||
        initialReminder?.linkedPersonPhone,
      status: 'pending',
      isSnoozed: isRenewal ? true : initialReminder?.isSnoozed,
      notifyPush,
      notifySms,
      transcript: transcript.trim() || finalTitle,
      audioBlobUrl: audioBlobUrl || initialReminder?.audioBlobUrl,
      createdAt: initialReminder?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    if (isRenewal) {
      onOpenInbox();
    } else {
      setViewMode('saved');
    }
  };

  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return toPersianDigits(
      `${m < 10 ? '0' + m : m}:${s < 10 ? '0' + s : s}`
    );
  };

  const resolvedAudioSrc = resolveBlobUrl(audioBlobUrl);
  const activeProperties = properties.filter((p) => !p.deleted);
  const activeContacts = [
    ...applicants
      .filter((a) => !a.deleted)
      .map((a) => ({
        code: a.code,
        name: a.fullName,
        phone: a.phone,
        role: 'متقاضی',
      })),
    ...collaborators
      .filter((c) => !c.deleted)
      .map((c) => ({
        code: c.code,
        name: c.fullName,
        phone: c.phone,
        role: 'همکار',
      })),
  ];

  if (viewMode === 'saved') {
    return (
      <div className="flex flex-col w-full pb-28 text-right space-y-4 pt-2">
        <div className="w-full rounded-2xl glass-panel p-5 border border-[#f1cb83]/30 shadow-2xl flex flex-col gap-4 relative overflow-hidden">
          <div className="absolute -top-12 left-1/2 -translate-x-1/2 w-48 h-24 bg-emerald-500/20 rounded-full blur-2xl pointer-events-none" />

          <div className="flex flex-col items-center text-center gap-2 pt-2 pb-1">
            <div className="w-14 h-14 rounded-full bg-gradient-to-tr from-emerald-600 to-emerald-400 flex items-center justify-center text-white shadow-[0_0_24px_rgba(52,211,153,0.6)] border border-white/30">
              <span className="material-symbols-outlined text-3xl font-bold">
                check_circle
              </span>
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100">
                یادداشت صوتی و وظیفه با موفقیت ثبت شد
              </h2>
              <p className="text-xs text-[#f1cb83] flex items-center justify-center gap-1 mt-0.5">
                <span className="material-symbols-outlined text-sm text-emerald-400">
                  verified
                </span>
                <span>تحلیل هوش مصنوعی تکمیل و به تقویم افزوده شد</span>
              </p>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-[#091224]/80 border border-[#f1cb83]/25 space-y-2.5">
            {resolvedAudioSrc && (
              <audio
                ref={archiveAudioRef}
                src={resolvedAudioSrc}
                onEnded={() => setIsPlayingArchive(false)}
                onPause={() => setIsPlayingArchive(false)}
                onPlay={() => setIsPlayingArchive(true)}
                className="hidden"
              />
            )}
            <div className="flex items-center justify-between p-2 rounded-xl bg-[#050b17]/80 border border-white/5">
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    if (archiveAudioRef.current && resolvedAudioSrc) {
                      if (isPlayingArchive) {
                        archiveAudioRef.current.pause();
                      } else {
                        archiveAudioRef.current.play().catch(() => {});
                      }
                    } else {
                      setIsPlayingArchive(!isPlayingArchive);
                    }
                  }}
                  className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-full bg-[#f1cb83]/20 border border-[#f1cb83]/40 text-[#f1cb83] flex items-center justify-center hover:bg-[#f1cb83]/30 transition-all shrink-0 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-xl">
                    {isPlayingArchive ? 'pause' : 'play_arrow'}
                  </span>
                </button>
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-slate-100">
                    {resolvedAudioSrc ? 'پخش صوت آرشیو شده' : 'صوت آرشیو شده'}
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">
                    {formatTimer(secondsElapsed || 15)}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1 px-2">
                {[6, 14, 22, 28, 18, 12, 20, 24, 16, 8].map((h, idx) => (
                  <span
                    key={idx}
                    className={`w-1 rounded-full ${
                      isPlayingArchive
                        ? 'bg-emerald-400 animate-pulse'
                        : 'bg-[#f1cb83]'
                    }`}
                    style={{ height: `${h}px` }}
                  />
                ))}
              </div>
            </div>

            <div className="p-2.5 rounded-xl bg-[#050b17]/60 border border-[#f1cb83]/20 text-slate-100 text-xs leading-relaxed flex items-start gap-2">
              <span className="material-symbols-outlined text-[#f1cb83] text-base shrink-0 mt-0.5">
                notes
              </span>
              <span>«{transcript || title}»</span>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-[#091224]/70 border border-white/10 space-y-2 text-xs">
            <span className="text-slate-400 font-semibold block flex items-center gap-1.5">
              <span className="material-symbols-outlined text-sm text-[#f1cb83]">
                assignment_turned_in
              </span>
              اطلاعات تایید و ثبت‌شده در پرونده:
            </span>
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center justify-between p-2 rounded-lg bg-[#050b17]/60">
                <span className="text-slate-400 text-[11px]">پرونده ملکی متصل:</span>
                <span className="font-bold text-[#f1cb83] flex items-center gap-1">
                  <span>{linkedPropertyCode || 'بدون کد ملک'}</span>
                  <span className="material-symbols-outlined text-sm text-emerald-400">
                    check_circle
                  </span>
                </span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-[#050b17]/60">
                <span className="text-slate-400 text-[11px]">مخاطب اختصاص‌یافته:</span>
                <span className="font-bold text-sky-300">
                  {linkedPersonName || '—'}{' '}
                  {linkedPersonCode ? `(${linkedPersonCode})` : ''}
                </span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-[#050b17]/60">
                <span className="text-slate-400 text-[11px]">موعد و زمان یادآوری:</span>
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-slate-100">
                    {dateJalali} - {timeStr || '۱۱:۰۰ قبل‌ازظهر'}
                  </span>
                  <span className="text-[10px] font-bold text-rose-300 bg-rose-500/20 px-1.5 py-0.5 rounded">
                    {priority}
                  </span>
                </div>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-[#050b17]/60">
                <span className="text-slate-400 text-[11px]">
                  ارسال پیامک و نوتیفیکیشن:
                </span>
                <span className="font-bold text-emerald-400 flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" />
                  {notifyPush ? 'فعال شد' : 'غیرفعال'}
                </span>
              </div>
            </div>
          </div>

          <div className="space-y-2 pt-1">
            <button
              type="button"
              onClick={onOpenInbox}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-[#d4b06a] to-[#f1cb83] text-[#070d1a] font-bold text-sm shadow-[0_0_20px_rgba(241,203,131,0.4)] flex items-center justify-center gap-2 cursor-pointer active:scale-95"
            >
              <span className="material-symbols-outlined text-lg">fact_check</span>
              <span>مشاهده در کارتابل پیگیری‌ها</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setViewMode('recording');
                handleClearRecording();
              }}
              className="w-full py-2.5 rounded-xl bg-white/5 border border-[#f1cb83]/30 text-[#f1cb83] font-semibold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <span className="material-symbols-outlined text-base">mic</span>
              <span>ثبت یک یادداشت صوتی دیگر +</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full pb-32 text-right space-y-4 pt-1">
      <div className="w-full rounded-2xl glass-panel p-4 border border-[#f1cb83]/30 shadow-2xl space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-[#f1cb83]/15 border border-[#f1cb83]/30 flex items-center justify-center text-[#f1cb83]">
              <span className="material-symbols-outlined text-[20px]">
                {isRenewal ? 'update' : 'mic'}
              </span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-bold text-slate-100">
                  {isRenewal ? 'تمدید یادآور' : 'ثبت هوشمند یادآور صوتی'}
                </h1>
                {isRenewal && (
                  <span className="px-2 py-0.5 rounded-full bg-[#f1cb83]/20 border border-[#f1cb83]/40 text-[#f1cb83] text-[10px] font-bold">
                    زمان‌بندی مجدد
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400">
                {isRenewal
                  ? 'تغییر موعد، ساعت اعلان و مشخصات یادآور پرونده'
                  : 'تبدیل صوت به متن با هوش مصنوعی و استخراج خودکار وظیفه'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="بستن"
            className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-slate-400 hover:text-white cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        {/* Recording Studio Block */}
        <div
          className={`relative overflow-hidden p-4 rounded-[20px] bg-gradient-to-b from-[#0b152b]/90 via-[#081022]/90 to-[#060c1a]/95 backdrop-blur-xl border transition-all duration-300 space-y-3.5 ${
            isRecording
              ? 'border-[#f1cb83]/60 shadow-[0_14px_38px_rgba(0,0,0,0.65),0_0_26px_rgba(241,203,131,0.22),inset_0_1px_1px_rgba(241,203,131,0.35)]'
              : 'border-[#f1cb83]/25 shadow-[0_12px_32px_rgba(0,0,0,0.55),inset_0_1px_1px_rgba(241,203,131,0.18)]'
          }`}
        >
          <div
            className={`pointer-events-none absolute top-14 left-1/2 -translate-x-1/2 w-44 h-44 rounded-full blur-3xl transition-opacity duration-500 ${
              isRecording ? 'bg-[#f1cb83]/25 opacity-100' : 'bg-[#f1cb83]/10 opacity-60'
            }`}
          />

          {/* Top Status + Timer */}
          <div className="relative z-10 flex items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <span className="relative flex h-2.5 w-2.5 shrink-0">
                {isRecording && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-80" />
                )}
                <span
                  className={`relative inline-flex rounded-full h-2.5 w-2.5 transition-colors ${
                    isRecording
                      ? 'bg-rose-500 shadow-[0_0_10px_#f43f5e]'
                      : isTranscribing || isAnalyzing
                      ? 'bg-[#f1cb83] animate-pulse shadow-[0_0_8px_#f1cb83]'
                      : recordingError
                      ? 'bg-rose-400'
                      : 'bg-slate-400'
                  }`}
                />
              </span>
              <span
                className={`font-semibold truncate transition-colors ${
                  isRecording
                    ? 'text-[#f1cb83]'
                    : isTranscribing || isAnalyzing
                    ? 'text-amber-200'
                    : recordingError
                    ? 'text-rose-300'
                    : 'text-slate-300'
                }`}
              >
                {isRecording
                  ? 'در حال ضبط صدا...'
                  : isTranscribing || isAnalyzing
                  ? 'در حال پردازش صوت و استخراج هوشمند...'
                  : recordingError
                  ? 'خطا در ضبط صوت'
                  : 'آماده برای ضبط پیام صوتی جدید'}
              </span>
            </div>

            <span
              className={`font-mono font-bold text-xs px-2.5 py-1 rounded-full bg-[#050b17]/90 border transition-all shrink-0 ${
                isRecording
                  ? 'text-[#f1cb83] border-[#f1cb83]/60 shadow-[0_0_12px_rgba(241,203,131,0.3)]'
                  : 'text-[#f1cb83]/90 border-[#f1cb83]/25'
              }`}
              dir="ltr"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {formatTimer(secondsElapsed)}
            </span>
          </div>

          {/* Waveform Strip */}
          <div className="relative z-10 h-12 flex items-center justify-center gap-1.5 px-3.5 bg-[#050b17]/85 rounded-2xl border border-white/[0.07] shadow-[inset_0_2px_6px_rgba(0,0,0,0.6)] overflow-hidden">
            {[
              14, 22, 32, 18, 28, 38, 24, 16, 30, 36, 20, 40, 34, 22, 28, 18, 36,
              26, 16, 30, 24, 32, 20, 14,
            ].map((barH, idx) => (
              <span
                key={idx}
                className={`w-1 rounded-full transition-all duration-300 ${
                  isRecording
                    ? 'bg-gradient-to-t from-[#d4b06a] via-[#f1cb83] to-[#fff3d1] wave-bar-live shadow-[0_0_8px_rgba(241,203,131,0.55)]'
                    : 'bg-[#f1cb83]/30'
                }`}
                style={{
                  height: isRecording ? `${barH}px` : '4px',
                  animationDelay: isRecording ? `${(idx % 6) * 0.12}s` : '0s',
                }}
              />
            ))}
          </div>

          {/* Round Gold Mic Button */}
          <div className="relative z-10 flex items-center justify-center py-2.5">
            <div className="relative flex items-center justify-center">
              <span
                className={`pointer-events-none absolute w-[104px] h-[104px] rounded-full border transition-all duration-300 ${
                  isRecording
                    ? 'border-[#f1cb83]/45 mic-ring-pulse-2'
                    : 'border-[#f1cb83]/15 scale-95 opacity-60'
                }`}
              />
              <span
                className={`pointer-events-none absolute w-[90px] h-[90px] rounded-full border transition-all duration-300 ${
                  isRecording ? 'border-[#f1cb83]/65 mic-ring-pulse-1' : 'border-[#f1cb83]/25'
                }`}
              />
              <button
                type="button"
                onClick={isRecording ? handleStopRecording : handleStartRecording}
                disabled={isTranscribing}
                aria-label={isRecording ? 'توقف ضبط صوت' : 'شروع ضبط صوت'}
                className={`relative z-10 w-[76px] h-[76px] rounded-full flex items-center justify-center transition-all duration-200 active:scale-[0.95] cursor-pointer ${
                  isRecording
                    ? 'bg-gradient-to-tr from-[#d4b06a] via-[#f1cb83] to-[#fff0c4] text-[#070d1a] ring-2 ring-rose-500/80 shadow-[0_0_32px_rgba(241,203,131,0.75),0_8px_20px_rgba(0,0,0,0.6),inset_0_2px_3px_rgba(255,255,255,0.65)]'
                    : isTranscribing
                    ? 'bg-amber-500/30 text-amber-300 border border-amber-400/50 shadow-lg'
                    : 'bg-gradient-to-tr from-[#c9a358] via-[#e5c178] to-[#f9dfa2] text-[#070d1a] shadow-[0_0_26px_rgba(241,203,131,0.5),0_8px_20px_rgba(0,0,0,0.55),inset_0_2px_2px_rgba(255,255,255,0.6)] hover:shadow-[0_0_34px_rgba(241,203,131,0.7)]'
                }`}
              >
                <span
                  className={`material-symbols-outlined text-[34px] ${
                    isTranscribing ? 'animate-spin' : ''
                  }`}
                >
                  {isRecording
                    ? 'stop'
                    : isTranscribing
                    ? 'progress_activity'
                    : 'mic'}
                </span>
              </button>
            </div>
          </div>

          {recordingError && (
            <div className="relative z-10 px-3 py-2 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-200 text-xs flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-sm text-rose-400">
                  error
                </span>
                <span>{recordingError}</span>
              </div>
              <button
                type="button"
                onClick={() => setRecordingError(null)}
                className="text-rose-300 hover:text-white cursor-pointer"
              >
                <span className="material-symbols-outlined text-sm">close</span>
              </button>
            </div>
          )}

          {aiFallbackNotice && (
            <div className="relative z-10 px-3 py-2 rounded-xl bg-amber-500/15 border border-[#f1cb83]/40 text-[#f1cb83] text-xs flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-sm text-[#f1cb83] shrink-0">
                  info
                </span>
                <span>{aiFallbackNotice}</span>
              </div>
              <button
                type="button"
                onClick={() => setAiFallbackNotice(null)}
                className="text-[#f1cb83]/80 hover:text-white cursor-pointer shrink-0"
              >
                <span className="material-symbols-outlined text-sm">close</span>
              </button>
            </div>
          )}

          {/* Action Buttons: Start/Stop + Clear */}
          <div className="relative z-10 grid grid-cols-2 gap-2.5 pt-0.5">
            <button
              type="button"
              onClick={isRecording ? handleStopRecording : handleStartRecording}
              className="h-11 min-h-[44px] px-3.5 rounded-xl bg-white/[0.06] hover:bg-[#f1cb83]/15 border border-[#f1cb83]/45 text-xs font-bold text-[#f1cb83] flex items-center justify-center gap-1.5 active:scale-[0.97] transition-all cursor-pointer shadow-sm"
            >
              <span className="material-symbols-outlined text-[18px]">
                {isRecording ? 'stop_circle' : 'mic'}
              </span>
              <span>{isRecording ? 'توقف و استخراج' : 'شروع ضبط'}</span>
            </button>

            <button
              type="button"
              onClick={handleClearRecording}
              disabled={!transcript.trim() && secondsElapsed === 0 && !audioBlobUrl}
              className={`h-11 min-h-[44px] px-3.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                !transcript.trim() && secondsElapsed === 0 && !audioBlobUrl
                  ? 'bg-white/[0.03] border-rose-500/20 text-rose-300/40 opacity-50 cursor-not-allowed'
                  : 'bg-rose-500/10 hover:bg-rose-500/20 border-rose-500/35 text-rose-300 active:scale-[0.97] cursor-pointer shadow-sm'
              }`}
            >
              <span className="material-symbols-outlined text-[18px]">
                backspace
              </span>
              <span>پاک کردن متن</span>
            </button>
          </div>

          {/* Recorded Audio Preview Player Bar */}
          {resolvedAudioSrc && (
            <div className="relative z-10 p-2.5 rounded-xl bg-[#091224]/90 border border-[#f1cb83]/35 flex items-center justify-between gap-2.5">
              <audio
                ref={previewAudioRef}
                src={resolvedAudioSrc}
                onEnded={() => setIsPlayingPreview(false)}
                onPause={() => setIsPlayingPreview(false)}
                onPlay={() => setIsPlayingPreview(true)}
                className="hidden"
              />
              <div className="flex items-center gap-2.5 min-w-0">
                <button
                  type="button"
                  onClick={() => {
                    const el = previewAudioRef.current;
                    if (!el) return;
                    if (isPlayingPreview) {
                      el.pause();
                    } else {
                      el.play().catch(() => {});
                    }
                  }}
                  className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-xl bg-gradient-to-r from-[#d4b06a] to-[#f1cb83] text-[#070d1a] flex items-center justify-center shrink-0 cursor-pointer active:scale-95 shadow-md"
                >
                  <span className="material-symbols-outlined text-[22px]">
                    {isPlayingPreview ? 'pause' : 'play_arrow'}
                  </span>
                </button>
                <div className="min-w-0">
                  <span className="text-xs font-bold text-[#f1cb83] block">
                    پخش صدای ضبط‌شده یادآور ✓
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">
                    مدت زمان: {formatTimer(secondsElapsed || 10)}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  previewAudioRef.current?.pause();
                  setIsPlayingPreview(false);
                  setAudioBlobUrl(undefined);
                }}
                className="min-h-[40px] px-2.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 text-[11px] font-bold flex items-center gap-1 cursor-pointer shrink-0"
              >
                <span className="material-symbols-outlined text-[15px]">delete</span>
                <span>حذف صوت</span>
              </button>
            </div>
          )}

          {/* Title & Transcript Box */}
          <div className="relative z-10 p-3.5 rounded-2xl bg-[#050b17]/85 border border-white/10 text-xs space-y-3 shadow-[inset_0_2px_6px_rgba(0,0,0,0.5)]">
            <div>
              <label className="text-[11px] font-semibold text-slate-300 block mb-1.5">
                عنوان یادآور:
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="مثال: پیگیری قرارداد و استعلام سند..."
                className="w-full h-11 px-3.5 rounded-xl bg-[#081124]/90 border border-white/12 focus:border-[#f1cb83] focus:shadow-[0_0_14px_rgba(241,203,131,0.22)] text-xs font-bold text-slate-100 outline-none transition-all"
              />
            </div>

            <div className="space-y-1.5 pt-0.5">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="flex items-center gap-1 text-[11px] font-semibold text-[#f1cb83]">
                  <span className="material-symbols-outlined text-[15px]">
                    auto_awesome
                  </span>
                  <span>متن پیاده‌شده:</span>
                </span>
                <div className="flex items-center gap-1.5">
                  <VoiceInputButton
                    value={transcript}
                    onChange={(newVal) => {
                      setTranscript(newVal);
                      latestTranscriptRef.current = newVal;
                    }}
                    onAudioRecorded={async (payload) => {
                      if (payload.dataUrl) {
                        const ref = await saveBlob(payload.dataUrl, payload.mimeType);
                        setAudioBlobUrl(ref || payload.dataUrl);
                      }
                    }}
                    append={true}
                    variant="pill"
                    label="افزودن با صوت"
                    className="!min-h-[36px]"
                  />
                  <button
                    type="button"
                    onClick={() => runSmartExtraction(transcript)}
                    disabled={!transcript.trim() || isAnalyzing}
                    className={`min-h-[36px] px-2.5 py-1 rounded-full border text-[11px] font-bold flex items-center gap-1 transition-all ${
                      !transcript.trim() || isAnalyzing
                        ? 'bg-white/5 border-white/10 text-slate-500 cursor-not-allowed'
                        : 'bg-[#f1cb83]/15 hover:bg-[#f1cb83]/25 border-[#f1cb83]/40 text-[#f1cb83] active:scale-95 cursor-pointer'
                    }`}
                  >
                    <span
                      className={`material-symbols-outlined text-[14px] ${
                        isAnalyzing ? 'animate-spin' : ''
                      }`}
                    >
                      autorenew
                    </span>
                    <span>تحلیل مجدد</span>
                  </button>
                </div>
              </div>

              <textarea
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                rows={3}
                placeholder="متن یادآور صوتی اینجا به صورت زنده نوشته می‌شود..."
                className="w-full p-3 rounded-xl bg-[#081124]/90 border border-white/12 focus:border-[#f1cb83] focus:shadow-[0_0_14px_rgba(241,203,131,0.22)] text-slate-100 text-xs outline-none resize-none leading-relaxed transition-all"
              />
            </div>
          </div>
        </div>

        {/* Linked Property & Person Section */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-300 font-semibold">
              اتصال به پرونده سرمایه‌گذاری و مخاطب:
            </span>
            <span className="text-[11px] text-emerald-400">تشخیص خودکار ✓</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {/* Property Code Input + Quick Picker */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-[10px] text-slate-400 block">
                  کد ملک مرتبط
                </label>
                {activeProperties.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowPropertyPicker((v) => !v)}
                    className="text-[10px] font-bold text-[#f1cb83] hover:underline cursor-pointer"
                  >
                    {showPropertyPicker ? 'بستن لیست' : 'انتخاب از لیست فایل‌ها'}
                  </button>
                )}
              </div>
              <input
                type="text"
                value={linkedPropertyCode}
                onChange={(e) => setLinkedPropertyCode(e.target.value)}
                placeholder="مثلاً F-002"
                className="glass-field w-full h-11 px-3 rounded-xl text-xs font-bold text-[#f1cb83]"
                dir="ltr"
              />
              {showPropertyPicker && activeProperties.length > 0 && (
                <div className="p-1.5 rounded-xl bg-[#050b17]/95 border border-[#f1cb83]/30 max-h-36 overflow-y-auto space-y-1">
                  {activeProperties.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        setLinkedPropertyCode(p.code);
                        setLinkedPropertyId(p.id);
                        if (!linkedPersonName && p.ownerName) {
                          setLinkedPersonName(p.ownerName);
                          setLinkedPersonPhone(p.ownerPhone);
                        }
                        setShowPropertyPicker(false);
                      }}
                      className={`w-full px-2.5 py-1.5 rounded-lg text-right text-[11px] flex items-center justify-between cursor-pointer ${
                        linkedPropertyCode === p.code
                          ? 'bg-[#f1cb83]/20 text-[#f1cb83] font-bold'
                          : 'hover:bg-white/5 text-slate-200'
                      }`}
                    >
                      <span className="truncate">{p.title}</span>
                      <span className="font-mono font-bold text-[#f1cb83] shrink-0 mr-2" dir="ltr">
                        {p.code}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Person Name Input + Quick Picker */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-[10px] text-slate-400 block">
                  نام مخاطب یا همکار
                </label>
                {activeContacts.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowPersonPicker((v) => !v)}
                    className="text-[10px] font-bold text-sky-300 hover:underline cursor-pointer"
                  >
                    {showPersonPicker ? 'بستن لیست' : 'انتخاب از مخاطبین'}
                  </button>
                )}
              </div>
              <input
                type="text"
                value={linkedPersonName}
                onChange={(e) => setLinkedPersonName(e.target.value)}
                placeholder="نام مالک یا متقاضی"
                className="glass-field w-full h-11 px-3 rounded-xl text-xs font-bold text-sky-300"
              />
              {showPersonPicker && activeContacts.length > 0 && (
                <div className="p-1.5 rounded-xl bg-[#050b17]/95 border border-sky-400/30 max-h-36 overflow-y-auto space-y-1">
                  {activeContacts.map((c) => (
                    <button
                      key={c.code}
                      type="button"
                      onClick={() => {
                        setLinkedPersonName(c.name);
                        setLinkedPersonCode(c.code);
                        setLinkedPersonPhone(c.phone);
                        setShowPersonPicker(false);
                      }}
                      className={`w-full px-2.5 py-1.5 rounded-lg text-right text-[11px] flex items-center justify-between cursor-pointer ${
                        linkedPersonName === c.name
                          ? 'bg-sky-500/20 text-sky-300 font-bold'
                          : 'hover:bg-white/5 text-slate-200'
                      }`}
                    >
                      <span className="truncate">
                        {c.name} ({c.role})
                      </span>
                      <span className="font-mono text-[10px] text-sky-300 shrink-0 mr-2" dir="ltr">
                        {c.code}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Action Category */}
        <div className="space-y-1.5">
          <span className="text-xs font-bold text-slate-300 block">
            دسته‌بندی اقدام:
          </span>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                'تماس تلفنی',
                'استعلام سند',
                'بازدید حضوری',
                'پیگیری مالی',
              ] as const
            ).map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategory(cat)}
                className={`min-h-[44px] p-2.5 rounded-xl text-xs font-bold transition-all border cursor-pointer ${
                  category === cat
                    ? 'bg-[#f1cb83]/20 border-[#f1cb83] text-[#f1cb83]'
                    : 'bg-white/5 border-white/10 text-slate-300'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Schedule & Priority */}
        <div
          ref={scheduleSectionRef}
          className={`space-y-2 p-2.5 -mx-1 rounded-2xl transition-all ${
            isRenewal
              ? 'bg-[#f1cb83]/5 border border-[#f1cb83]/35 shadow-[0_0_20px_rgba(241,203,131,0.12)]'
              : ''
          }`}
        >
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-300 font-semibold">
              {isRenewal
                ? 'انتخاب تاریخ و ساعت جدید (تمدید):'
                : 'زمان یادآوری و اولویت اجرایی:'}
            </span>
            <span className="text-[10px] text-[#f1cb83]">همگام با تقویم گوشی</span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-slate-400 block mb-1">
                تاریخ شمسی
              </label>
              <input
                ref={dateInputRef}
                type="text"
                value={dateJalali}
                placeholder="مثال: ۱۴۰۵/۰۷/۲۴"
                onChange={(e) => setDateJalali(e.target.value)}
                className="glass-field w-full h-11 px-3 rounded-xl text-xs font-bold text-center text-[#f1cb83]"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-400 block mb-1">
                ساعت اعلان
              </label>
              <input
                type="text"
                value={timeStr}
                placeholder="مثال: ۱۱:۰۰ قبل‌ازظهر"
                onChange={(e) => setTimeStr(e.target.value)}
                className="glass-field w-full h-11 px-3 rounded-xl text-xs font-bold text-center text-slate-100"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-1.5">
            {(['فوری و بحرانی', 'عادی', 'کم‌اهمیت'] as const).map((prio) => (
              <button
                key={prio}
                type="button"
                onClick={() => setPriority(prio)}
                className={`min-h-[44px] py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                  priority === prio
                    ? prio === 'فوری و بحرانی'
                      ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 shadow-sm'
                      : 'bg-[#f1cb83]/20 text-[#f1cb83] border-[#f1cb83]/40 shadow-sm'
                    : 'bg-white/5 border-white/10 text-slate-400'
                }`}
              >
                {prio}
              </button>
            ))}
          </div>
        </div>

        {/* Toggle Cards */}
        <div className="grid grid-cols-2 gap-3 pt-1">
          <button
            type="button"
            role="switch"
            aria-checked={notifyPush}
            onClick={() => setNotifyPush(!notifyPush)}
            className={`h-[84px] p-3 rounded-2xl backdrop-blur-md border text-right flex flex-col justify-between transition-all duration-200 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f1cb83] cursor-pointer ${
              notifyPush
                ? 'bg-[#0d1830]/75 border-[#f1cb83]/75 shadow-[0_0_18px_rgba(241,203,131,0.22),inset_0_1px_1px_rgba(255,255,255,0.2)]'
                : 'bg-[#091224]/55 border-white/10 shadow-[inset_0_1px_1px_rgba(255,255,255,0.08)]'
            }`}
          >
            <div className="flex items-center justify-between w-full">
              <div
                className={`w-8 h-8 rounded-lg border flex items-center justify-center transition-colors duration-200 ${
                  notifyPush
                    ? 'bg-[#f1cb83]/20 border-[#f1cb83]/45 text-[#f1cb83]'
                    : 'bg-white/5 border-white/10 text-slate-400'
                }`}
              >
                <span className="material-symbols-outlined text-[18px]">
                  notifications_active
                </span>
              </div>
              <span
                className={`material-symbols-outlined text-[18px] transition-colors duration-200 ${
                  notifyPush ? 'text-[#f1cb83]' : 'text-slate-500'
                }`}
              >
                {notifyPush ? 'check_circle' : 'radio_button_unchecked'}
              </span>
            </div>
            <span
              className={`text-[11px] font-bold leading-snug line-clamp-2 transition-colors duration-200 ${
                notifyPush ? 'text-slate-100' : 'text-slate-400'
              }`}
            >
              اعلان پیامکی و پوش نوتیفیکیشن
            </span>
          </button>

          <button
            type="button"
            role="switch"
            aria-checked={notifySms}
            onClick={() => setNotifySms(!notifySms)}
            className={`h-[84px] p-3 rounded-2xl backdrop-blur-md border text-right flex flex-col justify-between transition-all duration-200 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f1cb83] cursor-pointer ${
              notifySms
                ? 'bg-[#0d1830]/75 border-[#f1cb83]/75 shadow-[0_0_18px_rgba(241,203,131,0.22),inset_0_1px_1px_rgba(255,255,255,0.2)]'
                : 'bg-[#091224]/55 border-white/10 shadow-[inset_0_1px_1px_rgba(255,255,255,0.08)]'
            }`}
          >
            <div className="flex items-center justify-between w-full">
              <div
                className={`w-8 h-8 rounded-lg border flex items-center justify-center transition-colors duration-200 ${
                  notifySms
                    ? 'bg-[#f1cb83]/20 border-[#f1cb83]/45 text-[#f1cb83]'
                    : 'bg-white/5 border-white/10 text-slate-400'
                }`}
              >
                <span className="material-symbols-outlined text-[18px]">
                  folder_special
                </span>
              </div>
              <span
                className={`material-symbols-outlined text-[18px] transition-colors duration-200 ${
                  notifySms ? 'text-[#f1cb83]' : 'text-slate-500'
                }`}
              >
                {notifySms ? 'check_circle' : 'radio_button_unchecked'}
              </span>
            </div>
            <span
              className={`text-[11px] font-bold leading-snug line-clamp-2 transition-colors duration-200 ${
                notifySms ? 'text-slate-100' : 'text-slate-400'
              }`}
            >
              ثبت مستقیم در کارتابل پرونده
            </span>
          </button>
        </div>

        {/* Submit & Cancel Buttons */}
        <div className="space-y-2 pt-2">
          <button
            type="button"
            onClick={handleSave}
            className="w-full min-h-[48px] py-3 rounded-xl bg-gradient-to-r from-[#d4b06a] to-[#f1cb83] text-[#070d1a] font-bold text-sm shadow-[0_0_20px_rgba(241,203,131,0.4)] active:scale-95 transition-all cursor-pointer"
          >
            {isRenewal
              ? 'ذخیره تمدید و زمان‌بندی مجدد یادآور'
              : 'ذخیره هوشمند و زمان‌بندی یادآور'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="w-full min-h-[44px] py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-semibold cursor-pointer"
          >
            انصراف و بستن
          </button>
        </div>
      </div>
    </div>
  );
};
