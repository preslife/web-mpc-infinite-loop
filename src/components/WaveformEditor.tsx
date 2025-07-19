import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Play, Square, Scissors, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';

interface Sample {
  buffer: AudioBuffer | null;
  name: string;
  startTime: number;
  endTime: number;
  gateMode: boolean;
  pitch: number; // -12 to +12 semitones
  reverse: boolean;
  volume: number; // 0 to 1
}

interface WaveformEditorProps {
  sample: Sample;
  onSampleUpdate: (sample: Sample) => void;
  onClose: () => void;
  onConfirm?: () => void;
  showConfirm?: boolean;
  audioContext?: AudioContext | null;
}

export const WaveformEditor = ({ sample, onSampleUpdate, onClose, onConfirm, showConfirm, audioContext }: WaveformEditorProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentSource, setCurrentSource] = useState<AudioBufferSourceNode | null>(null);
  const [waveformData, setWaveformData] = useState<Float32Array | null>(null);
  const [pitch, setPitch] = useState(1.0);
  const [isNormalizing, setIsNormalizing] = useState(false);

  // Use the provided audio context from parent component
  const getAudioContext = () => audioContext || null;

  // Generate waveform data
  useEffect(() => {
    if (!sample.buffer) return;

    const buffer = sample.buffer;
    const channelData = buffer.getChannelData(0); // Use first channel
    const samples = 2000; // Number of samples to display
    const blockSize = Math.floor(channelData.length / samples);
    const filteredData = new Float32Array(samples);

    for (let i = 0; i < samples; i++) {
      let sum = 0;
      for (let j = 0; j < blockSize; j++) {
        sum += Math.abs(channelData[i * blockSize + j] || 0);
      }
      filteredData[i] = sum / blockSize;
    }

    setWaveformData(filteredData);
  }, [sample.buffer]);

  // Draw waveform
  useEffect(() => {
    if (!canvasRef.current || !waveformData) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = canvas;
    ctx.clearRect(0, 0, width, height);

    // Draw waveform
    ctx.fillStyle = 'rgba(147, 51, 234, 0.3)';
    ctx.strokeStyle = 'rgb(147, 51, 234)';
    ctx.lineWidth = 1;

    const sliceWidth = width / waveformData.length;
    
    ctx.beginPath();
    for (let i = 0; i < waveformData.length; i++) {
      const x = i * sliceWidth;
      const y = height / 2 - (waveformData[i] * height * 0.4);
      
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();

    // Fill waveform
    ctx.lineTo(width, height / 2);
    ctx.lineTo(0, height / 2);
    ctx.closePath();
    ctx.fill();

    // Draw selection area
    const startX = sample.startTime * width;
    const endX = sample.endTime * width;
    
    // Dim unselected areas
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(0, 0, startX, height);
    ctx.fillRect(endX, 0, width - endX, height);

    // Draw selection handles
    ctx.fillStyle = 'rgb(239, 68, 68)';
    ctx.fillRect(startX - 2, 0, 4, height);
    ctx.fillRect(endX - 2, 0, 4, height);

  }, [waveformData, sample.startTime, sample.endTime]);

  const handleCanvasClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const position = x / canvasRef.current.width;

    // Determine if clicking closer to start or end handle
    const distToStart = Math.abs(position - sample.startTime);
    const distToEnd = Math.abs(position - sample.endTime);

    const updatedSample = { ...sample };
    
    if (distToStart < distToEnd) {
      updatedSample.startTime = Math.max(0, Math.min(position, sample.endTime - 0.01));
    } else {
      updatedSample.endTime = Math.max(sample.startTime + 0.01, Math.min(position, 1));
    }

    onSampleUpdate(updatedSample);
  };

  const playPreview = async () => {
    const ctx = getAudioContext();
    console.log('playPreview called', { 
      audioContext: !!ctx, 
      buffer: !!sample.buffer,
      audioContextState: ctx?.state 
    });
    
    if (!ctx || !sample.buffer) {
      console.log('Missing audio context or buffer:', { 
        audioContext: !!ctx, 
        buffer: !!sample.buffer 
      });
      return;
    }

    // Resume audio context if suspended (required by browsers)
    if (ctx.state === 'suspended') {
      try {
        console.log('Resuming audio context...');
        await ctx.resume();
        console.log('Audio context resumed, state:', ctx.state);
      } catch (error) {
        console.error('Failed to resume audio context:', error);
        return;
      }
    }

    // Stop any currently playing source first (always stop for previews)
    if (currentSource) {
      console.log('Stopping current source');
      currentSource.stop();
      setCurrentSource(null);
    }

    if (isPlaying) {
      console.log('Already playing, stopping...');
      setIsPlaying(false);
      return;
    }

    try {
      console.log('Creating audio source...');
      const source = ctx.createBufferSource();
      source.buffer = sample.buffer;

      // Apply pitch adjustment
      const pitchRate = Math.pow(2, sample.pitch / 12);
      source.playbackRate.value = pitchRate;
      console.log('Applied pitch rate:', pitchRate);

      // Create gain node for volume control
      const gainNode = ctx.createGain();
      gainNode.gain.value = sample.volume;
      console.log('Applied volume:', sample.volume);

      const duration = sample.buffer.duration;
      const startTime = sample.startTime * duration;
      const endTime = sample.endTime * duration;
      const playDuration = endTime - startTime;

      console.log('Play parameters:', { 
        duration, 
        startTime, 
        endTime, 
        playDuration,
        sampleStartTime: sample.startTime,
        sampleEndTime: sample.endTime
      });

      // Connect: source -> gain -> destination
      source.connect(gainNode);
      gainNode.connect(ctx.destination);

      source.onended = () => {
        console.log('Audio playback ended');
        setIsPlaying(false);
        setCurrentSource(null);
      };

      console.log('Starting audio playback...');
      source.start(0, startTime, playDuration);
      setCurrentSource(source);
      setIsPlaying(true);
      console.log('Audio playback started');
    } catch (error) {
      console.error('Failed to play preview:', error);
      setIsPlaying(false);
    }
  };

  const resetSelection = () => {
    onSampleUpdate({
      ...sample,
      startTime: 0,
      endTime: 1
    });
  };

  const toggleGateMode = () => {
    onSampleUpdate({
      ...sample,
      gateMode: !sample.gateMode
    });
  };

  return (
    <div className="glass-panel glass-glow p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Edit Sample: {sample.name}</h3>
        <div className="flex gap-2">
          {showConfirm && onConfirm && (
            <Button onClick={onConfirm} variant="default" size="sm">
              Confirm & Load
            </Button>
          )}
          <Button onClick={onClose} variant="outline" size="sm">
            Close
          </Button>
        </div>
      </div>

      {/* Waveform Display */}
      <div className="border border-border rounded-lg overflow-hidden">
        <canvas
          ref={canvasRef}
          width={800}
          height={200}
          className="w-full h-48 cursor-crosshair"
          onClick={handleCanvasClick}
        />
      </div>

      {/* Controls */}
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <Button onClick={playPreview} variant={isPlaying ? "destructive" : "default"} size="sm">
            {isPlaying ? <Square className="h-4 w-4 mr-1" /> : <Play className="h-4 w-4 mr-1" />}
            {isPlaying ? 'Stop' : 'Preview'}
          </Button>

          <Button onClick={resetSelection} variant="outline" size="sm">
            <RotateCcw className="h-4 w-4 mr-1" />
            Reset
          </Button>

          <Button 
            onClick={toggleGateMode} 
            variant={sample.gateMode ? "default" : "outline"} 
            size="sm"
          >
            <Scissors className="h-4 w-4 mr-1" />
            Gate Mode {sample.gateMode ? 'ON' : 'OFF'}
          </Button>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="text-sm font-medium mb-1 block">Start Position</label>
            <Slider
              value={[sample.startTime]}
              onValueChange={([value]) => onSampleUpdate({ ...sample, startTime: Math.min(value, sample.endTime - 0.01) })}
              min={0}
              max={1}
              step={0.001}
              className="w-full"
            />
            <span className="text-xs text-muted-foreground">
              {(sample.startTime * (sample.buffer?.duration || 0)).toFixed(2)}s
            </span>
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block">End Position</label>
            <Slider
              value={[sample.endTime]}
              onValueChange={([value]) => onSampleUpdate({ ...sample, endTime: Math.max(value, sample.startTime + 0.01) })}
              min={0}
              max={1}
              step={0.001}
              className="w-full"
            />
            <span className="text-xs text-muted-foreground">
              {(sample.endTime * (sample.buffer?.duration || 0)).toFixed(2)}s
            </span>
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block">Volume</label>
            <Slider
              value={[sample.volume * 100]}
              onValueChange={([value]) => onSampleUpdate({ ...sample, volume: value / 100 })}
              min={0}
              max={100}
              step={1}
              className="w-full"
            />
            <span className="text-xs text-muted-foreground">
              {Math.round(sample.volume * 100)}%
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium mb-1 block">Pitch (semitones)</label>
            <Slider
              value={[sample.pitch]}
              onValueChange={([value]) => onSampleUpdate({ ...sample, pitch: value })}
              min={-12}
              max={12}
              step={1}
              className="w-full"
            />
            <span className="text-xs text-muted-foreground">
              {sample.pitch > 0 ? '+' : ''}{sample.pitch} semitones
            </span>
          </div>

          <div className="flex items-center gap-4">
            <Button 
              onClick={() => onSampleUpdate({ ...sample, reverse: !sample.reverse })} 
              variant={sample.reverse ? "default" : "outline"} 
              size="sm"
              className="w-full"
            >
              Reverse {sample.reverse ? 'ON' : 'OFF'}
            </Button>
          </div>
        </div>

        <div className="text-sm text-muted-foreground">
          <p><strong>Selection:</strong> {((sample.endTime - sample.startTime) * (sample.buffer?.duration || 0)).toFixed(2)}s</p>
          {sample.gateMode && (
            <p className="text-accent"><strong>Gate Mode:</strong> Audio plays only while pad is pressed</p>
          )}
        </div>
      </div>
    </div>
  );
};