import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Initialize Google GenAI client (Server-side only)
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

// Default pre-crafted preset beat blueprints (used as instant templates or fallback)
const DEFAULT_PRESETS: Record<string, any> = {
  jedag_jedug: {
    title: 'Jedag Jedug Mengkane Bass Boost',
    genre: 'Jedag Jedug Indonesia',
    bpm: 138,
    key: 'F Minor',
    synthStyle: 'funkot_lead',
    bassStyle: 'sub_808',
    sidechainIntensity: 0.9,
    drumPattern: {
      kick: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1],
      snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
      clap: [0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1, 0],
      hihat: [0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1, 1],
      percussion: [0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1],
    },
    chords: [
      [174.61, 207.65, 261.63], // Fm
      [155.56, 196.0, 233.08],  // Eb
      [138.59, 174.61, 207.65], // Db
      [130.81, 164.81, 196.0],  // C
    ],
    melodyNotes: [
      349.23, 0, 349.23, 392.0, 415.3, 0, 392.0, 349.23,
      311.13, 0, 349.23, 0, 261.63, 0, 311.13, 349.23,
    ],
    basslineNotes: [
      87.31, 87.31, 0, 87.31, 87.31, 0, 87.31, 87.31,
      77.78, 77.78, 0, 77.78, 69.3, 69.3, 65.41, 65.41,
    ],
    djShoutout: "DJ on the mix! Jedag jedug party, let's drop the bass!",
    mashupTips: 'Cut the low EQ on Deck B (your song) around the drop. Let the Jedag-Jedug 808 sub kick carry the low end while keeping the vocal crisp.',
    mashupCueTime: 16,
    dropTimingSeconds: 14,
  },
  funkot_breakbeat: {
    title: 'Funkot Kota & Breakbeat Remix',
    genre: 'Funkot / Breakbeat',
    bpm: 145,
    key: 'A Minor',
    synthStyle: 'acid_lead',
    bassStyle: 'funkot_donk',
    sidechainIntensity: 0.85,
    drumPattern: {
      kick: [1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 1, 0],
      snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1],
      clap: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
      hihat: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      percussion: [0, 1, 0, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0],
    },
    chords: [
      [220.0, 261.63, 329.63], // Am
      [174.61, 220.0, 261.63], // F
      [196.0, 246.94, 293.66], // G
      [164.81, 207.65, 246.94], // E
    ],
    melodyNotes: [
      440.0, 523.25, 440.0, 0, 659.25, 587.33, 523.25, 440.0,
      392.0, 440.0, 523.25, 0, 440.0, 0, 392.0, 329.63,
    ],
    basslineNotes: [
      110.0, 0, 110.0, 110.0, 0, 110.0, 0, 110.0,
      87.31, 0, 87.31, 0, 98.0, 0, 82.41, 110.0,
    ],
    djShoutout: "Satu Indonesia goyang! Funkot volume max!",
    mashupTips: 'Sync tempo at 145 BPM. Use the High-Pass Filter sweep on your song right before the breakbeat drop.',
    mashupCueTime: 12,
    dropTimingSeconds: 16,
  },
  club_edm: {
    title: 'Festival Mainstage Anthem',
    genre: 'EDM Big Room / Bounce',
    bpm: 128,
    key: 'G Minor',
    synthStyle: 'saw_anthem',
    bassStyle: 'slap_bounce',
    sidechainIntensity: 0.8,
    drumPattern: {
      kick: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
      snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
      clap: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
      hihat: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0],
      percussion: [0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1],
    },
    chords: [
      [196.0, 233.08, 293.66], // Gm
      [155.56, 196.0, 233.08],  // Eb
      [174.61, 220.0, 261.63], // F
      [146.83, 174.61, 220.0],  // Dm
    ],
    melodyNotes: [
      392.0, 392.0, 587.33, 523.25, 466.16, 392.0, 0, 349.23,
      392.0, 0, 466.16, 523.25, 587.33, 0, 698.46, 587.33,
    ],
    basslineNotes: [
      98.0, 98.0, 0, 98.0, 77.78, 77.78, 0, 77.78,
      87.31, 87.31, 0, 87.31, 73.42, 73.42, 0, 73.42,
    ],
    djShoutout: 'Make some noise! 3, 2, 1, JUMP!',
    mashupTips: 'Loop the intro 8 bars of your song, build up the snare roll, and slam crossfader to center at the drop!',
    mashupCueTime: 15,
    dropTimingSeconds: 15,
  },
  cyber_club: {
    title: 'Neon Cyber Drift & Phonk Drop',
    genre: 'Cyber Phonk / Club Bounce',
    bpm: 140,
    key: 'C Minor',
    synthStyle: 'acid_lead',
    bassStyle: 'sub_808',
    sidechainIntensity: 0.95,
    drumPattern: {
      kick: [1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0, 0, 0],
      snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
      clap: [0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1, 0],
      hihat: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      percussion: [0, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 0, 0, 1, 1, 0],
    },
    chords: [
      [130.81, 155.56, 196.0],  // Cm
      [116.54, 138.59, 174.61], // Bbm
      [103.83, 130.81, 155.56], // Ab
      [123.47, 146.83, 185.0],  // B
    ],
    melodyNotes: [
      261.63, 0, 311.13, 0, 392.0, 370.0, 311.13, 0,
      261.63, 293.66, 311.13, 0, 392.0, 0, 466.16, 523.25,
    ],
    basslineNotes: [
      65.41, 65.41, 0, 65.41, 58.27, 58.27, 0, 58.27,
      51.91, 51.91, 0, 51.91, 61.74, 61.74, 0, 65.41,
    ],
    djShoutout: "Night city bass, ready to ignite!",
    mashupTips: 'Apply Reverb and Filter sweep to the uploaded track vocal while letting the deep 808 sub ride underneath.',
    mashupCueTime: 14,
    dropTimingSeconds: 14,
  },
  koplo_kendang: {
    title: 'Koplo Jedag Kendang Bass Remix',
    genre: 'Koplo DJ Nusantara',
    bpm: 136,
    key: 'D Minor',
    synthStyle: 'funkot_lead',
    bassStyle: 'sub_808',
    sidechainIntensity: 0.9,
    drumPattern: {
      kick: [1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 1, 0],
      snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
      clap: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
      hihat: [0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1, 1],
      percussion: [0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 0, 1], // Kendang Tak/Tung groove
    },
    chords: [
      [146.83, 174.61, 220.0],  // Dm
      [130.81, 164.81, 196.0],  // C
      [116.54, 146.83, 174.61], // Bb
      [110.0, 138.59, 164.81],  // A
    ],
    melodyNotes: [
      293.66, 329.63, 349.23, 0, 440.0, 392.0, 349.23, 329.63,
      293.66, 0, 349.23, 440.0, 523.25, 440.0, 392.0, 349.23,
    ],
    basslineNotes: [
      73.42, 73.42, 0, 73.42, 65.41, 65.41, 0, 65.41,
      58.27, 58.27, 0, 58.27, 55.0, 55.0, 65.41, 73.42,
    ],
    djShoutout: "Tarik sis, semongko! Kendang Jedag-Jedug live!",
    mashupTips: 'Aktifkan Vocal Isolator (Acapella Mode) pada lagu Anda agar vokal menyatu di atas kendang & 808 kick tanpa bentrok drum.',
    mashupCueTime: 16,
    dropTimingSeconds: 15,
  },
  slow_bass_santai: {
    title: 'Slow Bass Glitch Santai',
    genre: 'Slow Bass / Chill Jedag',
    bpm: 122,
    key: 'E Minor',
    synthStyle: 'pluck_drop',
    bassStyle: 'sub_808',
    sidechainIntensity: 0.95,
    drumPattern: {
      kick: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1],
      snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
      clap: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
      hihat: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0],
      percussion: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0, 0],
    },
    chords: [
      [164.81, 196.0, 246.94],  // Em
      [130.81, 164.81, 196.0],  // C
      [146.83, 185.0, 220.0],   // D
      [123.47, 146.83, 185.0],  // Bm
    ],
    melodyNotes: [
      329.63, 0, 392.0, 0, 493.88, 440.0, 392.0, 0,
      329.63, 369.99, 392.0, 0, 440.0, 0, 329.63, 0,
    ],
    basslineNotes: [
      82.41, 82.41, 0, 82.41, 65.41, 65.41, 0, 65.41,
      73.42, 73.42, 0, 73.42, 61.74, 61.74, 73.42, 82.41,
    ],
    djShoutout: "Slow bass santai, nikmati alunan malam...",
    mashupTips: 'Gunakan reverb dan potong Low EQ lagu saat drop untuk efek slow bass mengambang yang syahdu.',
    mashupCueTime: 12,
    dropTimingSeconds: 12,
  },
};

