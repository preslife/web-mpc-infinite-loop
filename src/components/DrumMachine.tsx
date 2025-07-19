import { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Play, Pause, Square, Mic, Volume2, Upload } from 'lucide-react';
import { toast } from 'sonner';

interface Sample {
  buffer: AudioBuffer | null;
  name: string;
}

interface PatternStep {
  active: boolean;
  velocity: number;
}

const DrumMachine = () => {
  const audioContextRef = useRef<AudioContext | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [currentStep, setCurrentStep] = useState(-1);
  const [bpm, setBpm] = useState([120]);
  const [samples, setSamples] = useState<Sample[]>(Array(16).fill({ buffer: null, name: '' }));
  const [patterns, setPatterns] = useState<PatternStep[][]>(
    Array(16).fill(null).map(() => Array(16).fill({ active: false, velocity: 80 }))
  );
  const [trackVolumes, setTrackVolumes] = useState<number[]>(Array(16).fill(80));
  const [selectedPad, setSelectedPad] = useState<number | null>(null);
  const [recordMode, setRecordMode] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initialize Web Audio API
  useEffect(() => {
    audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  // Sequencer loop
  useEffect(() => {
    if (!isPlaying) return;

    const stepTime = (60 / bpm[0] / 4) * 1000; // 16th notes
    const interval = setInterval(() => {
      setCurrentStep(prev => {
        const nextStep = (prev + 1) % 16;
        
        // Play samples for active steps
        patterns.forEach((pattern, padIndex) => {
          if (pattern[nextStep]?.active && samples[padIndex]?.buffer) {
            playPad(padIndex, pattern[nextStep].velocity);
          }
        });
        
        return nextStep;
      });
    }, stepTime);

    return () => clearInterval(interval);
  }, [isPlaying, bpm, patterns, samples]);

  const playPad = useCallback((padIndex: number, velocity: number = 80) => {
    if (!audioContextRef.current || !samples[padIndex]?.buffer) return;

    const source = audioContextRef.current.createBufferSource();
    const gainNode = audioContextRef.current.createGain();
    
    source.buffer = samples[padIndex].buffer;
    // Combine pattern velocity with track volume
    const finalVolume = (velocity / 127) * (trackVolumes[padIndex] / 100);
    gainNode.gain.value = finalVolume;
    
    source.connect(gainNode);
    gainNode.connect(audioContextRef.current.destination);
    
    source.start();
  }, [samples, trackVolumes]);

  const startRecording = async (padIndex: number) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      recordingChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (event) => {
        recordingChunksRef.current.push(event.data);
      };

      mediaRecorderRef.current.onstop = async () => {
        const blob = new Blob(recordingChunksRef.current, { type: 'audio/wav' });
        const arrayBuffer = await blob.arrayBuffer();
        
        if (audioContextRef.current) {
          const audioBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer);
          const newSamples = [...samples];
          newSamples[padIndex] = { buffer: audioBuffer, name: `Sample ${padIndex + 1}` };
          setSamples(newSamples);
          toast.success('Sample recorded!');
        }
        
        stream.getTracks().forEach(track => track.stop());
      };

      setIsRecording(true);
      setSelectedPad(padIndex);
      mediaRecorderRef.current.start();
      toast.info('Recording... Tap again to stop');
    } catch (error) {
      toast.error('Microphone access denied');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setSelectedPad(null);
    }
  };

  const loadSample = async (file: File, padIndex: number) => {
    try {
      const arrayBuffer = await file.arrayBuffer();
      if (audioContextRef.current) {
        const audioBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer);
        const newSamples = [...samples];
        newSamples[padIndex] = { buffer: audioBuffer, name: file.name.replace(/\.[^/.]+$/, "") };
        setSamples(newSamples);
        toast.success(`Sample "${file.name}" loaded!`);
      }
    } catch (error) {
      toast.error('Failed to load sample');
    }
  };

  const handlePadPress = (padIndex: number) => {
    if (isRecording && selectedPad === padIndex) {
      stopRecording();
      return;
    } 
    
    if (isRecording) {
      return; // Don't allow other interactions while recording
    }

    if (recordMode) {
      startRecording(padIndex);
    } else if (samples[padIndex]?.buffer) {
      playPad(padIndex, trackVolumes[padIndex]);
    } else {
      // Open file picker for empty pads
      setSelectedPad(padIndex);
      fileInputRef.current?.click();
    }
  };

  const handleFileLoad = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && selectedPad !== null) {
      loadSample(file, selectedPad);
      setSelectedPad(null);
    }
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleTrackVolumeChange = (padIndex: number, volume: number[]) => {
    const newVolumes = [...trackVolumes];
    newVolumes[padIndex] = volume[0];
    setTrackVolumes(newVolumes);
  };

  const toggleStep = (padIndex: number, stepIndex: number) => {
    const newPatterns = [...patterns];
    newPatterns[padIndex] = [...newPatterns[padIndex]];
    newPatterns[padIndex][stepIndex] = {
      ...newPatterns[padIndex][stepIndex],
      active: !newPatterns[padIndex][stepIndex].active
    };
    setPatterns(newPatterns);
  };

  const handlePlayStop = () => {
    if (isPlaying) {
      setIsPlaying(false);
      setCurrentStep(-1);
    } else {
      if (audioContextRef.current?.state === 'suspended') {
        audioContextRef.current.resume();
      }
      setIsPlaying(true);
    }
  };

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-primary mb-2">∞-WEB MPC</h1>
          <p className="text-muted-foreground">Professional Drum Machine & Sampler</p>
        </div>

        {/* Transport Controls */}
        <div className="bg-gradient-panel rounded-lg p-6 mb-6 shadow-panel">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button 
                onClick={handlePlayStop}
                variant={isPlaying ? "destructive" : "default"}
                size="lg"
                className="h-12 w-12"
              >
                {isPlaying ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6" />}
              </Button>
              
              <Button 
                onClick={() => setCurrentStep(-1)}
                variant="outline"
                size="lg"
                className="h-12 w-12"
              >
                <Square className="h-6 w-6" />
              </Button>

              <Button 
                onClick={() => setRecordMode(!recordMode)}
                variant={recordMode ? "destructive" : "outline"}
                size="lg"
                className="h-12 w-12"
              >
                <Mic className="h-6 w-6" />
              </Button>

              {isRecording && (
                <div className="flex items-center gap-2 text-destructive animate-pulse">
                  <Mic className="h-5 w-5" />
                  <span className="font-medium">REC</span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-4">
              <span className="text-sm font-medium min-w-[60px]">BPM</span>
              <div className="w-32">
                <Slider
                  value={bpm}
                  onValueChange={setBpm}
                  min={60}
                  max={200}
                  step={1}
                  className="w-full"
                />
              </div>
              <span className="text-xl font-bold min-w-[40px] text-accent">{bpm[0]}</span>
            </div>
          </div>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Drum Pads */}
          <div className="bg-gradient-panel rounded-lg p-6 shadow-panel">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <Volume2 className="h-5 w-5" />
              Drum Pads
            </h2>
            <div className="grid grid-cols-4 gap-3">
              {Array.from({ length: 16 }, (_, i) => (
                <button
                  key={i}
                  onClick={() => handlePadPress(i)}
                  className={`
                    aspect-square rounded-lg font-bold text-sm transition-all duration-150 active:scale-95
                    ${samples[i]?.buffer 
                      ? 'bg-gradient-active text-primary-foreground shadow-glow' 
                      : 'bg-gradient-pad text-foreground hover:bg-secondary'
                    }
                    ${isRecording && selectedPad === i ? 'animate-pulse ring-2 ring-destructive' : ''}
                    shadow-pad hover:shadow-glow
                  `}
                >
                  {samples[i]?.buffer ? samples[i].name.split(' ')[1] : isRecording && selectedPad === i ? 'REC' : i + 1}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-4">
              {recordMode 
                ? "Record mode: Tap pads to record from microphone" 
                : "Tap empty pads to load samples, tap filled pads to play"
              }
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*"
              onChange={handleFileLoad}
              className="hidden"
            />
          </div>

          {/* Step Sequencer with Volume Controls */}
          <div className="bg-gradient-panel rounded-lg p-6 shadow-panel">
            <h2 className="text-xl font-semibold mb-4">16-Step Sequencer</h2>
            <div className="space-y-2">
              {/* Step indicators */}
              <div className="grid grid-cols-16 gap-1 mb-4">
                {Array.from({ length: 16 }, (_, i) => (
                  <div
                    key={i}
                    className={`
                      h-2 rounded-sm
                      ${currentStep === i ? 'bg-step-playing' : 'bg-muted'}
                    `}
                  />
                ))}
              </div>

              {/* Pattern grid with volume controls */}
              <div className="space-y-1 max-h-80 overflow-y-auto">
                {Array.from({ length: 16 }, (_, padIndex) => (
                  <div key={padIndex} className="flex items-center gap-2">
                    {/* Pad indicator */}
                    <div className="w-8 flex items-center justify-center">
                      <div className={`
                        w-6 h-6 rounded-sm flex items-center justify-center text-xs font-bold
                        ${samples[padIndex]?.buffer 
                          ? 'bg-gradient-active text-primary-foreground' 
                          : 'bg-muted text-muted-foreground'
                        }
                      `}>
                        {padIndex + 1}
                      </div>
                    </div>

                    {/* Volume control */}
                    <div className="w-16 flex items-center">
                      <Slider
                        value={[trackVolumes[padIndex]]}
                        onValueChange={(value) => handleTrackVolumeChange(padIndex, value)}
                        min={0}
                        max={100}
                        step={1}
                        className="w-full"
                        disabled={!samples[padIndex]?.buffer}
                      />
                    </div>

                    {/* Volume display */}
                    <div className="w-8 text-xs text-center">
                      {samples[padIndex]?.buffer ? trackVolumes[padIndex] : '--'}
                    </div>

                    {/* Step buttons */}
                    <div className="grid grid-cols-16 gap-1 flex-1">
                      {Array.from({ length: 16 }, (_, stepIndex) => (
                        <button
                          key={stepIndex}
                          onClick={() => toggleStep(padIndex, stepIndex)}
                          disabled={!samples[padIndex]?.buffer}
                          className={`
                            h-6 w-full rounded-sm transition-all duration-150
                            ${patterns[padIndex][stepIndex]?.active 
                              ? 'bg-step-active shadow-sm' 
                              : samples[padIndex]?.buffer 
                                ? 'bg-muted hover:bg-secondary' 
                                : 'bg-muted/50 cursor-not-allowed'
                            }
                            ${currentStep === stepIndex ? 'ring-1 ring-step-playing' : ''}
                            ${!samples[padIndex]?.buffer ? 'opacity-50' : ''}
                          `}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DrumMachine;
