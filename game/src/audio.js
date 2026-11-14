// All sound is synthesized WebAudio — noise bursts and oscillators, no files,
// no network. One AudioContext, one master gain, mute on M. The context is
// created lazily on the first user gesture (browsers block audio before that).
export function createAudio() {
  let ctx = null;
  let master = null;
  let muted = false;
  function ensure() {
    if (ctx) return true;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      return true;
    } catch { return false; }
  }
  function noiseBuffer(seconds) {
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    return buf;
  }
  function burst(dur, freq, gain, type = 'lowpass') {
    if (!ensure() || muted) return;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(dur);
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    src.connect(filter); filter.connect(g); g.connect(master);
    src.start();
  }
  function tone(freq, dur, gain, wave = 'sine', slideTo = 0) {
    if (!ensure() || muted) return;
    const osc = ctx.createOscillator();
    osc.type = wave;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    osc.connect(g); g.connect(master);
    osc.start();
    osc.stop(ctx.currentTime + dur);
  }
  return {
    unlock() { ensure(); },
    setMuted(m) { muted = m; if (master) master.gain.value = m ? 0 : 0.5; },
    shot(kind) {
      if (kind === 'shotgun') { burst(0.22, 900, 0.5); tone(90, 0.16, 0.35, 'triangle', 45); }
      else if (kind === 'smg') { burst(0.09, 1800, 0.32); tone(160, 0.06, 0.2, 'square', 90); }
      else if (kind === 'pistol') { burst(0.12, 1400, 0.35); tone(130, 0.08, 0.22, 'triangle', 70); }
      else { burst(0.14, 1200, 0.42); tone(110, 0.1, 0.28, 'triangle', 55); }
    },
    dry() { tone(1200, 0.04, 0.12, 'square'); },
    reload() { tone(700, 0.05, 0.14, 'square'); setTimeout(() => tone(500, 0.05, 0.14, 'square'), 160); },
    hit() { tone(1900, 0.05, 0.16, 'sine'); },
    kill() { tone(660, 0.09, 0.2, 'sine'); setTimeout(() => tone(990, 0.12, 0.2, 'sine'), 90); },
    step() { burst(0.05, 500, 0.07); },
    beep(final = false) { tone(final ? 1400 : 950, 0.07, 0.18, 'sine'); },
    plantTick() { tone(1100, 0.05, 0.12, 'sine'); },
    explosion() { burst(0.9, 320, 0.8); tone(60, 0.7, 0.5, 'sine', 30); },
    grenadeBeep() { tone(1250, 0.06, 0.14, 'square'); },
    win() { tone(523, 0.16, 0.2, 'sine'); setTimeout(() => tone(784, 0.28, 0.2, 'sine'), 150); },
    lose() { tone(392, 0.2, 0.18, 'sine'); setTimeout(() => tone(262, 0.34, 0.18, 'sine'), 180); },
    buy() { tone(880, 0.07, 0.16, 'sine'); setTimeout(() => tone(1174, 0.1, 0.16, 'sine'), 70); },
  };
}
