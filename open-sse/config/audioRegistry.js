/**
 * Audio Provider Registry
 * 
 * Defines providers that support audio endpoints:
 * - /v1/audio/speech (TTS - Text to Speech)
 * - /v1/audio/transcriptions (STT - Speech to Text)
 * - /v1/audio/translations (Audio Translation)
 * 
 * API keys are stored in the same provider credentials system,
 * keyed by provider ID (e.g. "openai").
 */

export const AUDIO_PROVIDERS = {
  openai: {
    id: "openai",
    tts: {
      baseUrl: "https://api.openai.com/v1/audio/speech",
      models: [
        { id: "tts-1", name: "TTS-1" },
        { id: "tts-1-hd", name: "TTS-1 HD" },
        { id: "gpt-4o-mini-tts", name: "GPT-4o Mini TTS" },
      ],
      voices: ["alloy", "ash", "coral", "echo", "fable", "onyx", "nova", "sage", "shimmer"],
    },
    stt: {
      baseUrl: "https://api.openai.com/v1/audio/transcriptions",
      models: [
        { id: "whisper-1", name: "Whisper-1" },
        { id: "gpt-4o-transcribe", name: "GPT-4o Transcribe" },
        { id: "gpt-4o-mini-transcribe", name: "GPT-4o Mini Transcribe" },
      ],
    },
    authType: "apikey",
    authHeader: "bearer",
  },

  groq: {
    id: "groq",
    stt: {
      baseUrl: "https://api.groq.com/openai/v1/audio/transcriptions",
      models: [
        { id: "whisper-large-v3", name: "Whisper Large V3" },
        { id: "whisper-large-v3-turbo", name: "Whisper Large V3 Turbo" },
        { id: "distil-whisper-large-v3-en", name: "Distil Whisper Large V3 EN" },
      ],
    },
    authType: "apikey",
    authHeader: "bearer",
  },

  together: {
    id: "together",
    tts: {
      baseUrl: "https://api.together.xyz/v1/audio/speech",
      models: [
        { id: "cartesia/sonic", name: "Cartesia Sonic" },
      ],
      voices: ["alloy", "echo", "fable", "onyx", "nova", "shimmer"],
    },
    authType: "apikey",
    authHeader: "bearer",
  },

  deepseek: {
    id: "deepseek",
    tts: {
      baseUrl: "https://api.deepseek.com/v1/audio/speech",
      models: [
        { id: "deepseek-tts-1", name: "DeepSeek TTS-1" },
      ],
      voices: [],
    },
    authType: "apikey",
    authHeader: "bearer",
  },
};

/**
 * Get audio provider config by ID
 */
export function getAudioProvider(providerId) {
  return AUDIO_PROVIDERS[providerId] || null;
}

/**
 * Get all TTS models as a flat list
 */
export function getAllTTSModels() {
  const models = [];
  for (const [providerId, config] of Object.entries(AUDIO_PROVIDERS)) {
    if (!config.tts) continue;
    for (const model of config.tts.models) {
      models.push({
        id: `${providerId}/${model.id}`,
        name: model.name,
        provider: providerId,
        voices: config.tts.voices || [],
      });
    }
  }
  return models;
}

/**
 * Get all STT models as a flat list
 */
export function getAllSTTModels() {
  const models = [];
  for (const [providerId, config] of Object.entries(AUDIO_PROVIDERS)) {
    if (!config.stt) continue;
    for (const model of config.stt.models) {
      models.push({
        id: `${providerId}/${model.id}`,
        name: model.name,
        provider: providerId,
      });
    }
  }
  return models;
}

/**
 * Get all audio models (TTS + STT) as a flat list
 */
export function getAllAudioModels() {
  return [
    ...getAllTTSModels().map(m => ({ ...m, subtype: "tts" })),
    ...getAllSTTModels().map(m => ({ ...m, subtype: "stt" })),
  ];
}