// API Endpoint: Generate DJ Beat Arrangement Plan
app.post('/api/dj/generate-plan', async (req, res) => {
  const { genre, prompt, bpm, songTitle, uploadedTrackDuration, onlyPreset } = req.body;
  const basePresetKey = genre || 'jedag_jedug';
  const fallbackPlan = DEFAULT_PRESETS[basePresetKey] || DEFAULT_PRESETS.jedag_jedug;

  // If user only requests preset switch or has no custom prompt, serve curated preset with 0 API quota used
  if (onlyPreset || !prompt || prompt.trim() === '') {
    return res.json({
      success: true,
      source: 'preset',
      plan: {
        ...fallbackPlan,
        title: songTitle ? `${fallbackPlan.genre} X ${songTitle}` : fallbackPlan.title,
        bpm: bpm ? Number(bpm) : fallbackPlan.bpm,
      },
    });
  }

  // If Gemini API Key is not set
  if (!process.env.GEMINI_API_KEY) {
    return res.json({
      success: true,
      source: 'preset',
      plan: {
        ...fallbackPlan,
        title: songTitle ? `DJ Remix: ${songTitle}` : fallbackPlan.title,
        bpm: bpm ? Number(bpm) : fallbackPlan.bpm,
      },
    });
  }

  try {
    const userPrompt = `You are a world-class Electronic DJ and Indonesian Club Music Producer specializing in authentic DJ remixes (Jedag-Jedug Mengkane, Funkot Breakbeat Kota, Koplo Kendang DJ, Slow Bass Glitch, and Festival EDM).

The user is mixing this DJ beat with their uploaded song:
- Uploaded Song Title: "${songTitle || 'User Uploaded Track'}"
- Uploaded Song Duration: ${uploadedTrackDuration ? Math.round(uploadedTrackDuration) + ' seconds' : 'Unknown'}
- User Request / Vibe: "${prompt}"
- Selected Style: ${genre || 'Jedag Jedug'}
- Target BPM: ${bpm || fallbackPlan.bpm}

Output a strictly valid JSON object adhering to this structure:
{
  "title": string (catchy DJ remix title mentioning the song, e.g. "DJ Jedag Jedug Mengkane X ${songTitle || 'Track'}"),
  "genre": string,
  "bpm": number (between 120 and 160),
  "key": string (musical key, e.g. "F Minor", "G Minor", "D Minor"),
  "synthStyle": "funkot_lead" | "acid_lead" | "saw_anthem" | "pluck_drop",
  "bassStyle": "sub_808" | "slap_bounce" | "funkot_donk" | "reese",
  "sidechainIntensity": number (between 0.75 and 1.0),
  "drumPattern": {
    "kick": array of 16 integers (0 or 1),
    "snare": array of 16 integers (0 or 1),
    "clap": array of 16 integers (0 or 1),
    "hihat": array of 16 integers (0 or 1),
    "percussion": array of 16 integers (0 or 1)
  },
  "melodyNotes": array of 16 numbers (frequencies in Hz, or 0 for rest),
  "basslineNotes": array of 16 numbers (frequencies in Hz, between 40Hz and 130Hz, or 0 for rest),
  "djShoutout": string,
  "mashupTips": string,
  "mashupCueTime": number,
  "dropTimingSeconds": number
}`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: userPrompt,
      config: {
        responseMimeType: 'application/json',
      },
    });

    const responseText = response.text || '';
    let parsedPlan;
    try {
      parsedPlan = JSON.parse(responseText);
    } catch {
      parsedPlan = fallbackPlan;
    }

    const validatedPlan = {
      title: parsedPlan.title || fallbackPlan.title,
      genre: parsedPlan.genre || fallbackPlan.genre,
      bpm: Number(parsedPlan.bpm) || fallbackPlan.bpm,
      key: parsedPlan.key || fallbackPlan.key,
      synthStyle: parsedPlan.synthStyle || fallbackPlan.synthStyle,
      bassStyle: parsedPlan.bassStyle || fallbackPlan.bassStyle,
      sidechainIntensity: Number(parsedPlan.sidechainIntensity) || fallbackPlan.sidechainIntensity,
      drumPattern: parsedPlan.drumPattern?.kick ? parsedPlan.drumPattern : fallbackPlan.drumPattern,
      melodyNotes: Array.isArray(parsedPlan.melodyNotes) && parsedPlan.melodyNotes.length === 16 ? parsedPlan.melodyNotes : fallbackPlan.melodyNotes,
      basslineNotes: Array.isArray(parsedPlan.basslineNotes) && parsedPlan.basslineNotes.length === 16 ? parsedPlan.basslineNotes : fallbackPlan.basslineNotes,
      chords: fallbackPlan.chords,
      djShoutout: parsedPlan.djShoutout || fallbackPlan.djShoutout,
      mashupTips: parsedPlan.mashupTips || fallbackPlan.mashupTips,
      mashupCueTime: Number(parsedPlan.mashupCueTime) || fallbackPlan.mashupCueTime,
      dropTimingSeconds: Number(parsedPlan.dropTimingSeconds) || fallbackPlan.dropTimingSeconds,
    };

    return res.json({
      success: true,
      source: 'gemini',
      plan: validatedPlan,
    });
  } catch (err: any) {
    // Quota reached or transient error: log warning and serve smart algorithmic plan smoothly
    console.warn('Gemini 3.8 Flash quota reached or rate-limited. Synthesizing smart DJ plan procedurally:', err?.status || err?.message || 'Quota limit');

    // Procedural smart variation based on prompt & songTitle
    const customTitle = songTitle
      ? `DJ ${fallbackPlan.genre} X ${songTitle} (VIP Mix)`
      : `DJ ${fallbackPlan.genre} Remix VIP`;

    const smartProceduralPlan = {
      ...fallbackPlan,
      title: customTitle,
      bpm: bpm ? Number(bpm) : fallbackPlan.bpm,
      djShoutout: songTitle
        ? `DJ on the mix! Special remix untuk ${songTitle}, 3, 2, 1, DROP!`
        : fallbackPlan.djShoutout,
      mashupTips: `Aktifkan Vocal Isolator (Acapella Mode) pada lagu ${songTitle || 'Anda'} agar vokal merdu tidak bentrok dengan 808 Sub Kick saat drop.`,
    };

    return res.json({
      success: true,
      source: 'smart-engine',
      isQuotaExceeded: true,
      plan: smartProceduralPlan,
      notice: 'Menggunakan Smart DJ Engine lokal (Quota Gemini Free Tier harian tercapai, mixing tetap aktif 100%).',
    });
  }
});

