import lamejs from 'lamejs';

export class MP3Encoder {
  private mp3encoder: any;
  private sampleRate: number;
  private channels: number;

  constructor(sampleRate: number = 44100, channels: number = 2, bitRate: number = 128) {
    this.sampleRate = sampleRate;
    this.channels = channels;
    this.mp3encoder = new lamejs.Mp3Encoder(channels, sampleRate, bitRate);
  }

  encodeBuffer(audioBuffer: AudioBuffer): Blob {
    const leftChannel = audioBuffer.getChannelData(0);
    const rightChannel = audioBuffer.numberOfChannels > 1 ? 
      audioBuffer.getChannelData(1) : 
      audioBuffer.getChannelData(0);

    // Convert float32 to int16
    const left16 = this.floatTo16BitPCM(leftChannel);
    const right16 = this.floatTo16BitPCM(rightChannel);

    const mp3Data: Int8Array[] = [];
    const blockSize = 1152; // samples per mp3 frame

    for (let i = 0; i < left16.length; i += blockSize) {
      const leftBlock = left16.subarray(i, i + blockSize);
      const rightBlock = right16.subarray(i, i + blockSize);
      
      const mp3buf = this.mp3encoder.encodeBuffer(leftBlock, rightBlock);
      if (mp3buf.length > 0) {
        mp3Data.push(mp3buf);
      }
    }

    // Flush remaining data
    const mp3buf = this.mp3encoder.flush();
    if (mp3buf.length > 0) {
      mp3Data.push(mp3buf);
    }

    // Combine all MP3 data
    const totalLength = mp3Data.reduce((sum, data) => sum + data.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    
    mp3Data.forEach(data => {
      result.set(data, offset);
      offset += data.length;
    });

    return new Blob([result], { type: 'audio/mp3' });
  }

  private floatTo16BitPCM(input: Float32Array): Int16Array {
    const output = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
      const sample = Math.max(-1, Math.min(1, input[i]));
      output[i] = sample * 0x7FFF;
    }
    return output;
  }
}