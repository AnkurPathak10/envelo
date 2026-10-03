// Original two-note ringtone, generated locally (no third-party audio asset).
const fs = require('node:fs');
const path = require('node:path');
const rate = 16000;
const seconds = 3;
const bytes = Buffer.alloc(44 + rate * seconds * 2);
bytes.write('RIFF');
bytes.writeUInt32LE(bytes.length - 8, 4);
bytes.write('WAVEfmt ', 8);
bytes.writeUInt32LE(16, 16);
bytes.writeUInt16LE(1, 20);
bytes.writeUInt16LE(1, 22);
bytes.writeUInt32LE(rate, 24);
bytes.writeUInt32LE(rate * 2, 28);
bytes.writeUInt16LE(2, 32);
bytes.writeUInt16LE(16, 34);
bytes.write('data', 36);
bytes.writeUInt32LE(bytes.length - 44, 40);
for (let sample = 0; sample < rate * seconds; sample++) {
  const t = sample / rate;
  const note = t < 0.35 ? 523.25 : t >= 0.5 && t < 0.95 ? 659.25 : 0;
  const local = t < 0.35 ? t : t - 0.5;
  const duration = t < 0.35 ? 0.35 : 0.45;
  const envelope = note
    ? Math.max(0, Math.min(1, local / 0.025, (duration - local) / 0.09))
    : 0;
  bytes.writeInt16LE(
    Math.round(5200 * envelope * Math.sin(2 * Math.PI * note * t)),
    44 + sample * 2
  );
}
const directory = path.join(__dirname, '../assets/audio');
fs.mkdirSync(directory, { recursive: true });
fs.writeFileSync(path.join(directory, 'incoming-call.wav'), bytes);