// API Endpoint: Generate DJ MC Voice Drop / Shoutout using Gemini TTS
app.post('/api/dj/generate-voice-drop', async (req, res) => {
  const { text, voiceName, style } = req.body;
  const promptText = text || 'Yo! Are you ready for the drop? Put your hands up!';
  const selectedVoice = voiceName || 'Fenrir';

  if (!process.env.GEMINI_API_KEY) {
    return res.json({
      success: false,
      isQuotaExceeded: true,
      error: 'Fitur MC voice drop memerlukan API Key. Soundboard bawaan tetap aktif 100%!',
    });
  }

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash-lite-tts',
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: promptText,
              speechMetadata: {
                style: style || 'Hyped EDM club MC shoutout, energetic punchy delivery',
              },
            },
          ],
        },
      ],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: selectedVoice },
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

    if (!base64Audio) {
      throw new Error('No audio data returned by Gemini TTS');
    }

    return res.json({
      success: true,
      audioBase64: base64Audio,
      mimeType: 'audio/wav',
      text: promptText,
    });
  } catch (error: any) {
    console.warn('Gemini TTS voice drop quota reached or rate-limited:', error?.status || error?.message);
    return res.json({
      success: false,
      isQuotaExceeded: true,
      error: 'Batas quota harian Gemini Free Tier tercapai. Tombol Soundboard (AIRHORN, SIREN, LASER, SPINBACK, 808 BOOM, dan ANGGUK-ANGGUK) tetap berfungsi penuh!',
    });
  }
});

