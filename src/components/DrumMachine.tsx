import { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Play, Pause, Square, Mic, Volume2, Upload, Save, FolderOpen, Copy, RotateCcw, VolumeX, Download, Edit, RefreshCw, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { WaveformEditor } from './WaveformEditor';
import { VolumeKnob } from './VolumeKnob';
import * as mm from '@magenta/music';

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
  const [samples, setSamples] = useState<Sample[]>(Array(16).fill({
    buffer: null,
    name: '',
    startTime: 0,
    endTime: 1,
    gateMode: true
  }));
  const [patterns, setPatterns] = useState<PatternStep[][]>(Array(16).fill(null).map(() => Array(64).fill({
    active: false,
    velocity: 80
  })));
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
  const [displayMode, setDisplayMode] = useState<'sequencer' | 'editor'>('sequencer');
  const [masterVolume, setMasterVolume] = useState([80]);

  // Neural generation state
  const [seedLength, setSeedLength] = useState(4);
  const [temperature, setTemperature] = useState([1.1]);
  const [isGenerating, setIsGenerating] = useState(false);
  const rnnRef = useRef<any>(null);
  const [neuralEnabled, setNeuralEnabled] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initialize Web Audio API and Neural Network
  useEffect(() => {
    audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();

    // Initialize Magenta's Drums RNN model
    const initializeRNN = async () => {
      try {
        const rnn = new mm.MusicRNN('https://storage.googleapis.com/download.magenta.tensorflow.org/tfjs_checkpoints/music_rnn/drum_kit_rnn');
        await rnn.initialize();
        rnnRef.current = rnn;
        setNeuralEnabled(true);
        toast.success('Neural drum engine loaded!');
      } catch (error) {
        console.warn('Neural features unavailable:', error);
        toast.info('Neural features disabled - running in standard mode');
      }
    };
    initializeRNN();
    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  // Load saved patterns from localStorage on component mount
  useEffect(() => {
    const storedPatterns = localStorage.getItem('savedPatterns');
    if (storedPatterns) {
      setSavedPatterns(JSON.parse(storedPatterns));
    }
  }, []);

  // Save patterns to localStorage whenever savedPatterns changes
  useEffect(() => {
    localStorage.setItem('savedPatterns', JSON.stringify(savedPatterns));
  }, [savedPatterns]);

  // Function to generate a drum sequence using Magenta's MusicRNN
  const generateSequence = async () => {
    if (!rnnRef.current || !neuralEnabled) {
      toast.error('Neural drum engine not initialized.');
      return;
    }
    setIsGenerating(true);
    try {
      // Create a seed sequence (first 4 steps of the current pattern)
      const seedSequence = {
        notes: patterns.map(pad => {
          const activeStepIndex = pad.findIndex(step => step.active);
          return activeStepIndex !== -1 ? { pitch: pad.indexOf(pad[activeStepIndex]) + 36, quantizedStartStep: pad.indexOf(pad[activeStepIndex]) } : null;
        }).filter(note => note !== null).slice(0, seedLength),
        quantizationInfo: { stepsPerQuarter: 4 },
        totalQuantizedSteps: seedLength
      };

      // Generate continuation
      const continuation = await rnnRef.current.continueSequence(seedSequence, sequencerLength - seedLength, temperature[0]);

      // Update patterns with the generated sequence
      const newPatterns = [...patterns];
      continuation.notes.forEach(note => {
        const stepIndex = note.quantizedStartStep;
        const padIndex = note.pitch - 36; // Assuming MIDI note 36 corresponds to the first pad
        if (stepIndex >= 0 && stepIndex < sequencerLength && padIndex >= 0 && padIndex < 16) {
          newPatterns[padIndex] = [...newPatterns[padIndex]]; // Create a new copy of the pad's steps
          newPatterns[padIndex][stepIndex] = { active: true, velocity: 80 };
        }
      });
      setPatterns(newPatterns);
      toast.success('Generated new sequence!');
    } catch (error) {
      console.error('Error generating sequence:', error);
      toast.error('Failed to generate sequence.');
    } finally {
      setIsGenerating(false);
    }
  };

  const clearPattern = () => {
    const newPatterns = patterns.map(pattern => pattern.map(step => ({ ...step, active: false })));
    setPatterns(newPatterns);
    toast.info('Cleared current pattern');
  };

  const randomizePattern = () => {
    const newPatterns = patterns.map(pattern => pattern.map(() => ({
      active: Math.random() > 0.7,
      velocity: Math.floor(Math.random() * 127)
    })));
    setPatterns(newPatterns);
    toast.info('Randomized current pattern');
  };

  const savePattern = () => {
    const newPattern = {
      name: currentPatternName,
      steps: patterns,
      bpm: bpm[0],
      swing: swing[0]
    };
    setSavedPatterns([...savedPatterns, newPattern]);
    toast.success(`Saved pattern as "${currentPatternName}"`);
  };

  const loadPattern = (pattern: Pattern) => {
    setPatterns(pattern.steps);
    setBpm([pattern.bpm]);
    setSwing([pattern.swing]);
    setCurrentPatternName(pattern.name);
    toast.success(`Loaded pattern "${pattern.name}"`);
  };

  const deletePattern = (patternToDelete: Pattern) => {
    setSavedPatterns(savedPatterns.filter(pattern => pattern !== patternToDelete));
    toast.success(`Deleted pattern "${patternToDelete.name}"`);
  };

  // Sequencer loop with swing
  useEffect(() => {
    if (!isPlaying) return;
    const baseStepTime = 60 / bpm[0] / 4 * 1000; // 16th notes
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
            const shouldPlay = pattern[nextStep]?.active && samples[padIndex]?.buffer && !trackMutes[padIndex] && (trackSolos.every(s => !s) || trackSolos[padIndex]);
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
    const shouldPlay = !trackMutes[padIndex] && (trackSolos.every(s => !s) || trackSolos[padIndex]);
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

    // Combine pattern velocity with track volume and master volume
    const finalVolume = velocity / 127 * (trackVolumes[padIndex] / 100) * (masterVolume[0] / 100);
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
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true
      });
      mediaRecorderRef.current = new MediaRecorder(stream);
      recordingChunksRef.current = [];
      mediaRecorderRef.current.ondataavailable = event => {
        recordingChunksRef.current.push(event.data);
      };
      mediaRecorderRef.current.onstop = async () => {
        const blob = new Blob(recordingChunksRef.current, {
          type: 'audio/wav'
        });
        const arrayBuffer = await blob.arrayBuffer();
        if (audioContextRef.current) {
          const audioBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer);
          const newSamples = [...samples];
          newSamples[padIndex] = {
            buffer: audioBuffer,
            name: `Sample ${padIndex + 1}`,
            startTime: 0,
            endTime: 1,
            gateMode: true
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
          gateMode: true
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
      // If sequencer is playing, record to sequencer
      if (isPlaying && currentStep >= 0) {
        const newPatterns = [...patterns];
        newPatterns[padIndex] = [...newPatterns[padIndex]];
        newPatterns[padIndex][currentStep] = {
          active: true,
          velocity: trackVolumes[padIndex]
        };
        setPatterns(newPatterns);
        toast.success(`Recorded to step ${currentStep + 1}`);
      }
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

  const toggleStep = (padIndex: number, stepIndex: number) => {
    const newPatterns = [...patterns];
    newPatterns[padIndex] = [...newPatterns[padIndex]];
    newPatterns[padIndex][stepIndex] = {
      ...newPatterns[padIndex][stepIndex],
      active: !newPatterns[padIndex][stepIndex].active
    };
    setPatterns(newPatterns);
  };

  const handlePlay = () => {
    if (audioContextRef.current?.state === 'suspended') {
      audioContextRef.current.resume();
    }
    setIsPlaying(true);
  };

  const handlePause = () => {
    setIsPlaying(false);
    // Keep current step position when pausing
  };

  const handleStop = () => {
    setIsPlaying(false);
    setCurrentStep(-1);
    // Stop all playing sources
    playingSources.forEach(source => {
      try {
        source.stop();
      } catch (e) {
        // Source may already be stopped
      }
    });
    setPlayingSources(new Map());
  };

  // Helper function for pad colors based on Maschine style
  const getPadColor = (index: number) => {
    const colors = [
      'bg-yellow-600', 'bg-blue-500', 'bg-cyan-500', 'bg-pink-500',
      'bg-purple-600', 'bg-blue-400', 'bg-green-500', 'bg-pink-400',
      'bg-yellow-500', 'bg-orange-500', 'bg-cyan-400', 'bg-blue-600',
      'bg-red-500', 'bg-yellow-400', 'bg-blue-300', 'bg-red-400'
    ];
    return colors[index] || 'bg-gray-600';
  };

  return (
    <div className="min-h-screen bg-black p-2 font-mono">
      <div className="max-w-7xl mx-auto">
        {/* Top Control Bar */}
        <div className="bg-gray-900 p-2 mb-2 rounded border border-gray-700">
          <div className="grid grid-cols-8 gap-2">
            <Button variant="outline" size="sm" className="bg-gray-800 border-gray-600 text-gray-300 text-xs">CHANNEL</Button>
            <Button variant="outline" size="sm" className="bg-gray-800 border-gray-600 text-gray-300 text-xs">PLUG-IN</Button>
            <Button variant="outline" size="sm" className="bg-gray-800 border-gray-600 text-gray-300 text-xs">ARRANGER</Button>
            <Button variant="outline" size="sm" className="bg-gray-800 border-gray-600 text-gray-300 text-xs">MIXER</Button>
            <Button variant="outline" size="sm" className="bg-gray-800 border-gray-600 text-gray-300 text-xs">BROWSER</Button>
            <Button variant="outline" size="sm" className="bg-gray-800 border-gray-600 text-gray-300 text-xs">SAMPLING</Button>
            <Button variant="outline" size="sm" className="bg-gray-800 border-gray-600 text-gray-300 text-xs">AUTO</Button>
            <Button variant="outline" size="sm" className="bg-gray-800 border-gray-600 text-gray-300 text-xs">MACRO</Button>
          </div>
        </div>

        {/* Main Display Area */}
        <div className="bg-gray-900 p-4 mb-2 rounded border border-gray-700 h-96 relative overflow-hidden">
          {/* Neon glass effect overlay */}
          <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 via-purple-500/10 to-pink-500/10 rounded pointer-events-none"></div>
          <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-transparent rounded pointer-events-none"></div>
          
          {/* Toggle buttons */}
          <div className="flex gap-2 mb-4 relative z-10">
            <Button 
              onClick={() => setDisplayMode('sequencer')}
              variant={displayMode === 'sequencer' ? 'default' : 'outline'}
              size="sm" 
              className={`text-xs transition-all duration-300 ${
                displayMode === 'sequencer' 
                  ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 shadow-lg shadow-cyan-500/25' 
                  : 'bg-gray-800 border-gray-600 text-gray-300'
              }`}
            >
              SEQUENCER
            </Button>
            <Button 
              onClick={() => setDisplayMode('editor')}
              variant={displayMode === 'editor' ? 'default' : 'outline'}
              size="sm" 
              className={`text-xs transition-all duration-300 ${
                displayMode === 'editor' 
                  ? 'bg-pink-500/20 border-pink-400 text-pink-300 shadow-lg shadow-pink-500/25' 
                  : 'bg-gray-800 border-gray-600 text-gray-300'
              }`}
            >
              EDITOR
            </Button>
          </div>

          {/* Display Content */}
          <div className="bg-black/30 backdrop-blur-sm h-full rounded border border-gray-600/50 p-4 relative z-10 shadow-inner">
            {displayMode === 'sequencer' ? (
              <div className="h-full">
                <div className="flex justify-between items-center mb-4">
                  <div className="text-center flex-1">
                    <h2 className="text-xl font-bold text-cyan-300 mb-2 text-shadow-glow">SEQUENCER</h2>
                    <p className="text-gray-300 text-sm">{currentPatternName}</p>
                  </div>
                  
                  {/* Neural Generate Button */}
                  <Button
                    onClick={generateSequence}
                    disabled={!neuralEnabled || isGenerating}
                    className="h-8 px-3 text-xs bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 disabled:opacity-50"
                  >
                    {isGenerating ? <RefreshCw className="h-3 w-3 animate-spin mr-1" /> : <Sparkles className="h-3 w-3 mr-1" />}
                    {isGenerating ? 'Generating...' : 'Generate'}
                  </Button>
                </div>
                
                <div className="h-full overflow-auto">
                  {/* Step numbers row */}
                  <div className="flex gap-1 mb-2 pl-16 overflow-x-auto">
                    {Array.from({length: sequencerLength}, (_, stepIndex) => (
                      <div key={stepIndex} className={`
                        w-8 h-6 rounded text-xs flex items-center justify-center flex-shrink-0 transition-all duration-300
                        ${currentStep === stepIndex 
                          ? 'bg-gradient-to-br from-red-500 to-red-600 text-white shadow-lg shadow-red-500/50 scale-110' 
                          : 'bg-gray-700/50 text-gray-400 backdrop-blur-sm'
                        }
                      `}>
                        {stepIndex + 1}
                      </div>
                    ))}
                  </div>
                  
                  {/* Track rows with labels */}
                  <div className="space-y-1">
                    {Array.from({length: 16}, (_, padIndex) => (
                      <div key={padIndex} className="flex items-center gap-1 overflow-x-auto">
                        {/* Track label on the left */}
                        <div className="w-14 flex-shrink-0 text-xs text-gray-400 truncate">
                          {samples[padIndex]?.name || `T${padIndex + 1}`}
                        </div>
                        
                        {/* Mute/Solo buttons */}
                        <div className="flex gap-1 flex-shrink-0">
                          <button
                            onClick={() => {
                              const newMutes = [...trackMutes];
                              newMutes[padIndex] = !newMutes[padIndex];
                              setTrackMutes(newMutes);
                            }}
                            className={`w-6 h-6 rounded text-xs font-bold transition-all duration-200 ${
                              trackMutes[padIndex] 
                                ? 'bg-red-600 border border-red-500 text-white shadow-md shadow-red-500/50' 
                                : 'bg-gray-700/50 border border-gray-600 text-gray-400 hover:bg-gray-600/70'
                            }`}
                            title={`Mute track ${padIndex + 1}`}
                          >
                            M
                          </button>
                          <button
                            onClick={() => {
                              const newSolos = [...trackSolos];
                              newSolos[padIndex] = !newSolos[padIndex];
                              setTrackSolos(newSolos);
                            }}
                            className={`w-6 h-6 rounded text-xs font-bold transition-all duration-200 ${
                              trackSolos[padIndex] 
                                ? 'bg-yellow-600 border border-yellow-500 text-white shadow-md shadow-yellow-500/50' 
                                : 'bg-gray-700/50 border border-gray-600 text-gray-400 hover:bg-gray-600/70'
                            }`}
                            title={`Solo track ${padIndex + 1}`}
                          >
                            S
                          </button>
                        </div>
                        
                        {/* Step buttons */}
                        {Array.from({length: sequencerLength}, (_, stepIndex) => (
                          <button
                            key={stepIndex}
                            onClick={() => toggleStep(padIndex, stepIndex)}
                            className={`
                              w-8 h-6 rounded flex-shrink-0 transition-all duration-200
                              ${patterns[padIndex][stepIndex]?.active 
                                ? 'bg-gradient-to-r from-cyan-400 to-cyan-500 shadow-md shadow-cyan-500/50' 
                                : 'bg-gray-600/50 hover:bg-gray-500/70 backdrop-blur-sm'
                              }
                              ${currentStep === stepIndex && patterns[padIndex][stepIndex]?.active
                                ? 'ring-2 ring-red-400 ring-opacity-75'
                                : ''
                              }
                            `}
                            title={`Track ${padIndex + 1} (${samples[padIndex]?.name || 'Empty'}), Step ${stepIndex + 1}`}
                          />
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="h-full">
                <div className="text-center mb-4">
                  <h2 className="text-xl font-bold text-pink-300 mb-2 text-shadow-glow">AUDIO EDITOR</h2>
                  <p className="text-gray-300 text-sm">
                    {selectedPad !== null && samples[selectedPad]?.buffer 
                      ? `Editing: ${samples[selectedPad].name}` 
                      : 'Select a pad to edit'
                    }
                  </p>
                </div>
                
                {selectedPad !== null && samples[selectedPad]?.buffer ? (
                  <WaveformEditor
                    sample={samples[selectedPad]}
                    onSampleUpdate={(updatedSample) => {
                      const newSamples = [...samples];
                      newSamples[selectedPad] = updatedSample;
                      setSamples(newSamples);
                      toast.success('Sample settings saved!');
                    }}
                    onClose={() => setSelectedPad(null)}
                  />
                ) : (
                  <div className="flex items-center justify-center h-48">
                    <div className="text-center text-gray-400">
                      <Edit className="w-12 h-12 mx-auto mb-4 opacity-50" />
                      <p>Click on a drum pad to edit its sample</p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Encoder Section */}
        <div className="bg-gray-900/80 backdrop-blur-md p-3 mb-2 rounded-lg border border-pink-500/30 shadow-lg shadow-pink-500/20 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-pink-500/10 via-purple-500/5 to-cyan-500/10 rounded-lg pointer-events-none"></div>
          <div className="relative z-10">
          <div className="grid grid-cols-8 gap-4">
            {Array.from({length: 8}, (_, i) => (
              <div key={i} className="text-center">
                <div className="w-12 h-12 bg-gray-700 rounded-full border-2 border-gray-600 mx-auto mb-2 flex items-center justify-center">
                  <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
                </div>
                <div className="text-xs text-gray-400">
                  {['VOLUME', 'NOTE', 'FIXED VEL', 'PAD MODE', 'KEYBOARD', 'CHORDS', 'STEP', 'MACRO'][i]}
                </div>
              </div>
            ))}
          </div>
          </div>
        </div>

        {/* Main Layout Container */}
        <div className="grid grid-cols-3 gap-4">
          {/* Left Control Panel */}
          <div className="space-y-2">
            {/* Volume & Main Controls */}
            <div className="bg-gray-900/80 backdrop-blur-md p-3 rounded-lg border border-cyan-500/30 shadow-lg shadow-cyan-500/20 relative overflow-hidden flex justify-center">
              <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 via-purple-500/5 to-blue-500/10 rounded-lg pointer-events-none"></div>
              <div className="relative z-10">
                <VolumeKnob
                  value={masterVolume[0]}
                  onChange={(value) => setMasterVolume([value])}
                  size="lg"
                  label="MASTER VOLUME"
                />
              </div>
            </div>

            <div className="bg-gray-900/80 backdrop-blur-md p-2 rounded-lg border border-blue-500/30 shadow-lg shadow-blue-500/20 relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 via-cyan-500/5 to-purple-500/10 rounded-lg pointer-events-none"></div>
              <div className="relative z-10">
                <div className="grid grid-cols-2 gap-2">
                  <Button 
                    onClick={() => setSwing([swing[0] === 0 ? 50 : 0])}
                    variant="outline" 
                    size="sm" 
                    className={`text-xs ${swing[0] > 0 ? 'bg-blue-600 border-blue-500' : 'bg-gray-800 border-gray-600'} text-gray-300`}
                  >
                    SWING
                  </Button>
                  <Button 
                    onClick={() => setBpm([bpm[0] === 120 ? 140 : 120])}
                    variant="outline" 
                    size="sm" 
                    className="bg-gray-800 border-gray-600 text-gray-300 text-xs"
                  >
                    TEMPO
                  </Button>
                  <Button variant="outline" size="sm" className="bg-gray-800 border-gray-600 text-gray-300 text-xs">LOCK</Button>
                  <Button 
                    onClick={() => setSequencerLength(sequencerLength === 16 ? 32 : 16)}
                    variant="outline" 
                    size="sm" 
                    className="bg-gray-800 border-gray-600 text-gray-300 text-xs"
                  >
                    GRID
                  </Button>
                </div>
              </div>
            </div>

            {/* Pattern Controls */}
            <div className="bg-gray-900/80 backdrop-blur-md p-2 rounded-lg border border-purple-500/30 shadow-lg shadow-purple-500/20 relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-purple-500/10 via-pink-500/5 to-cyan-500/10 rounded-lg pointer-events-none"></div>
              <div className="relative z-10">
              <div className="space-y-2">
                <Button 
                  onClick={savePattern}
                  variant="outline" 
                  size="sm" 
                  className="w-full bg-gray-800 border-gray-600 text-gray-300 text-xs"
                >
                  SAVE
                </Button>
                <Button variant="outline" size="sm" className="w-full bg-gray-800 border-gray-600 text-gray-300 text-xs">EVENTS</Button>
                <Button 
                  onClick={randomizePattern}
                  variant="outline" 
                  size="sm" 
                  className="w-full bg-gray-800 border-gray-600 text-gray-300 text-xs"
                >
                  RANDOM
                </Button>
                <Button 
                  onClick={clearPattern}
                  variant="outline" 
                  size="sm" 
                  className="w-full bg-gray-800 border-gray-600 text-gray-300 text-xs"
                >
                  CLEAR
                </Button>
              </div>
              </div>
            </div>

            {/* Track Controls */}
            <div className="bg-gray-900/80 backdrop-blur-md p-2 rounded-lg border border-green-500/30 shadow-lg shadow-green-500/20 relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-green-500/10 via-cyan-500/5 to-blue-500/10 rounded-lg pointer-events-none"></div>
              <div className="relative z-10">
              <div className="space-y-2">
                <Button variant="outline" size="sm" className="w-full bg-gray-800 border-gray-600 text-gray-300 text-xs">SELECT</Button>
                <Button 
                  onClick={() => setTrackSolos(trackSolos.map(() => false))}
                  variant="outline" 
                  size="sm" 
                  className="w-full bg-gray-800 border-gray-600 text-gray-300 text-xs"
                >
                  UNSOLO
                </Button>
                <Button 
                  onClick={() => setTrackMutes(trackMutes.map(() => false))}
                  variant="outline" 
                  size="sm" 
                  className="w-full bg-gray-800 border-gray-600 text-gray-300 text-xs"
                >
                  UNMUTE
                </Button>
              </div>
              </div>
            </div>

            {/* Transport Controls */}
            <div className="bg-gray-900/80 backdrop-blur-md p-3 rounded-lg border border-orange-500/30 shadow-lg shadow-orange-500/20 relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-orange-500/10 via-red-500/5 to-pink-500/10 rounded-lg pointer-events-none"></div>
              <div className="relative z-10">
              <div className="grid grid-cols-2 gap-2 mb-2">
                <Button variant="outline" size="sm" className="bg-gray-800 border-gray-600 text-gray-300 text-xs">RESTART</Button>
                <Button variant="outline" size="sm" className="bg-gray-800 border-gray-600 text-gray-300 text-xs">ERASE</Button>
                <Button variant="outline" size="sm" className="bg-gray-800 border-gray-600 text-gray-300 text-xs">TAP</Button>
                <Button variant="outline" size="sm" className="bg-gray-800 border-gray-600 text-gray-300 text-xs">FOLLOW</Button>
              </div>
              
              <div className="grid grid-cols-4 gap-1">
                <Button 
                  onClick={isPlaying ? handlePause : handlePlay}
                  variant="outline" 
                  size="sm" 
                  className={`text-xs ${isPlaying ? 'bg-orange-700 border-orange-600' : 'bg-green-700 border-green-600'} text-white`}
                >
                  {isPlaying ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                </Button>
                <Button 
                  onClick={() => setRecordMode(!recordMode)}
                  variant="outline" 
                  size="sm" 
                  className={`text-xs ${recordMode ? 'bg-red-700 border-red-600' : 'bg-gray-800 border-gray-600'} text-white`}
                >
                  <Mic className="h-3 w-3" />
                </Button>
                <Button 
                  onClick={handleStop}
                  variant="outline" 
                  size="sm" 
                  className="bg-red-700 border-red-600 text-white text-xs"
                >
                  <Square className="h-3 w-3" />
                </Button>
                <Button variant="outline" size="sm" className="bg-gray-800 border-gray-600 text-gray-300 text-xs">SHIFT</Button>
              </div>
              </div>
            </div>
          </div>

          {/* Center Track Controls */}
          <div className="bg-gray-900/80 backdrop-blur-md p-4 rounded-lg border border-cyan-500/30 shadow-lg shadow-cyan-500/20 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 via-blue-500/5 to-purple-500/10 rounded-lg pointer-events-none"></div>
            <div className="relative z-10">
            <div className="space-y-3">
              <div className="text-xs text-gray-400 mb-4">TRACK CONTROLS</div>
              
              {/* Track Volume Controls */}
              <div className="grid grid-cols-4 gap-2">
                {Array.from({length: 16}, (_, i) => (
                  <div key={i} className="flex justify-center items-center">
                    <VolumeKnob
                      value={trackVolumes[i]}
                      onChange={(value) => {
                        const newVolumes = [...trackVolumes];
                        newVolumes[i] = value;
                        setTrackVolumes(newVolumes);
                      }}
                      size="sm"
                      label={`T${i + 1}`}
                    />
                  </div>
                ))}
              </div>

            </div>
            </div>
          </div>

          {/* Right Drum Pads */}
          <div className="bg-gray-900/80 backdrop-blur-md p-3 rounded-lg border border-purple-500/30 shadow-lg shadow-purple-500/20 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-purple-500/10 via-blue-500/5 to-cyan-500/10 rounded-lg pointer-events-none"></div>
            <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-transparent rounded-lg pointer-events-none"></div>
            
            <div className="grid grid-cols-4 gap-2 relative z-10">
              {Array.from({length: 16}, (_, i) => (
                <button
                  key={i}
                  onClick={() => setSelectedPad(i)}
                  onMouseDown={() => handlePadPress(i)}
                  onMouseUp={() => handlePadRelease(i)}
                  onMouseLeave={() => handlePadRelease(i)}
                  onTouchStart={() => handlePadPress(i)}
                  onTouchEnd={() => handlePadRelease(i)}
                  className={`
                    h-16 w-16 rounded-lg text-xs font-bold transition-all duration-150 active:scale-95 border backdrop-blur-sm relative overflow-hidden
                    ${samples[i]?.buffer 
                      ? getPadColor(i) + '/80 border-cyan-400/50 text-white shadow-lg shadow-cyan-500/30' 
                      : 'bg-gray-700/40 border-purple-400/30 text-gray-300 hover:bg-gray-600/50 hover:border-purple-400/50'
                    }
                    ${isRecording && selectedPad === i ? 'animate-pulse ring-2 ring-red-500 shadow-lg shadow-red-500/50' : ''}
                    ${selectedPad === i ? 'ring-2 ring-cyan-400 shadow-lg shadow-cyan-500/70 border-cyan-400' : ''}
                  `}
                >
                  {samples[i]?.buffer 
                    ? (samples[i].name.split(' ')[1] || (i + 1).toString())
                    : isRecording && selectedPad === i 
                      ? 'REC' 
                      : i + 1
                  }
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Additional Controls */}
        <div className="mt-4 p-3 bg-gray-900 rounded border border-gray-700 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/5 via-purple-500/5 to-pink-500/5 rounded pointer-events-none"></div>
          
          <div className="relative z-10">
            <div className="grid grid-cols-3 gap-6">
              {/* Global Controls */}
              <div>
                <div className="text-xs text-gray-400 mb-2">GLOBAL</div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400 w-12">BPM</span>
                    <Slider
                      value={bpm}
                      onValueChange={setBpm}
                      min={60}
                      max={200}
                      step={1}
                      className="flex-1"
                    />
                    <span className="text-xs text-gray-400 w-8">{bpm[0]}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400 w-12">Swing</span>
                    <Slider
                      value={swing}
                      onValueChange={setSwing}
                      min={0}
                      max={100}
                      step={1}
                      className="flex-1"
                    />
                    <span className="text-xs text-gray-400 w-8">{swing[0]}%</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400 w-12">Steps</span>
                    <Select value={sequencerLength.toString()} onValueChange={(value) => setSequencerLength(parseInt(value))}>
                      <SelectTrigger className="flex-1 h-6 text-xs bg-gray-800 border-gray-600">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[8, 16, 32, 64].map(steps => (
                          <SelectItem key={steps} value={steps.toString()}>{steps}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* Neural Controls */}
              <div>
                <div className="text-xs text-gray-400 mb-2">NEURAL ENGINE</div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400 w-12">Temp</span>
                    <Slider
                      value={temperature}
                      onValueChange={setTemperature}
                      min={0.5}
                      max={2.0}
                      step={0.1}
                      className="flex-1"
                    />
                    <span className="text-xs text-gray-400 w-8">{temperature[0].toFixed(1)}</span>
                  </div>
                </div>
              </div>

              {/* Pattern Management */}
              <div>
                <div className="text-xs text-gray-400 mb-2">PATTERNS</div>
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-1">
                    <Button onClick={savePattern} variant="outline" size="sm" className="h-6 text-xs bg-gray-800 border-gray-600">
                      <Save className="h-3 w-3" />
                    </Button>
                    <Button onClick={clearPattern} variant="outline" size="sm" className="h-6 text-xs bg-gray-800 border-gray-600">
                      <RotateCcw className="h-3 w-3" />
                    </Button>
                  </div>
                  <Button onClick={randomizePattern} variant="outline" size="sm" className="w-full h-6 text-xs bg-gray-800 border-gray-600">
                    Randomize
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>


        <input ref={fileInputRef} type="file" accept="audio/*" onChange={handleFileLoad} className="hidden" />
      </div>
    </div>
  );
};

export default DrumMachine;
