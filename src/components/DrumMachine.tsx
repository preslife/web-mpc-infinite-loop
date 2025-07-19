import { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Play, Pause, Square, Mic, Volume2, Upload, Save, FolderOpen, Copy, RotateCcw, VolumeX, Download, Edit } from 'lucide-react';
import { toast } from 'sonner';
import { WaveformEditor } from './WaveformEditor';

interface Sample {
  buffer: AudioBuffer | null;
  name: string;
  startTime: number;
  endTime: number;
  gateMode: boolean;
}

interface PatternStep {
  active: boolean;
  velocity: number;
}

interface Pattern {
  name: string;
  steps: PatternStep[][];
  bpm: number;
  swing: number;
}

const DrumMachine = () => {
  const audioContextRef = useRef<AudioContext | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [currentStep, setCurrentStep] = useState(-1);
  const [bpm, setBpm] = useState([120]);
  const [sequencerLength, setSequencerLength] = useState(16);
  const [samples, setSamples] = useState<Sample[]>(Array(16).fill({ buffer: null, name: '', startTime: 0, endTime: 1, gateMode: false }));
  const [patterns, setPatterns] = useState<PatternStep[][]>(
    Array(16).fill(null).map(() => Array(64).fill({ active: false, velocity: 80 }))
  );
  const [trackVolumes, setTrackVolumes] = useState<number[]>(Array(16).fill(80));
  const [trackMutes, setTrackMutes] = useState<boolean[]>(Array(16).fill(false));
  const [trackSolos, setTrackSolos] = useState<boolean[]>(Array(16).fill(false));
  const [selectedPad, setSelectedPad] = useState<number | null>(null);
  const [recordMode, setRecordMode] = useState(false);
  const [swing, setSwing] = useState([0]);
  const [savedPatterns, setSavedPatterns] = useState<Pattern[]>([]);
  const [currentPatternName, setCurrentPatternName] = useState('Pattern 1');
  const [editingSample, setEditingSample] = useState<number | null>(null);
  const [playingSources, setPlayingSources] = useState<Map<number, AudioBufferSourceNode>>(new Map());

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

  // Sequencer loop with swing
  useEffect(() => {
    if (!isPlaying) return;

    const baseStepTime = (60 / bpm[0] / 4) * 1000; // 16th notes
    let stepCounter = 0;
    
    const scheduleNextStep = () => {
      const swingAmount = swing[0] / 100;
      const isOffBeat = stepCounter % 2 === 1;
      const swingDelay = isOffBeat ? baseStepTime * swingAmount * 0.1 : 0;
      
      setTimeout(() => {
        setCurrentStep(prev => {
          const nextStep = (prev + 1) % sequencerLength;
          
          // Play samples for active steps
          patterns.forEach((pattern, padIndex) => {
            const shouldPlay = pattern[nextStep]?.active && 
                              samples[padIndex]?.buffer && 
                              !trackMutes[padIndex] &&
                              (trackSolos.every(s => !s) || trackSolos[padIndex]);
            
            if (shouldPlay) {
              playPad(padIndex, pattern[nextStep].velocity);
            }
          });
          
          stepCounter++;
          if (isPlaying) scheduleNextStep();
          return nextStep;
        });
      }, baseStepTime + swingDelay);
    };

    scheduleNextStep();
  }, [isPlaying, bpm, patterns, samples, sequencerLength, swing, trackMutes, trackSolos]);

  const playPad = useCallback((padIndex: number, velocity: number = 80, gateMode: boolean = false) => {
    if (!audioContextRef.current || !samples[padIndex]?.buffer) return;
    
    // Check mute/solo state
    const shouldPlay = !trackMutes[padIndex] && 
                      (trackSolos.every(s => !s) || trackSolos[padIndex]);
    
    if (!shouldPlay) return;

    // Stop any currently playing source for this pad if in gate mode
    if (gateMode) {
      const currentSource = playingSources.get(padIndex);
      if (currentSource) {
        currentSource.stop();
        setPlayingSources(prev => {
          const newMap = new Map(prev);
          newMap.delete(padIndex);
          return newMap;
        });
      }
    }

    const source = audioContextRef.current.createBufferSource();
    const gainNode = audioContextRef.current.createGain();
    
    source.buffer = samples[padIndex].buffer;
    
    // Calculate sample slice timing
    const sample = samples[padIndex];
    const duration = sample.buffer!.duration;
    const startTime = sample.startTime * duration;
    const endTime = sample.endTime * duration;
    const sliceDuration = endTime - startTime;
    
    // Combine pattern velocity with track volume
    const finalVolume = (velocity / 127) * (trackVolumes[padIndex] / 100);
    gainNode.gain.value = finalVolume;
    
    source.connect(gainNode);
    gainNode.connect(audioContextRef.current.destination);
    
    // Track the source if in gate mode
    if (gateMode) {
      setPlayingSources(prev => new Map(prev).set(padIndex, source));
      
      source.onended = () => {
        setPlayingSources(prev => {
          const newMap = new Map(prev);
          newMap.delete(padIndex);
          return newMap;
        });
      };
    }
    
    source.start(0, startTime, gateMode ? undefined : sliceDuration);
  }, [samples, trackVolumes, trackMutes, trackSolos, playingSources]);

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
          newSamples[padIndex] = { 
            buffer: audioBuffer, 
            name: `Sample ${padIndex + 1}`,
            startTime: 0,
            endTime: 1,
            gateMode: false
          };
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
        newSamples[padIndex] = { 
          buffer: audioBuffer, 
          name: file.name.replace(/\.[^/.]+$/, ""),
          startTime: 0,
          endTime: 1,
          gateMode: false
        };
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
      playPad(padIndex, trackVolumes[padIndex], samples[padIndex].gateMode);
    } else {
      // Open file picker for empty pads
      setSelectedPad(padIndex);
      fileInputRef.current?.click();
    }
  };

  const handlePadRelease = (padIndex: number) => {
    if (samples[padIndex]?.gateMode) {
      const currentSource = playingSources.get(padIndex);
      if (currentSource) {
        currentSource.stop();
        setPlayingSources(prev => {
          const newMap = new Map(prev);
          newMap.delete(padIndex);
          return newMap;
        });
      }
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

  const toggleMute = (padIndex: number) => {
    const newMutes = [...trackMutes];
    newMutes[padIndex] = !newMutes[padIndex];
    setTrackMutes(newMutes);
  };

  const toggleSolo = (padIndex: number) => {
    const newSolos = [...trackSolos];
    newSolos[padIndex] = !newSolos[padIndex];
    setTrackSolos(newSolos);
  };

  const clearPattern = () => {
    setPatterns(Array(16).fill(null).map(() => Array(64).fill({ active: false, velocity: 80 })));
    toast.success('Pattern cleared');
  };

  const savePattern = () => {
    const pattern: Pattern = {
      name: currentPatternName,
      steps: patterns,
      bpm: bpm[0],
      swing: swing[0]
    };
    setSavedPatterns(prev => [...prev, pattern]);
    toast.success(`Pattern "${currentPatternName}" saved`);
  };

  const loadPattern = (pattern: Pattern) => {
    setPatterns(pattern.steps);
    setBpm([pattern.bpm]);
    setSwing([pattern.swing]);
    setCurrentPatternName(pattern.name);
    toast.success(`Pattern "${pattern.name}" loaded`);
  };

  const exportPattern = () => {
    const pattern: Pattern = {
      name: currentPatternName,
      steps: patterns,
      bpm: bpm[0],
      swing: swing[0]
    };
    
    const dataStr = JSON.stringify(pattern, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `${currentPatternName}.json`;
    link.click();
    
    URL.revokeObjectURL(url);
    toast.success('Pattern exported');
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

        {/* Drum Pads */}
        <div className="glass-panel glass-glow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <Volume2 className="h-5 w-5" />
            Drum Pads
          </h2>
          <div className="grid grid-cols-4 gap-4">
            {Array.from({ length: 16 }, (_, i) => (
              <div key={i} className="relative group">
                <button
                  onMouseDown={() => handlePadPress(i)}
                  onMouseUp={() => handlePadRelease(i)}
                  onMouseLeave={() => handlePadRelease(i)}
                  onTouchStart={() => handlePadPress(i)}
                  onTouchEnd={() => handlePadRelease(i)}
                  className={`
                    h-48 w-48 rounded-lg font-bold text-lg transition-all duration-150 active:scale-95 neon-border
                    ${samples[i]?.buffer 
                      ? 'bg-gradient-active text-primary-foreground glass-glow-strong' 
                      : 'glass-panel hover:glass-glow'
                    }
                    ${isRecording && selectedPad === i ? 'animate-pulse ring-2 ring-destructive' : ''}
                    ${samples[i]?.gateMode ? 'ring-2 ring-accent' : ''}
                  `}
                >
                  {samples[i]?.buffer ? samples[i].name.split(' ')[1] : isRecording && selectedPad === i ? 'REC' : i + 1}
                </button>
                
                {samples[i]?.buffer && (
                  <Button
                    onClick={() => setEditingSample(i)}
                    variant="outline"
                    size="sm"
                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Edit className="h-3 w-3" />
                  </Button>
                )}
              </div>
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

        {/* Transport Controls */}
        <div className="glass-panel glass-glow p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
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

            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">BPM</span>
                <div className="w-24">
                  <Slider
                    value={bpm}
                    onValueChange={setBpm}
                    min={60}
                    max={200}
                    step={1}
                    className="w-full"
                  />
                </div>
                <span className="text-lg font-bold min-w-[40px] text-accent">{bpm[0]}</span>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">Swing</span>
                <div className="w-24">
                  <Slider
                    value={swing}
                    onValueChange={setSwing}
                    min={0}
                    max={50}
                    step={1}
                    className="w-full"
                  />
                </div>
                <span className="text-sm min-w-[30px] text-accent">{swing[0]}%</span>
              </div>
            </div>
          </div>

          {/* Sequencer Controls */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Steps:</span>
              {[16, 32, 64].map((steps) => (
                <Button
                  key={steps}
                  variant={sequencerLength === steps ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSequencerLength(steps)}
                >
                  {steps}
                </Button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Pattern:</span>
              <input 
                value={currentPatternName}
                onChange={(e) => setCurrentPatternName(e.target.value)}
                className="bg-background/50 border border-border rounded px-2 py-1 text-sm w-24"
              />
              
              <Button onClick={savePattern} variant="outline" size="sm">
                <Save className="h-4 w-4 mr-1" />
                Save
              </Button>
              
              <Select onValueChange={(value) => loadPattern(savedPatterns[parseInt(value)])}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="Load..." />
                </SelectTrigger>
                <SelectContent>
                  {savedPatterns.map((pattern, index) => (
                    <SelectItem key={index} value={index.toString()}>
                      {pattern.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button onClick={clearPattern} variant="outline" size="sm">
                <RotateCcw className="h-4 w-4 mr-1" />
                Clear
              </Button>

              <Button onClick={exportPattern} variant="outline" size="sm">
                <Download className="h-4 w-4 mr-1" />
                Export
              </Button>
            </div>
          </div>
        </div>


        {/* Step Sequencer */}
        <div className="glass-panel glass-glow p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Step Sequencer</h2>
          </div>
          
          <div className="space-y-2">
            {/* Step indicators */}
            <div className={`grid gap-1 mb-4 ${
              sequencerLength === 16 ? 'grid-cols-16' : 
              sequencerLength === 32 ? 'grid-cols-32' : 
              'grid-cols-64'
            }`}>
              {Array.from({ length: sequencerLength }, (_, i) => (
                <div
                  key={i}
                  className={`
                    h-2 rounded-sm
                    ${currentStep === i ? 'bg-step-playing' : 'bg-muted'}
                  `}
                />
              ))}
            </div>

            {/* Pattern grid with track controls */}
            <div className="space-y-1 max-h-80 overflow-y-auto">
              {Array.from({ length: 16 }, (_, padIndex) => (
                <div key={padIndex} className="flex items-center gap-2">
                  {/* Pad indicator */}
                  <div className="w-8 flex items-center justify-center">
                    <div className={`
                      w-6 h-6 rounded-sm flex items-center justify-center text-xs font-bold glass-panel
                      ${samples[padIndex]?.buffer 
                        ? 'bg-gradient-active text-primary-foreground glass-glow' 
                        : 'text-muted-foreground'
                      }
                    `}>
                      {padIndex + 1}
                    </div>
                  </div>

                  {/* Mute button */}
                  <Button
                    size="sm"
                    variant={trackMutes[padIndex] ? "destructive" : "outline"}
                    onClick={() => toggleMute(padIndex)}
                    disabled={!samples[padIndex]?.buffer}
                    className="w-8 h-6 p-0"
                  >
                    <VolumeX className="h-3 w-3" />
                  </Button>

                  {/* Solo button */}
                  <Button
                    size="sm"
                    variant={trackSolos[padIndex] ? "default" : "outline"}
                    onClick={() => toggleSolo(padIndex)}
                    disabled={!samples[padIndex]?.buffer}
                    className="w-8 h-6 p-0 text-xs"
                  >
                    S
                  </Button>

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

                  {/* Step buttons - scrollable container */}
                  <div className="flex-1 overflow-x-auto">
                    <div className={`grid gap-1 ${
                      sequencerLength === 16 ? 'grid-cols-16' : 
                      sequencerLength === 32 ? 'grid-cols-32' : 
                      'grid-cols-64'
                    } min-w-fit`}>
                      {Array.from({ length: sequencerLength }, (_, stepIndex) => (
                        <button
                          key={stepIndex}
                          onClick={() => toggleStep(padIndex, stepIndex)}
                          disabled={!samples[padIndex]?.buffer}
                          className={`
                            h-6 w-6 min-w-[1.5rem] rounded-sm transition-all duration-150 neon-border
                            ${patterns[padIndex][stepIndex]?.active 
                              ? 'bg-step-active glass-glow text-primary-foreground' 
                              : samples[padIndex]?.buffer 
                                ? 'glass-panel hover:glass-glow' 
                                : 'bg-muted/50 cursor-not-allowed'
                            }
                            ${currentStep === stepIndex ? 'ring-2 ring-step-playing glass-glow-strong' : ''}
                            ${!samples[padIndex]?.buffer ? 'opacity-50' : ''}
                          `}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Waveform Editor */}
        {editingSample !== null && samples[editingSample]?.buffer && (
          <div className="mt-6">
            <WaveformEditor
              sample={samples[editingSample]}
              onSampleUpdate={(updatedSample) => {
                const newSamples = [...samples];
                newSamples[editingSample] = updatedSample;
                setSamples(newSamples);
              }}
              onClose={() => setEditingSample(null)}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default DrumMachine;
