// lib/transcribeVoice.js
//
// Turns an audio recording of the artisan describing their product into
// text, using Gemini's audio understanding (Gemini accepts audio the same
// way it accepts images — as inline base64 data on a generateContent call).
//
// NOTE ON THE ORIGINAL PLAN: the original plan was to do speech-to-text
// in the browser later with the Web Speech API, and treat this function
// as a typed-text placeholder until then. That's been replaced — this
// hackathon needs audio input to be mandatory right now, and Gemini can
// transcribe audio directly, so we use that instead of waiting on a
// frontend. If you later add real browser-based speech-to-text, you can
// swap this function's internals for that transcript and nothing else
// in the pipeline (generateListing, runFullPipeline) needs to change.

const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const MODEL_NAME = 'gemini-3.5-flash-lite';

// Maps common audio extensions to the MIME type Gemini expects.
const MIME_TYPES = {
  '.mp3': 'audio/mp3',
  '.wav': 'audio/wav',
  '.aiff': 'audio/aiff',
  '.aif': 'audio/aiff',
  '.aac': 'audio/aac',
  '.ogg': 'audio/ogg',
  '.flac': 'audio/flac',
  '.m4a': 'audio/mp4',
  '.webm': 'audio/webm',
};

/**
 * Reads an audio file and turns it into a Gemini-ready { mimeType, base64Data } part.
 */
function audioToBase64Part(audioPath) {
  if (!fs.existsSync(audioPath)) {
    throw new Error(`transcribeVoice: audio file not found at "${audioPath}"`);
  }
  const ext = path.extname(audioPath).toLowerCase();
  const mimeType = MIME_TYPES[ext];
  if (!mimeType) {
    throw new Error(
      `transcribeVoice: unsupported audio format "${ext}". Supported: ${Object.keys(MIME_TYPES).join(', ')}`
    );
  }
  const base64Data = fs.readFileSync(audioPath).toString('base64');
  return { mimeType, base64Data };
}

/**
 * Transcribes a spoken product description from an audio file.
 *
 * @param {string} audioPath - path to the audio recording.
 * @param {string} [language] - optional hint, e.g. "Hindi", "Marathi",
 *   "Tamil". Helps Gemini transcribe more accurately if you know the
 *   language in advance; leave it out and Gemini will auto-detect.
 * @returns {Promise<string>} - the transcript, in the original language/script spoken.
 */
async function transcribeVoice(audioPath, language) {
  if (!audioPath) {
    throw new Error('transcribeVoice: audioPath is required (audio input is mandatory)');
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'transcribeVoice: GEMINI_API_KEY is not set. Copy .env.example to .env and add your key.'
    );
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: MODEL_NAME });

  const { mimeType, base64Data } = audioToBase64Part(audioPath);

  const prompt = `
Transcribe the following audio recording exactly as spoken.
${language ? `The speaker is likely speaking in ${language}.` : 'The speaker may be using a regional Indian language, or a mix of languages.'}
Write the transcript in its original language and script (do NOT translate it).
Return ONLY the transcript text — no labels, no commentary, no quotation marks around it.
`.trim();

  const result = await model.generateContent([
    { text: prompt },
    { inlineData: { mimeType, data: base64Data } },
  ]);

  const transcript = result.response.text().trim();

  if (!transcript) {
    throw new Error('transcribeVoice: Gemini returned an empty transcript');
  }

  return transcript;
}

module.exports = { transcribeVoice };
