import React, { useState, useRef, useEffect } from 'react';
import { Mic, Square, Trash2, Play, Pause, Upload, CheckCircle2, FileAudio } from 'lucide-react';
import axios from 'axios';
import { API } from '@/context/AuthContext';
import { toast } from 'sonner';

const MAX_REC_DURATION = 180; // 3 min for live recording
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB

const fmt = (s) => {
  const m = Math.floor(s / 60).toString().padStart(2, '0');
  const sec = Math.floor(s % 60).toString().padStart(2, '0');
  return `${m}:${sec}`;
};

/**
 * VoiceRecorder
 * Props:
 *   value: { url, public_id, duration } | null  (current uploaded recording)
 *   onChange: (value | null) => void
 *   disabled: bool
 *
 * Two modes:
 *   - Upload: pick an audio file from disk (counselor uploads call recording from phone)
 *   - Record: live record from browser microphone (max 3 min / 3 MB)
 */
export default function VoiceRecorder({ value, onChange, disabled }) {
  const [mode, setMode] = useState('upload'); // 'upload' | 'record'
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [previewBlob, setPreviewBlob] = useState(null);
  const [previewDuration, setPreviewDuration] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [fileName, setFileName] = useState('');

  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const timerRef = useRef(null);
  const audioRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const resetPreview = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setPreviewBlob(null);
    setPreviewDuration(0);
    setElapsed(0);
    setFileName('');
  };

  // ----- Upload-from-file flow -----
  const handleFileChoose = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const name = (f.name || '').toLowerCase();
    const allowedExts = ['.mp3', '.m4a', '.wav', '.ogg', '.oga', '.webm', '.mp4', '.aac', '.opus', '.amr', '.3gp', '.3gpp'];
    const extOk = allowedExts.some((ext) => name.endsWith(ext));
    // Browsers sometimes report 'video/mp4' / 'video/webm' / 'video/3gpp'
    // for audio-only containers (especially WhatsApp voice notes exported as
    // .mp4 and Android phone recorder output as .3gp). Accept by extension as
    // a fallback when MIME hints lie.
    const mimeOk = (f.type || '').startsWith('audio/')
      || ['video/webm', 'video/mp4', 'video/3gpp'].includes(f.type);
    if (!mimeOk && !extOk) {
      toast.error('Please choose an audio file (MP3, M4A, WAV, OGG, AAC, AMR, 3GP, WebM, MP4)');
      return;
    }
    if (f.size > MAX_UPLOAD_BYTES) {
      toast.error('File too large. Max 5 MB allowed.');
      return;
    }
    resetPreview();
    setFileName(f.name);
    setPreviewBlob(f);
    const url = URL.createObjectURL(f);
    setPreviewUrl(url);
    // Read duration via audio element after load
    const tmp = new Audio(url);
    tmp.addEventListener('loadedmetadata', () => {
      if (tmp.duration && isFinite(tmp.duration)) setPreviewDuration(tmp.duration);
    });
  };

  // ----- Live record flow -----
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mr = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = mr;
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        setPreviewBlob(blob);
        const url = URL.createObjectURL(blob);
        setPreviewUrl(url);
      };
      mr.start();
      setRecording(true);
      setElapsed(0);
      timerRef.current = setInterval(() => {
        setElapsed((p) => {
          if (p + 1 >= MAX_REC_DURATION) {
            stopRecording();
            return MAX_REC_DURATION;
          }
          return p + 1;
        });
      }, 1000);
    } catch (err) {
      toast.error('Microphone access denied');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    if (timerRef.current) clearInterval(timerRef.current);
    setRecording(false);
    setPreviewDuration(elapsed);
  };

  // ----- Common upload to Cloudinary -----
  const uploadPreview = async () => {
    if (!previewBlob) return;
    setUploading(true);
    try {
      const fd = new FormData();
      const ext = fileName ? fileName.split('.').pop() : 'webm';
      const filename = fileName || `voice-${Date.now()}.${ext}`;
      fd.append('file', previewBlob, filename);
      fd.append('duration', String(previewDuration || 0));
      const { data } = await axios.post(`${API}/uploads/voice-recording`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      onChange({ url: data.url, public_id: data.public_id, duration: data.duration || previewDuration });
      toast.success('Voice recording uploaded');
      resetPreview();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (playing) {
      audioRef.current.pause();
      setPlaying(false);
    } else {
      audioRef.current.play();
      setPlaying(true);
    }
  };

  // ----- Uploaded state -----
  if (value && value.url) {
    return (
      <div className="border border-emerald-200 bg-emerald-50/50 rounded-md p-3 flex items-center gap-3" data-testid="voice-uploaded">
        <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
        <audio src={value.url} controls className="flex-1 h-8" data-testid="voice-uploaded-audio" />
        {!disabled && (
          <button type="button" onClick={() => onChange(null)} className="text-slate-400 hover:text-red-600" data-testid="voice-remove-uploaded-btn">
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>
    );
  }

  // ----- Preview state (after file pick or record) -----
  if (previewUrl) {
    return (
      <div className="border border-violet-200 bg-violet-50/40 rounded-md p-3 space-y-2" data-testid="voice-preview">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={togglePlay}
            className="w-9 h-9 rounded-full bg-violet-700 hover:bg-violet-800 text-white flex items-center justify-center"
            data-testid="voice-preview-play-btn"
          >
            {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
          </button>
          <audio ref={audioRef} src={previewUrl} onEnded={() => setPlaying(false)} className="hidden" />
          <div className="flex-1 min-w-0">
            {fileName ? (
              <p className="text-xs text-slate-700 truncate font-medium">{fileName}</p>
            ) : (
              <span className="text-sm font-mono text-slate-700">{fmt(previewDuration)}</span>
            )}
            <p className="text-[10px] text-slate-500">Preview — not uploaded yet</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={uploadPreview}
            disabled={uploading}
            className="flex-1 inline-flex items-center justify-center gap-1.5 h-9 px-3 bg-violet-700 hover:bg-violet-800 disabled:opacity-50 text-white text-sm font-medium rounded-md"
            data-testid="voice-upload-btn"
          >
            <Upload className="w-3.5 h-3.5" />
            {uploading ? 'Uploading…' : 'Save recording'}
          </button>
          <button
            type="button"
            onClick={resetPreview}
            disabled={uploading}
            className="h-9 px-3 border border-slate-300 hover:bg-slate-50 text-sm rounded-md"
            data-testid="voice-discard-btn"
          >
            Discard
          </button>
        </div>
      </div>
    );
  }

  // ----- Idle: tabs for Upload | Record -----
  return (
    <div className="border border-slate-200 rounded-md overflow-hidden" data-testid="voice-recorder">
      <div className="flex bg-slate-50 border-b border-slate-200">
        <button
          type="button"
          onClick={() => setMode('upload')}
          className={`flex-1 px-3 py-2 text-xs font-semibold transition-colors ${mode === 'upload' ? 'bg-white text-violet-700 border-b-2 border-violet-700' : 'text-slate-500 hover:text-slate-700'}`}
          data-testid="voice-tab-upload"
        >
          <Upload className="w-3.5 h-3.5 inline mr-1.5" />
          Upload from phone
        </button>
        <button
          type="button"
          onClick={() => setMode('record')}
          className={`flex-1 px-3 py-2 text-xs font-semibold transition-colors ${mode === 'record' ? 'bg-white text-violet-700 border-b-2 border-violet-700' : 'text-slate-500 hover:text-slate-700'}`}
          data-testid="voice-tab-record"
        >
          <Mic className="w-3.5 h-3.5 inline mr-1.5" />
          Record live
        </button>
      </div>

      {mode === 'upload' ? (
        <div className="p-4 text-center">
          {/*
            File picker MIME hint — IMPORTANT for Android:
            Using a bare `accept="audio/*"` (the obvious choice) causes Chrome
            on Android to launch the Sound Recorder intent and hides the
            Files / Drive / WhatsApp media chooser. Listing explicit MIME
            types + extensions instead lets Android show the proper file
            picker (Files / Downloads / Drive / WhatsApp Audio) while still
            keeping iOS happy.
            Refs: chromium issue 41384611, MDN <input type=file> accept notes.
          */}
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/mpeg,audio/mp3,audio/mp4,audio/m4a,audio/x-m4a,audio/wav,audio/x-wav,audio/ogg,audio/webm,audio/aac,audio/opus,audio/3gpp,audio/amr,video/mp4,.mp3,.m4a,.wav,.ogg,.oga,.opus,.webm,.aac,.amr,.3gp,.mp4"
            onChange={handleFileChoose}
            className="hidden"
            data-testid="voice-file-input"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled}
            className="inline-flex items-center gap-2 px-4 py-2 bg-violet-700 hover:bg-violet-800 disabled:opacity-50 text-white text-sm font-medium rounded-md"
            data-testid="voice-choose-file-btn"
          >
            <FileAudio className="w-4 h-4" />
            Choose audio file
          </button>
          <p className="text-[11px] text-slate-500 mt-2">
            MP3, M4A, WAV, OGG, AAC, AMR, 3GP, WebM, MP4 (WhatsApp voice) · max 5 MB
          </p>
          <p className="text-[10px] text-slate-400 mt-1">
            Tip: on Android, tap "Files" or "Browse" in the picker to find WhatsApp / Downloads.
          </p>
        </div>
      ) : (
        <div className="p-3 flex items-center gap-3">
          {recording ? (
            <>
              <button
                type="button"
                onClick={stopRecording}
                className="w-9 h-9 rounded-full bg-red-600 hover:bg-red-700 text-white flex items-center justify-center animate-pulse"
                data-testid="voice-stop-btn"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
              </button>
              <span className="text-sm font-mono text-red-600">{fmt(elapsed)}</span>
              <span className="text-xs text-slate-500 ml-auto">Recording… max 3 min</span>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={startRecording}
                disabled={disabled}
                className="w-9 h-9 rounded-full bg-violet-700 hover:bg-violet-800 disabled:opacity-50 text-white flex items-center justify-center"
                data-testid="voice-record-btn"
              >
                <Mic className="w-4 h-4" />
              </button>
              <span className="text-sm text-slate-700 font-medium">Record voice note</span>
              <span className="text-xs text-slate-400 ml-auto">Up to 3 min</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
