import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Download, Music, FileAudio, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { MP3Encoder } from '@/utils/mp3Encoder';

interface PatternStep {
  active: boolean;
  velocity: number;
}

interface Sample {
  buffer: AudioBuffer | null;
  name: string;
  startTime: number;
  endTime: number;
  gateMode: boolean;
}

interface AudioExporterProps {
  patterns: PatternStep[][];
  samples: Sample[];
  bpm: number;
  sequencerLength: number;
  trackVolumes: number[];
  trackMutes: boolean[];
  trackSolos: boolean[];
  masterVolume: number;
  swing: number;
}

export const AudioExporter = ({
  patterns,
  samples,
  bpm,
  sequencerLength,
  trackVolumes,
  trackMutes,
  trackSolos,
  masterVolume,
  swing
}: AudioExporterProps) => {
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportFormat, setExportFormat] = useState<'wav' | 'mp3'>('wav');
  const [exportLength, setExportLength] = useState<'1' | '2' | '4' | '8'>('1');
  const [exportType, setExportType] = useState<'pattern' | 'stems'>('pattern');
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);

  const initializeAudioContext = async () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (audioContextRef.current.state === 'suspended') {
      await audioContextRef.current.resume();
    }
  };

  const renderAudioBuffer = async (durationBars: number): Promise<AudioBuffer> => {
    await initializeAudioContext();
    const audioContext = audioContextRef.current!;
    
    const stepTime = 60 / bpm / 4; // seconds per 16th note
    const barDuration = stepTime * sequencerLength;
    const totalDuration = barDuration * durationBars;
    
    const sampleRate = audioContext.sampleRate;
    const bufferLength = Math.ceil(totalDuration * sampleRate);
    const outputBuffer = audioContext.createBuffer(2, bufferLength, sampleRate);
    
    const leftChannel = outputBuffer.getChannelData(0);
    const rightChannel = outputBuffer.getChannelData(1);
    
    // Process each step
    for (let bar = 0; bar < durationBars; bar++) {
      for (let step = 0; step < sequencerLength; step++) {
        const stepStartTime = (bar * barDuration) + (step * stepTime);
        
        // Apply swing
        const swingAmount = swing / 100;
        const isOffBeat = step % 2 === 1;
        const swingDelay = isOffBeat ? stepTime * swingAmount * 0.1 : 0;
        const actualStepTime = stepStartTime + swingDelay;
        
        const stepStartSample = Math.floor(actualStepTime * sampleRate);
        
        // Check which pads are active for this step
        patterns.forEach((pattern, padIndex) => {
          if (!pattern[step]?.active || !samples[padIndex]?.buffer) return;
          
          // Check mute/solo state
          const shouldPlay = !trackMutes[padIndex] && (trackSolos.every(s => !s) || trackSolos[padIndex]);
          if (!shouldPlay) return;
          
          const sample = samples[padIndex];
          const sampleBuffer = sample.buffer!;
          const velocity = pattern[step].velocity;
          
          // Calculate sample slice
          const sampleDuration = sampleBuffer.duration;
          const startTime = sample.startTime * sampleDuration;
          const endTime = sample.endTime * sampleDuration;
          const sliceStartSample = Math.floor(startTime * sampleRate);
          const sliceEndSample = Math.floor(endTime * sampleRate);
          const sliceLength = sliceEndSample - sliceStartSample;
          
          // Calculate final volume
          const finalVolume = velocity / 127 * (trackVolumes[padIndex] / 100) * masterVolume;
          
          // Mix sample into output buffer
          for (let channel = 0; channel < Math.min(2, sampleBuffer.numberOfChannels); channel++) {
            const sampleData = sampleBuffer.getChannelData(channel);
            const outputChannel = channel === 0 ? leftChannel : rightChannel;
            
            for (let i = 0; i < sliceLength && stepStartSample + i < bufferLength; i++) {
              if (sliceStartSample + i < sampleData.length) {
                outputChannel[stepStartSample + i] += sampleData[sliceStartSample + i] * finalVolume;
              }
            }
          }
          
          // Update progress
          setExportProgress((bar * sequencerLength + step + 1) / (durationBars * sequencerLength) * 80);
        });
      }
    }
    
    return outputBuffer;
  };

  const renderStemBuffers = async (durationBars: number): Promise<{ [key: number]: AudioBuffer }> => {
    await initializeAudioContext();
    const audioContext = audioContextRef.current!;
    
    const stepTime = 60 / bpm / 4;
    const barDuration = stepTime * sequencerLength;
    const totalDuration = barDuration * durationBars;
    
    const sampleRate = audioContext.sampleRate;
    const bufferLength = Math.ceil(totalDuration * sampleRate);
    
    const stemBuffers: { [key: number]: AudioBuffer } = {};
    
    // Create buffer for each active track
    patterns.forEach((pattern, padIndex) => {
      if (!samples[padIndex]?.buffer || !pattern.some(step => step.active)) return;
      
      const stemBuffer = audioContext.createBuffer(2, bufferLength, sampleRate);
      const leftChannel = stemBuffer.getChannelData(0);
      const rightChannel = stemBuffer.getChannelData(1);
      
      // Render this track
      for (let bar = 0; bar < durationBars; bar++) {
        for (let step = 0; step < sequencerLength; step++) {
          if (!pattern[step]?.active) continue;
          
          const stepStartTime = (bar * barDuration) + (step * stepTime);
          const swingAmount = swing / 100;
          const isOffBeat = step % 2 === 1;
          const swingDelay = isOffBeat ? stepTime * swingAmount * 0.1 : 0;
          const actualStepTime = stepStartTime + swingDelay;
          const stepStartSample = Math.floor(actualStepTime * sampleRate);
          
          const sample = samples[padIndex];
          const sampleBuffer = sample.buffer!;
          const velocity = pattern[step].velocity;
          
          const sampleDuration = sampleBuffer.duration;
          const startTime = sample.startTime * sampleDuration;
          const endTime = sample.endTime * sampleDuration;
          const sliceStartSample = Math.floor(startTime * sampleRate);
          const sliceEndSample = Math.floor(endTime * sampleRate);
          const sliceLength = sliceEndSample - sliceStartSample;
          
          const finalVolume = velocity / 127 * (trackVolumes[padIndex] / 100) * masterVolume;
          
          for (let channel = 0; channel < Math.min(2, sampleBuffer.numberOfChannels); channel++) {
            const sampleData = sampleBuffer.getChannelData(channel);
            const outputChannel = channel === 0 ? leftChannel : rightChannel;
            
            for (let i = 0; i < sliceLength && stepStartSample + i < bufferLength; i++) {
              if (sliceStartSample + i < sampleData.length) {
                outputChannel[stepStartSample + i] += sampleData[sliceStartSample + i] * finalVolume;
              }
            }
          }
        }
      }
      
      stemBuffers[padIndex] = stemBuffer;
      setExportProgress((Object.keys(stemBuffers).length / patterns.filter(p => p.some(s => s.active)).length) * 80);
    });
    
    return stemBuffers;
  };

  const audioBufferToWav = (buffer: AudioBuffer): Blob => {
    const length = buffer.length;
    const numberOfChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const arrayBuffer = new ArrayBuffer(44 + length * numberOfChannels * 2);
    const view = new DataView(arrayBuffer);
    
    // WAV header
    const writeString = (offset: number, string: string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };
    
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + length * numberOfChannels * 2, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numberOfChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numberOfChannels * 2, true);
    view.setUint16(32, numberOfChannels * 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, length * numberOfChannels * 2, true);
    
    // Convert float samples to 16-bit PCM
    let offset = 44;
    for (let i = 0; i < length; i++) {
      for (let channel = 0; channel < numberOfChannels; channel++) {
        const sample = Math.max(-1, Math.min(1, buffer.getChannelData(channel)[i]));
        view.setInt16(offset, sample * 0x7FFF, true);
        offset += 2;
      }
    }
    
    return new Blob([arrayBuffer], { type: 'audio/wav' });
  };

  const audioBufferToMp3 = (buffer: AudioBuffer): Blob => {
    const encoder = new MP3Encoder(buffer.sampleRate, buffer.numberOfChannels, 128);
    return encoder.encodeBuffer(buffer);
  };

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const exportAudio = async () => {
    if (!patterns.some(p => p.some(s => s.active))) {
      toast.error('No pattern to export - activate some steps first!');
      return;
    }
    
    if (!samples.some(s => s.buffer)) {
      toast.error('No samples loaded - load samples first!');
      return;
    }
    
    setIsExporting(true);
    setExportProgress(0);
    
    try {
      const durationBars = parseInt(exportLength);
      
      if (exportType === 'pattern') {
        // Export full mix
        const buffer = await renderAudioBuffer(durationBars);
        setExportProgress(90);
        
        const blob = exportFormat === 'mp3' ? audioBufferToMp3(buffer) : audioBufferToWav(buffer);
        setExportProgress(100);
        
        const filename = `pattern-${Date.now()}.${exportFormat}`;
        downloadBlob(blob, filename);
        toast.success(`Pattern exported as ${filename}`);
        
      } else {
        // Export stems
        const stemBuffers = await renderStemBuffers(durationBars);
        setExportProgress(90);
        
        let downloadCount = 0;
        Object.entries(stemBuffers).forEach(([padIndex, buffer]) => {
          const sampleName = samples[parseInt(padIndex)]?.name || `Track_${padIndex}`;
          const blob = exportFormat === 'mp3' ? audioBufferToMp3(buffer) : audioBufferToWav(buffer);
          const filename = `${sampleName}-stem-${Date.now()}.${exportFormat}`;
          setTimeout(() => downloadBlob(blob, filename), downloadCount * 100);
          downloadCount++;
        });
        
        setExportProgress(100);
        toast.success(`Exported ${Object.keys(stemBuffers).length} stems`);
      }
      
    } catch (error) {
      console.error('Export failed:', error);
      toast.error('Export failed - please try again');
    } finally {
      setTimeout(() => {
        setIsExporting(false);
        setExportProgress(0);
      }, 1000);
    }
  };

  return (
    <Card className="w-full bg-gray-900/80 backdrop-blur-md border-purple-500/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-purple-300">
          <FileAudio className="w-5 h-5" />
          Audio Export
        </CardTitle>
        <CardDescription>
          Export your patterns as audio files for use in other software
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm text-gray-300 mb-2 block">Export Type</label>
            <Select value={exportType} onValueChange={(value: 'pattern' | 'stems') => setExportType(value)}>
              <SelectTrigger className="bg-gray-800 border-gray-600">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pattern">
                  <div className="flex items-center gap-2">
                    <Music className="w-4 h-4" />
                    Full Mix
                  </div>
                </SelectItem>
                <SelectItem value="stems">
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4" />
                    Individual Stems
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div>
            <label className="text-sm text-gray-300 mb-2 block">Length</label>
            <Select value={exportLength} onValueChange={(value: '1' | '2' | '4' | '8') => setExportLength(value)}>
              <SelectTrigger className="bg-gray-800 border-gray-600">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1 Bar</SelectItem>
                <SelectItem value="2">2 Bars</SelectItem>
                <SelectItem value="4">4 Bars</SelectItem>
                <SelectItem value="8">8 Bars</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        
        <div>
          <label className="text-sm text-gray-300 mb-2 block">Format</label>
          <Select value={exportFormat} onValueChange={(value: 'wav' | 'mp3') => setExportFormat(value)}>
            <SelectTrigger className="bg-gray-800 border-gray-600">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="wav">WAV (uncompressed)</SelectItem>
              <SelectItem value="mp3">MP3 (compressed)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        {isExporting && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm text-gray-300">
              <span>Exporting...</span>
              <span>{Math.round(exportProgress)}%</span>
            </div>
            <Progress value={exportProgress} className="w-full" />
          </div>
        )}
        
        <Button
          onClick={exportAudio}
          disabled={isExporting}
          className="w-full bg-purple-600 hover:bg-purple-700 text-white"
        >
          <Download className="w-4 h-4 mr-2" />
          {isExporting ? 'Exporting...' : `Export ${exportType === 'pattern' ? 'Pattern' : 'Stems'}`}
        </Button>
        
        <div className="text-xs text-gray-400 space-y-1">
          <p>• Full Mix: Single audio file with all tracks mixed together</p>
          <p>• Stems: Separate audio file for each active track</p>
          <p>• WAV: High quality, larger file size</p>
          <p>• MP3: Compressed, smaller file size</p>
        </div>
      </CardContent>
    </Card>
  );
};