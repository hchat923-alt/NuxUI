/**
 * Apple iMessage Signature "Swoosh / Whoosh" Sound Synthesizer.
 * Crafted using the Web Audio API with dual-layer synthesis:
 * 1. Filtered white-noise burst for the air displacement whoosh ("shhh").
 * 2. Gliding harmonic sine-wave pop ("whip-up") for the iconic Apple tone.
 * Operates 100% offline, zero latency, zero external asset downloads.
 */

let sharedAudioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  try {
    if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioContextClass) {
        sharedAudioCtx = new AudioContextClass();
      }
    }
    if (sharedAudioCtx && sharedAudioCtx.state === 'suspended') {
      sharedAudioCtx.resume().catch(() => {});
    }
    return sharedAudioCtx;
  } catch {
    return null;
  }
}

// Ensure audio context is ready on first user interaction
if (typeof window !== 'undefined') {
  const unlockAudio = () => {
    const ctx = getAudioContext();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
  };
  window.addEventListener('click', unlockAudio, { once: true, passive: true });
  window.addEventListener('keydown', unlockAudio, { once: true, passive: true });
  window.addEventListener('touchstart', unlockAudio, { once: true, passive: true });
}

export function playAppleSendSound(): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    if (ctx.state === 'suspended') {
      ctx.resume().then(() => playSwooshInternal(ctx)).catch(() => {});
    } else {
      playSwooshInternal(ctx);
    }
  } catch (err) {
    console.warn('Audio playback not supported:', err);
  }
}

function playSwooshInternal(ctx: AudioContext): void {
  const now = ctx.currentTime;

  // Master Gain for pleasant, clearly audible Apple whoosh (volume ~0.26)
  const masterGain = ctx.createGain();
  masterGain.gain.setValueAtTime(0.26, now);
  masterGain.connect(ctx.destination);

  // --- LAYER 1: Air "Whoosh" (Filtered Noise Burst) ---
  const bufferSize = Math.floor(ctx.sampleRate * 0.16); // 160ms of noise
  const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const output = noiseBuffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    output[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.45));
  }

  const whiteNoise = ctx.createBufferSource();
  whiteNoise.buffer = noiseBuffer;

  // Bandpass filter to sculpt the airy whoosh sound
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.Q.setValueAtTime(2.2, now);
  filter.frequency.setValueAtTime(600, now);
  filter.frequency.exponentialRampToValueAtTime(1900, now + 0.10);
  filter.frequency.exponentialRampToValueAtTime(800, now + 0.16);

  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.01, now);
  noiseGain.gain.linearRampToValueAtTime(0.85, now + 0.04);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

  whiteNoise.connect(filter);
  filter.connect(noiseGain);
  noiseGain.connect(masterGain);

  // --- LAYER 2: Melodic Tone Pop (Gliding Harmonic Sine) ---
  const osc = ctx.createOscillator();
  const oscGain = ctx.createGain();

  osc.type = 'sine';
  // Apple iMessage signature pitch curve (rises quickly then resolves)
  osc.frequency.setValueAtTime(420, now);
  osc.frequency.exponentialRampToValueAtTime(920, now + 0.07);
  osc.frequency.exponentialRampToValueAtTime(740, now + 0.14);

  oscGain.gain.setValueAtTime(0.01, now);
  oscGain.gain.linearRampToValueAtTime(0.55, now + 0.025);
  oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

  osc.connect(oscGain);
  oscGain.connect(masterGain);

  // Start both layers
  whiteNoise.start(now);
  whiteNoise.stop(now + 0.17);
  osc.start(now);
  osc.stop(now + 0.15);
}