// API Endpoint: Analyze Uploaded Song for DJ Mashup
app.post('/api/dj/analyze-audio', async (req, res) => {
  const { fileName, estimatedBpm, duration } = req.body;

  const defaultAnalysis = {
    recommendedGenre: 'Jedag Jedug Indonesia',
    targetBpm: estimatedBpm || 135,
    eqTips: 'Aktifkan Vocal Isolator (Acapella Mode) dan potong low bass pada lagu saat drop agar sub 808 tidak bentrok.',
    transitionGuide: 'Gunakan High-Pass filter sweep 4 bar sebelum drop, lalu tekan Auto Mashup atau Angguk-Angguk.',
    suggestedHypeDrop: 'Persiapan... 3, 2, 1, Jedag-Jedug!',
  };

  if (!process.env.GEMINI_API_KEY) {
    return res.json({
      success: true,
      analysis: defaultAnalysis,
    });
  }

  try {
    const analysisPrompt = `A DJ is preparing to mix an uploaded song into a DJ set.
Song file name: "${fileName || 'uploaded_song.mp3'}"
Estimated duration: ${Math.round(duration || 180)} seconds
Detected BPM: ${estimatedBpm || 128} BPM.

Provide actionable DJ mixing instructions in Indonesian:
1. Recommended DJ Beat Genre to mix with (Jedag Jedug, Funkot, Festival EDM, or Koplo).
2. The key frequency zones to EQ cut (e.g. Bass Kill at drop, Vocal Isolator).
3. The exact bar/time to initiate transition.
4. Suggested hype drop phrase.

Return JSON:
{
  "recommendedGenre": string,
  "targetBpm": number,
  "eqTips": string,
  "transitionGuide": string,
  "suggestedHypeDrop": string
}`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: analysisPrompt,
      config: {
        responseMimeType: 'application/json',
      },
    });

    const parsed = JSON.parse(response.text || '{}');
    return res.json({
      success: true,
      analysis: {
        ...defaultAnalysis,
        ...parsed,
      },
    });
  } catch (err: any) {
    console.warn('Gemini analysis rate-limited or quota reached, serving smart rule-based analysis:', err?.message);
    return res.json({
      success: true,
      isQuotaExceeded: true,
      analysis: defaultAnalysis,
    });
  }
});

