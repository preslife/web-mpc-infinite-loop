// Generate synthetic drum samples using Web Audio API
export class SampleGenerator {
  private audioContext: AudioContext;

  constructor(audioContext: AudioContext) {
    this.audioContext = audioContext;
  }

  // Generate a kick drum sample
  generateKick(frequency: number = 60, duration: number = 0.5): AudioBuffer {
    const sampleRate = this.audioContext.sampleRate;
    const frameCount = sampleRate * duration;
    const buffer = this.audioContext.createBuffer(1, frameCount, sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < frameCount; i++) {
      const t = i / sampleRate;
      
      // Exponentially decaying sine wave for kick
      const envelope = Math.exp(-t * 30);
      const freq = frequency * Math.exp(-t * 40); // Pitch envelope
      const osc = Math.sin(2 * Math.PI * freq * t);
      
      // Add some click at the beginning
      const click = t < 0.01 ? Math.random() * 0.1 : 0;
      
      data[i] = (osc * envelope * 0.8) + click;
    }

    return buffer;
  }

  // Generate a snare drum sample
  generateSnare(duration: number = 0.2): AudioBuffer {
    const sampleRate = this.audioContext.sampleRate;
    const frameCount = sampleRate * duration;
    const buffer = this.audioContext.createBuffer(1, frameCount, sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < frameCount; i++) {
      const t = i / sampleRate;
      
      // Exponentially decaying noise + tone
      const envelope = Math.exp(-t * 20);
      
      // High-passed noise for snare buzz
      const noise = (Math.random() * 2 - 1) * envelope;
      
      // Tonal component around 200Hz
      const tone = Math.sin(2 * Math.PI * 200 * t) * envelope * 0.3;
      
      data[i] = (noise * 0.7 + tone) * 0.6;
    }

    return buffer;
  }

  // Generate a hi-hat sample
  generateHiHat(duration: number = 0.1, closed: boolean = true): AudioBuffer {
    const sampleRate = this.audioContext.sampleRate;
    const frameCount = sampleRate * duration;
    const buffer = this.audioContext.createBuffer(1, frameCount, sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < frameCount; i++) {
      const t = i / sampleRate;
      
      // Very fast decay for closed, slower for open
      const decayRate = closed ? 80 : 20;
      const envelope = Math.exp(-t * decayRate);
      
      // High-frequency filtered noise
      let noise = 0;
      for (let j = 0; j < 10; j++) {
        const freq = 8000 + (j * 1000);
        noise += Math.sin(2 * Math.PI * freq * t) * Math.random();
      }
      
      data[i] = noise * envelope * 0.1;
    }

    return buffer;
  }

  // Generate an open hi-hat
  generateOpenHiHat(): AudioBuffer {
    return this.generateHiHat(0.3, false);
  }

  // Generate a crash cymbal
  generateCrash(duration: number = 1.0): AudioBuffer {
    const sampleRate = this.audioContext.sampleRate;
    const frameCount = sampleRate * duration;
    const buffer = this.audioContext.createBuffer(1, frameCount, sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < frameCount; i++) {
      const t = i / sampleRate;
      
      // Slow decay
      const envelope = Math.exp(-t * 3);
      
      // Complex harmonics for metallic sound
      let signal = 0;
      const fundamentals = [440, 554, 659, 880, 1318];
      fundamentals.forEach(freq => {
        signal += Math.sin(2 * Math.PI * freq * t) * (Math.random() * 0.5 + 0.5);
        signal += Math.sin(2 * Math.PI * freq * 1.5 * t) * (Math.random() * 0.3);
      });
      
      data[i] = signal * envelope * 0.15;
    }

    return buffer;
  }

  // Generate a percussion sound
  generatePerc(frequency: number = 800, duration: number = 0.15): AudioBuffer {
    const sampleRate = this.audioContext.sampleRate;
    const frameCount = sampleRate * duration;
    const buffer = this.audioContext.createBuffer(1, frameCount, sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < frameCount; i++) {
      const t = i / sampleRate;
      
      const envelope = Math.exp(-t * 15);
      const osc = Math.sin(2 * Math.PI * frequency * t);
      const fm = Math.sin(2 * Math.PI * frequency * 2 * t) * 0.3; // FM synthesis
      
      data[i] = (osc + fm) * envelope * 0.4;
    }

    return buffer;
  }
}

export const defaultSampleConfigs = [
  { name: 'Kick', generator: 'kick', params: [60, 0.5] },
  { name: 'Snare', generator: 'snare', params: [0.2] },
  { name: 'Hi-Hat Closed', generator: 'hiHat', params: [0.1, true] },
  { name: 'Hi-Hat Open', generator: 'openHiHat', params: [] },
  { name: 'Crash', generator: 'crash', params: [1.0] },
  { name: 'Perc High', generator: 'perc', params: [1200, 0.12] },
  { name: 'Perc Mid', generator: 'perc', params: [800, 0.15] },
  { name: 'Perc Low', generator: 'perc', params: [400, 0.18] },
];