import { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Play, Pause, Square, Mic, Volume2 } from 'lucide-react';
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
  const [selectedPad, setSelectedPad] = useState<number | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);

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
    gainNode.gain.value = velocity / 127;
    
    source.connect(gainNode);
    gainNode.connect(audioContextRef.current.destination);
    
    source.start();
  }, [samples]);

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

  const handlePadPress = (padIndex: number) => {
    if (isRecording && selectedPad === padIndex) {
      stopRecording();
    } else if (isRecording) {
      return; // Don't allow other interactions while recording
    } else if (samples[padIndex]?.buffer) {
      playPad(padIndex);
    } else {
      startRecording(padIndex);
    }
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
              Tap empty pads to record samples, tap filled pads to play
            </p>
          </div>

          {/* Step Sequencer */}
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

              {/* Pattern grid */}
              <div className="space-y-1 max-h-64 overflow-y-auto">
                {samples.map((sample, padIndex) => {
                  if (!sample.buffer) return null;
                  return (
                    <div key={padIndex} className="flex items-center gap-2">
                      <div className="w-12 text-xs font-medium text-primary">
                        {sample.name.split(' ')[1]}
                      </div>
                      <div className="grid grid-cols-16 gap-1 flex-1">
                        {Array.from({ length: 16 }, (_, stepIndex) => (
                          <button
                            key={stepIndex}
                            onClick={() => toggleStep(padIndex, stepIndex)}
                            className={`
                              h-6 w-full rounded-sm transition-all duration-150
                              ${patterns[padIndex][stepIndex]?.active 
                                ? 'bg-step-active shadow-sm' 
                                : 'bg-muted hover:bg-secondary'
                              }
                              ${currentStep === stepIndex ? 'ring-1 ring-step-playing' : ''}
                            `}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DrumMachine;