// API Endpoint: Serve Angguk-Angguk MP3 audio clip (from local cache or remote fallback)
app.get('/api/dj/angguk-audio', async (_req, res) => {
  try {
    const localPath = path.resolve(__dirname, 'public', 'audio', 'angguk-angguk.mp3');
    const fs = await import('fs');
    if (fs.existsSync(localPath)) {
      res.setHeader('Content-Type', 'audio/mpeg');
      return fs.createReadStream(localPath).pipe(res);
    }

    // Fallback fetch from remote URL
    const remoteUrl = 'https://mp3tourl.com/audio/1792696345762-3ba5066a-cdb0-4170-8d00-b86e7bf64bb3.mp3';
    const fetchRes = await fetch(remoteUrl);
    if (!fetchRes.ok) {
      throw new Error(`Failed to fetch audio: ${fetchRes.statusText}`);
    }
    const arrayBuffer = await fetchRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Save locally
    try {
      fs.mkdirSync(path.dirname(localPath), { recursive: true });
      fs.writeFileSync(localPath, buffer);
    } catch {}

    res.setHeader('Content-Type', 'audio/mpeg');
    return res.send(buffer);
  } catch (err: any) {
    console.error('Error serving angguk audio:', err);
    return res.status(500).json({ error: 'Failed to retrieve audio' });
  }
});

// Serve frontend with Vite in dev, static files in production
async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
