import React, { useState, useRef, useEffect } from 'react';
import { Mic, Square, Trash2, Play, Pause, Upload, CheckCircle2 } from 'lucide-react';
import axios from 'axios';
import { API } from '@/context/AuthContext';
import { toast } from 'sonner';

const MAX_DURATION_SEC = 180; // 3 minutes

// Format seconds to mm:ss
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
 */
export default function VoiceRecorder({ value, onChange, disabled }) {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [previewBlob, setPreviewBlob] = useState(null);
  const [previewDuration, setPreviewDuration] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [playing, setPlaying] = useState(false);

  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const timerRef = useRef(null);
  const audioRef = useRef(null);

  // Stop everything on unmount
  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mr = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = mr;
      chunksRef.current = [];
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
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
          if (p + 1 >= MAX_DURATION_SEC) {
            stopRecording();
            return MAX_DURATION_SEC;
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

  const discardPreview = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setPreviewBlob(null);
    setElapsed(0);
    setPreviewDuration(0);
  };

  const uploadPreview = async () => {
    if (!previewBlob) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', previewBlob, `voice-${Date.now()}.webm`);
      fd.append('duration', String(previewDuration));
      const { data } = await axios.post(`${API}/uploads/voice-recording`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      onChange({ url: data.url, public_id: data.public_id, duration: data.duration || previewDuration });
      toast.success('Voice recording uploaded');
      discardPreview();
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

  // Uploaded state — show the player + remove
  if (value && value.url) {
    return (
      <div className="border border-emerald-200 bg-emerald-50/50 rounded-md p-3 flex items-center gap-3" data-testid="voice-uploaded">
        <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
        <audio src={value.url} controls className="flex-1 h-8" data-testid="voice-uploaded-audio" />
        {!disabled && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-slate-400 hover:text-red-600"
            data-testid="voice-remove-uploaded-btn"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>
    );
  }

  // Preview state — recorded, not yet uploaded
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
          <span className="text-sm font-mono text-slate-700">{fmt(previewDuration)}</span>
          <span className="text-xs text-slate-500 ml-auto">Preview — not uploaded yet</span>
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
            onClick={discardPreview}
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

  // Idle / recording state
  return (
    <div className="border border-slate-200 rounded-md p-3 flex items-center gap-3" data-testid="voice-recorder">
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
  );
}
