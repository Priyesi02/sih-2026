// lib/textToSpeech.js
//
// Converts text into a spoken audio file using Gemini's native
// text-to-speech model — the SAME Gemini API key/SDK already used
// everywhere else in this module, no separate TTS account/billing setup
// needed. It reads back whatever script the input text is written in
// (feed it Hindi text, get Hindi speech, no language config needed).
//
// Gemini's TTS model returns raw PCM audio (no file header), so this
// also wraps that into a standard .wav file so it's actually playable
// by normal audio players/browsers.

const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Confirmed working as of this project's testing. If Google retires
// this (the same thing happened to gemini-2.5-flash-lite — see
// lib/generateListing.js), check https://ai.google.dev/gemini-api/docs/models
// for the current TTS-capable model name and swap it in here.
const MODEL_NAME = 'gemini-2.5-flash-preview-tts';

// One of Gemini's prebuilt voices. Swap this for any other prebuilt
// voice name from Gemini's docs if you want a different tone.
const VOICE_NAME = 'Kore';

const OUTPUT_DIR = path.join(__dirname, '..', 'output');

/**
 * Wraps raw 16-bit PCM audio data in a standard WAV file header so it's
 * playable by normal audio players/browsers (raw PCM has no header and
 * won't play on its own).
 */
function pcmToWav(pcmBuffer, sampleRate, numChannels) {
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = pcmBuffer.length;

  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // fmt chunk size
  header.writeUInt16LE(1, 20); // audio format = 1 (PCM)
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcmBuffer]);
}

/**
 * Parses "audio/L16;codec=pcm;rate=24000" -> 24000. Gemini's TTS output
 * rate has been consistent so far, but parsing it from the response
 * instead of hardcoding it is one less thing to silently break if that
 * ever changes.
 */
function parseSampleRate(mimeType) {
  const match = mimeType.match(/rate=(\d+)/);
  if (!match) {
    throw new Error(`textToSpeech: could not parse sample rate from mimeType "${mimeType}"`);
  }
  return parseInt(match[1], 10);
}

/**
 * Synthesizes speech from text and saves it as a .wav file.
 *
 * @param {string} text - the text to speak (any language/script Gemini can read).
 * @param {string} [outputName] - base filename (without extension) for the saved audio. Defaults to a timestamp.
 * @returns {Promise<string>} - path to the saved .wav file.
 */
async function synthesizeSpeech(text, outputName) {
  if (!text || !text.trim()) {
    throw new Error('textToSpeech: text is required');
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'textToSpeech: GEMINI_API_KEY is not set. Copy .env.example to .env and add your key.'
    );
  }

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: MODEL_NAME });

  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text }] }],
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE_NAME } } },
    },
  });

  const part = result.response.candidates?.[0]?.content?.parts?.[0];
  if (!part?.inlineData?.data) {
    throw new Error('textToSpeech: Gemini response did not include audio data');
  }

  const sampleRate = parseSampleRate(part.inlineData.mimeType);
  const pcmBuffer = Buffer.from(part.inlineData.data, 'base64');
  const wavBuffer = pcmToWav(pcmBuffer, sampleRate, 1);

  const fileName = `${outputName || `speech-${Date.now()}`}.wav`;
  const outputPath = path.join(OUTPUT_DIR, fileName);
  fs.writeFileSync(outputPath, wavBuffer);

  return outputPath;
}

module.exports = { synthesizeSpeech };
