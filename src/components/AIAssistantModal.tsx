import React, { useState, useRef } from 'react';
import { X, Sparkles, Mic, Music, Loader2, Play, Volume2, Upload, FileAudio, CheckCircle2 } from 'lucide-react';
import { djEngine, DJTrackPlan } from '../audio/DJEngine';
import { estimateBPMFromAudioBuffer } from '../utils/beatDetector';
import { SAMPLE_SONGS } from '../utils/sampleTracks';

interface AIAssistantModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApplyPlan: (plan: DJTrackPlan) => void;
  currentSongTitle: string;
  songDuration: number;
  currentBpm: number;
  onLoadSongToDeckB: (buffer: AudioBuffer, title: string, bpm: number) => void;
}

export const AIAssistantModal: React.FC<AIAssistantModalProps> = ({
  isOpen,
  onClose,
  onApplyPlan,
  currentSongTitle,
  songDuration,
  currentBpm,
  onLoadSongToDeckB,
}) => {
  const [activeTab, setActiveTab] = useState<'beat' | 'voice'>('beat');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Uploaded song state inside the modal
  const [modalSongTitle, setModalSongTitle] = useState(currentSongTitle);
  const [modalSongBpm, setModalSongBpm] = useState(currentBpm || 135);
  const [modalSongDuration, setModalSongDuration] = useState(songDuration || 180);
  const [uploadedBuffer, setUploadedBuffer] = useState<AudioBuffer | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Beat generator state
  const [genre, setGenre] = useState('jedag_jedug');
  const [prompt, setPrompt] = useState('Bikin beat DJ yang mantap, jedag jedug bass nendang, dan tidak bertabrakan dengan vokal lagu saya.');
  const [targetBpm, setTargetBpm] = useState(currentBpm || 138);
  const [isGeneratingBeat, setIsGeneratingBeat] = useState(false);
  const [beatResult, setBeatResult] = useState<DJTrackPlan | null>(null);
  const [quotaNotice, setQuotaNotice] = useState<string | null>(null);

  // Voice drop state
  const [voiceText, setVoiceText] = useState(`DJ on the mix! Special remix untuk ${currentSongTitle || 'lagu ini'}, let's drop the bass!`);
  const [voiceName, setVoiceName] = useState('Fenrir');
  const [voiceStyle, setVoiceStyle] = useState('Hype club DJ MC, energetic punchy delivery');
  const [isGeneratingVoice, setIsGeneratingVoice] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState<string | null>(null);

  if (!isOpen) return null;

  // Handle direct file upload inside modal
  const handleModalFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      await djEngine.ensureRunning();
      if (!djEngine.ctx) return;

      const arrayBuffer = await file.arrayBuffer();
      const decoded = await djEngine.ctx.decodeAudioData(arrayBuffer);
      const detected = estimateBPMFromAudioBuffer(decoded);
      const cleanTitle = file.name.replace(/\.[^/.]+$/, '');

      setUploadedBuffer(decoded);
      setModalSongTitle(cleanTitle);
      setModalSongBpm(detected);
      setModalSongDuration(decoded.duration);
      setTargetBpm(detected);
      setVoiceText(`DJ on the mix! Special remix untuk lagu ${cleanTitle}, 3, 2, 1, DROP IT!`);

      // Automatically load into Deck B
      onLoadSongToDeckB(decoded, cleanTitle, detected);
    } catch (err) {
      console.warn('Modal audio upload failed:', err);
      alert('Gagal membaca file audio.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleSelectDemo = async (demoId: string) => {
    const demo = SAMPLE_SONGS.find((s) => s.id === demoId);
    if (!demo) return;
    await djEngine.ensureRunning();
    if (!djEngine.ctx) return;

    const buffer = demo.generate(djEngine.ctx);
    setUploadedBuffer(buffer);
    setModalSongTitle(demo.name);
    setModalSongBpm(demo.bpm);
    setModalSongDuration(buffer.duration);
    setTargetBpm(demo.bpm);
    setVoiceText(`DJ on the mix! Special remix ${demo.name}, let's go!`);
    onLoadSongToDeckB(buffer, demo.name, demo.bpm);
  };

  const handleGenerateBeat = async () => {
    setIsGeneratingBeat(true);
    try {
      const res = await fetch('/api/dj/generate-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          genre,
          prompt,
          bpm: targetBpm,
          songTitle: modalSongTitle,
          uploadedTrackDuration: modalSongDuration,
        }),
      });
      const data = await res.json();
      if (data.isQuotaExceeded) {
        setQuotaNotice('Smart Procedural DJ Engine aktif: Beat jedag-jedug berhasil diracik tanpa hambatan kuota!');
      } else {
        setQuotaNotice(null);
      }
      if (data.plan) {
        setBeatResult(data.plan);
        onApplyPlan(data.plan);
      }
    } catch (err) {
      console.warn('Error generating beat plan:', err);
    } finally {
      setIsGeneratingBeat(false);
    }
  };

  const handleGenerateVoice = async () => {
    setIsGeneratingVoice(true);
    setVoiceStatus('Generating AI DJ Voice Drop...');
    try {
      const res = await fetch('/api/dj/generate-voice-drop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: voiceText,
          voiceName,
          style: voiceStyle,
        }),
      });

      const data = await res.json();
      if (data.success && data.audioBase64) {
        const binary = atob(data.audioBase64);
        const len = binary.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binary.charCodeAt(i);
        }

        await djEngine.ensureRunning();
        if (djEngine.ctx) {
          const audioBuffer = await djEngine.ctx.decodeAudioData(bytes.buffer);
          djEngine.setVoiceDropAudio(audioBuffer);
          setVoiceStatus('Voice drop loaded! Trigger it with the MC DROP button.');
          djEngine.triggerVoiceDrop();
        }
      } else if (data.isQuotaExceeded) {
        setVoiceStatus('Fitur suara Gemini sedang cooldown harian. Gunakan Soundboard FX bawaan (Horn, Siren, Kendang, Angguk-Angguk)!');
      } else {
        setVoiceStatus(data.error || 'Failed to generate voice drop');
      }
    } catch (err: any) {
      console.warn('Voice drop info:', err);
      setVoiceStatus('Suara MC offline sementara. Gunakan Soundboard FX!');
    } finally {
      setIsGeneratingVoice(false);
    }
  };

  const genres = [
    { id: 'jedag_jedug', label: 'Jedag Jedug Indonesia', desc: 'Sub 808 berat mengkane, bass drop nendang, khas club/TikTok Indo' },
    { id: 'koplo_kendang', label: 'Koplo Jedag Kendang Bass', desc: 'Perpaduan ketukan kendang tak/tung & sub bass untuk lagu pop/dangdut' },
    { id: 'funkot_breakbeat', label: 'Funkot / Breakbeat Kota', desc: '145 BPM, upbeat tempo, acid lead, cocok untuk remix energik' },
    { id: 'slow_bass_santai', label: 'Slow Bass Glitch Santai', desc: '120 BPM, deep glide sub, bass lembut melayang untuk lagu galau' },
    { id: 'club_edm', label: 'Festival EDM Anthem', desc: '128 BPM, massive supersaw drop, big room anthem internasional' },
    { id: 'cyber_club', label: 'Cyber Phonk / Club Bounce', desc: '140 BPM, drift synth, hard hitting bounce bass' },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*"
        onChange={handleModalFileUpload}
        className="hidden"
      />

      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-4 border-b border-neutral-800 bg-neutral-950/60">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-amber-400" />
            <h2 className="text-base font-bold text-neutral-100">
              AI DJ Generator & Track Mashup Studio
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-100 p-1 rounded-lg hover:bg-neutral-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-neutral-800 bg-neutral-950/40 p-1.5 gap-1.5">
          <button
            type="button"
            onClick={() => setActiveTab('beat')}
            className={`flex-1 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
              activeTab === 'beat'
                ? 'bg-amber-500 text-neutral-950 shadow-sm'
                : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/60'
            }`}
          >
            <Music className="w-4 h-4" />
            1. Upload Lagu & Generate Beat DJ Khusus
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('voice')}
            className={`flex-1 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
              activeTab === 'voice'
                ? 'bg-amber-500 text-neutral-950 shadow-sm'
                : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/60'
            }`}
          >
            <Mic className="w-4 h-4" />
            2. Buat Suara MC / DJ Shoutout
          </button>
        </div>

        {/* Content Area */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {activeTab === 'beat' ? (
            <div className="space-y-4">
              {/* DIRECT SONG UPLOAD BOX INSIDE GENERATOR */}
              <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-3.5 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-cyan-400 flex items-center gap-1.5">
                    <FileAudio className="w-4 h-4" />
                    Lagu yang Akan Di-Remix / Dicampur:
                  </span>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                    className="px-3 py-1 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 shadow-sm"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    {isUploading ? 'Membaca Audio...' : 'Upload File Lagu (MP3/WAV)'}
                  </button>
                </div>

                <div className="flex items-center justify-between bg-neutral-900 p-2.5 rounded-lg border border-neutral-800/80">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-neutral-200 truncate">
                      {modalSongTitle}
                    </p>
                    <p className="text-[11px] text-neutral-400">
                      Terdeteksi: <span className="font-mono-numbers text-amber-400 font-bold">{modalSongBpm} BPM</span> · Durasi {Math.round(modalSongDuration)}s
                    </p>
                  </div>
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 ml-2" />
                </div>

                <div className="flex items-center gap-1.5 text-[11px] text-neutral-400 pt-1">
                  <span>Atau coba lagu demo:</span>
                  {SAMPLE_SONGS.map((demo) => (
                    <button
                      key={demo.id}
                      type="button"
                      onClick={() => handleSelectDemo(demo.id)}
                      className="px-2 py-0.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded transition-colors cursor-pointer"
                    >
                      {demo.name.split(' ')[0]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Genre Selection */}
              <div>
                <label className="text-xs font-semibold text-neutral-300 block mb-1.5">
                  Pilih Karakter Remix DJ yang Cocok:
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {genres.map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => setGenre(g.id)}
                      className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                        genre === g.id
                          ? 'bg-amber-500/10 border-amber-500/60 text-amber-200'
                          : 'bg-neutral-950/60 border-neutral-800 text-neutral-400 hover:text-neutral-200 hover:border-neutral-700'
                      }`}
                    >
                      <p className="text-xs font-bold text-neutral-100">{g.label}</p>
                      <p className="text-[10px] text-neutral-400 mt-0.5 leading-snug">{g.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom Prompt */}
              <div>
                <label className="text-xs font-semibold text-neutral-300 block mb-1.5">
                  Instruksi Khusus untuk Gemini AI:
                </label>
                <textarea
                  rows={2}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Contoh: Beat jedag jedug bass nendang, potong drum lagu asli agar vokal menonjol, ada snare roll cepat sebelum drop..."
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl p-2.5 text-xs text-neutral-100 placeholder:text-neutral-600 focus:outline-none focus:border-amber-500/80 resize-none"
                />
              </div>

              {/* Target BPM */}
              <div className="flex items-center justify-between bg-neutral-950 p-3 rounded-xl border border-neutral-800">
                <span className="text-xs text-neutral-300 font-medium">BPM Tempo Sync:</span>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min="115"
                    max="160"
                    value={targetBpm}
                    onChange={(e) => setTargetBpm(parseInt(e.target.value))}
                    className="w-28 accent-amber-500"
                  />
                  <span className="font-mono-numbers text-xs font-bold text-amber-400 w-14 text-right">
                    {targetBpm} BPM
                  </span>
                </div>
              </div>

              {/* Result Preview */}
              {beatResult && (
                <div className="bg-neutral-950 border border-amber-500/30 rounded-xl p-3.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-amber-400">
                      Berhasil Digenerate: {beatResult.title}
                    </span>
                    <span className="text-[11px] text-neutral-400">
                      {beatResult.bpm} BPM · Key {beatResult.key}
                    </span>
                  </div>
                  {beatResult.mashupTips && (
                    <p className="text-xs text-neutral-300 bg-neutral-900/80 p-2.5 rounded-lg border border-neutral-800">
                      <span className="font-bold text-amber-300">Tips Mix & Stem:</span>{' '}
                      {beatResult.mashupTips}
                    </p>
                  )}
                </div>
              )}

              {quotaNotice && (
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 text-xs text-amber-300 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>{quotaNotice}</span>
                </div>
              )}

              <button
                type="button"
                onClick={handleGenerateBeat}
                disabled={isGeneratingBeat}
                className="w-full py-3 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-neutral-950 font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg shadow-amber-500/20"
              >
                {isGeneratingBeat ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Menganalisis Lagu & Membuat Beat DJ Khusus dengan Gemini AI...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Generate Beat DJ & Cocokkan dengan Lagu Ini
                  </>
                )}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-neutral-300 block mb-1.5">
                  Teks Shoutout MC / Suara DJ:
                </label>
                <input
                  type="text"
                  value={voiceText}
                  onChange={(e) => setVoiceText(e.target.value)}
                  placeholder="Ketik kalimat shoutout MC DJ..."
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3.5 py-2.5 text-xs text-neutral-100 placeholder:text-neutral-600 focus:outline-none focus:border-amber-500/80"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-neutral-300 block mb-1.5">
                    Karakter Suara:
                  </label>
                  <select
                    value={voiceName}
                    onChange={(e) => setVoiceName(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-neutral-100 focus:outline-none cursor-pointer"
                  >
                    <option value="Fenrir">Fenrir (Deep Hype Club MC)</option>
                    <option value="Puck">Puck (Fast High-Energy)</option>
                    <option value="Zephyr">Zephyr (Punchy Modern)</option>
                    <option value="Kore">Kore (Club Diva Vocal)</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-neutral-300 block mb-1.5">
                    Gaya Delivery:
                  </label>
                  <select
                    value={voiceStyle}
                    onChange={(e) => setVoiceStyle(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-neutral-100 focus:outline-none cursor-pointer"
                  >
                    <option value="Hype club DJ MC, energetic shoutout">Energetic Club MC</option>
                    <option value="Heavy bass drop announcer, dramatic punch">Dramatic 808 Announcer</option>
                    <option value="Excited festival DJ shouting to the crowd">Festival Crowd Shouter</option>
                  </select>
                </div>
              </div>

              {voiceStatus && (
                <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-3 text-xs text-amber-300 flex items-center justify-between">
                  <span>{voiceStatus}</span>
                  <button
                    type="button"
                    onClick={() => djEngine.triggerVoiceDrop()}
                    className="text-xs font-bold text-amber-400 hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <Volume2 className="w-3.5 h-3.5" /> Test Play
                  </button>
                </div>
              )}

              <button
                type="button"
                onClick={handleGenerateVoice}
                disabled={isGeneratingVoice}
                className="w-full py-3 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-neutral-950 font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg shadow-amber-500/20"
              >
                {isGeneratingVoice ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Generating Suara MC dengan Gemini TTS...
                  </>
                ) : (
                  <>
                    <Mic className="w-4 h-4" />
                    Generate & Pasang ke Tombol MC DROP
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
