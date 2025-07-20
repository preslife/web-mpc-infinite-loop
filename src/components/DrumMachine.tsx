import { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from '@/components/ui/context-menu';
import { Play, Pause, Square, Mic, Volume2, Upload, Save, FolderOpen, Copy, RotateCcw, VolumeX, Download, Edit, RefreshCw, Sparkles, X, Music } from 'lucide-react';
import { toast } from 'sonner';
import { WaveformEditor } from './WaveformEditor';
import { PatternManager } from './PatternManager';
import { AudioExporter } from './AudioExporter';
import { SongMode } from './SongMode';
import { MixerPanel } from './MixerPanel';
import { NeuralDrumGenerator } from './NeuralDrumGenerator';
import { SampleLibrary } from './SampleLibrary';
import { SampleOrganizer } from './SampleOrganizer';
import { VisualFeedback } from './VisualFeedback';
import { VolumeKnob } from './VolumeKnob';
import { SimpleKnob } from './SimpleKnob';
import { KeyboardShortcutsHelp } from './KeyboardShortcutsHelp';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useNavigate } from 'react-router-dom';
import { SampleGenerator } from '@/utils/sampleGenerator';

interface Sample {
  buffer: AudioBuffer;
  name: string;
  startTime: number;
  endTime: number;
  gateMode: boolean;
  pitch: number;
  reverse: boolean;
  volume: number;
}

interface Step {
  active: boolean;
  velocity: number;
}

interface Pattern {
  name: string;
  steps: Step[][];
}

interface Song {
  name: string;
  patterns: { patternIndex: number; repeats: number }[];
}

interface TrackEffect {
  reverb: { wet: number; roomSize: number; decay: number };
  delay: { wet: number; time: number; feedback: number };
  filter: { type: 'lowpass' | 'highpass' | 'bandpass'; frequency: number; resonance: number };
  eq: { low: number; mid: number; high: number };
}

const DrumMachine = () => {
  const navigate = useNavigate();
  
  // Core state declarations
  const [samples, setSamples] = useState<(Sample | null)[]>(Array(16).fill(null));
  const [patterns, setPatterns] = useState<Step[][]>(Array(16).fill(null).map(() => Array(16).fill({ active: false, velocity: 80 })));
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [bpm, setBpm] = useState([120]);
  const [selectedTrack, setSelectedTrack] = useState<number | null>(null);
  const [selectedPad, setSelectedPad] = useState<number | null>(null);
  const [sequencerLength, setSequencerLength] = useState(16);
  const [swing, setSwing] = useState([0]);
  const [trackVolumes, setTrackVolumes] = useState<number[]>(Array(16).fill(0.8));
  const [trackMutes, setTrackMutes] = useState<boolean[]>(Array(16).fill(false));
  const [trackSolos, setTrackSolos] = useState<boolean[]>(Array(16).fill(false));
  const [trackPans, setTrackPans] = useState<number[]>(Array(16).fill(0));
  const [trackEffects, setTrackEffects] = useState<TrackEffect[]>(Array(16).fill(null).map(() => ({
    reverb: { wet: 0, roomSize: 0.5, decay: 2 },
    delay: { wet: 0, time: 0.25, feedback: 0.3 },
    filter: { type: 'lowpass', frequency: 20000, resonance: 1 },
    eq: { low: 0, mid: 0, high: 0 }
  })));
  const [showMixerPanel, setShowMixerPanel] = useState(false);
  const [showEffects, setShowEffects] = useState<boolean[]>(Array(16).fill(false));
  const [savedPatterns, setSavedPatterns] = useState<Pattern[]>([]);
  const [currentPatternName, setCurrentPatternName] = useState('Pattern 1');
  const [editingSample, setEditingSample] = useState<number | null>(null);
  const [selectedSample, setSelectedSample] = useState<Sample | null>(null);
  const [pendingSample, setPendingSample] = useState<{
    sample: Sample;
    padIndex: number;
  } | null>(null);
  const [sampleQueue, setSampleQueue] = useState<{
    sample: Sample;
    padIndex: number;
  }[]>([]);
  const [playingSources, setPlayingSources] = useState<Map<number, AudioBufferSourceNode>>(new Map());
  const [displayMode, setDisplayMode] = useState<'sequencer' | 'editor' | 'patterns' | 'export' | 'song' | 'neural'>('sequencer');
  const [masterVolume, setMasterVolume] = useState(0.8);
  const [songs, setSongs] = useState<Song[]>([]);
  const [currentSong, setCurrentSong] = useState<Song | null>(null);
  const [isPatternChaining, setIsPatternChaining] = useState(false);
  const [quantizeEnabled, setQuantizeEnabled] = useState(false);
  const [quantizeStrength, setQuantizeStrength] = useState(100);
  const [quantizeGrid, setQuantizeGrid] = useState<'1/16' | '1/8' | '1/4' | '1/2'>('1/16');
  const [velocitySensitive, setVelocitySensitive] = useState(true);
  const [padVelocities, setPadVelocities] = useState<number[]>(Array(16).fill(100));
  const [seedLength, setSeedLength] = useState(4);
  const [temperature, setTemperature] = useState([1.1]);
  const [isGenerating, setIsGenerating] = useState(false);
  const rnnRef = useRef<any>(null);
  const [neuralEnabled, setNeuralEnabled] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sampleGeneratorRef = useRef<SampleGenerator | null>(null);
  const [midiAccess, setMidiAccess] = useState<MIDIAccess | null>(null);
  const [midiDevices, setMidiDevices] = useState<MIDIInput[]>([]);
  const [midiEnabled, setMidiEnabled] = useState(false);
  const [midiMapping, setMidiMapping] = useState<{[key: number]: number}>({
    36: 0, 37: 1, 38: 2, 39: 3, 40: 4, 41: 5, 42: 6, 43: 7,
    44: 8, 45: 9, 46: 10, 47: 11, 48: 12, 49: 13, 50: 14, 51: 15
  });
  const [showMidiPanel, setShowMidiPanel] = useState(false);
  const [midiLearning, setMidiLearning] = useState<number | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [patternTarget, setPatternTarget] = useState<'selected' | 'all'>('all');

  const audioContextRef = useRef<AudioContext | null>(null);
  const sequencerTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const effectNodesRef = useRef<Map<number, any>>(new Map());

  // Audio context initialization
  useEffect(() => {
    if (typeof window !== 'undefined') {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  // Process next sample in queue
  const processNextInQueue = () => {
    setSampleQueue(prev => {
      if (prev.length > 0) {
        const [nextSample, ...remaining] = prev;
        setPendingSample(nextSample);
        setDisplayMode('editor');
        console.log(`Processing next sample from queue: ${nextSample.sample.name} for pad ${nextSample.padIndex}`);
        return remaining;
      }
      return prev;
    });
  };

  // Load samples from a drum kit
  const loadKitSamples = async (kit: any) => {
    try {
      console.log(`Loading kit: ${kit.name} with ${kit.samples.length} samples`);
      
      // Load all samples in parallel (don't await individual ones)
      const loadPromises = [];
      for (let i = 0; i < Math.min(kit.samples.length, 16); i++) {
        const sample = kit.samples[i];
        console.log(`Starting load for sample ${i}: ${sample.name} from ${sample.url}`);
        loadPromises.push(loadSampleFromUrl(sample.url, sample.name, i));
      }
      
      // Wait for all to complete (or fail)
      const results = await Promise.allSettled(loadPromises);
      
      let successCount = 0;
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          successCount++;
          console.log(`Sample ${index} loaded successfully`);
        } else {
          console.error(`Sample ${index} failed:`, result.reason);
        }
      });
      
      toast.success(`Started loading ${kit.name} drum kit! (${successCount}/${kit.samples.length} samples queued)`);
    } catch (error) {
      console.error('Error loading kit:', error);
      toast.error('Failed to load some samples from kit');
    }
  };

  // Load a single sample from URL with queue system
  const loadSampleFromUrl = async (url: string, name: string, padIndex: number) => {
    try {
      console.log(`Attempting to load sample: ${name} from URL: ${url} for pad ${padIndex}`);
      if (!audioContextRef.current) return;
      
      const response = await fetch(url);
      console.log(`Fetch response status: ${response.status}, ok: ${response.ok}`);
      
      if (!response.ok) {
        console.log(`HTTP error, generating synthetic ${name} sample`);
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const arrayBuffer = await response.arrayBuffer();
      console.log(`ArrayBuffer length: ${arrayBuffer.byteLength} bytes`);
      
      // Check if response is actually HTML (error page) instead of audio
      const text = new TextDecoder().decode(arrayBuffer.slice(0, 100));
      if (text.includes('<!DOCTYPE') || text.includes('<html>')) {
        console.log(`Detected HTML response for ${name}, generating synthetic sample`);
        
        // Generate synthetic sample instead
        const { SampleGenerator } = await import('../utils/sampleGenerator');
        const generator = new SampleGenerator(audioContextRef.current);
        
        let audioBuffer: AudioBuffer;
        const lowerName = name.toLowerCase();
        if (lowerName.includes('kick')) {
          console.log('Generating synthetic kick');
          audioBuffer = generator.generateKick();
        } else if (lowerName.includes('snare')) {
          console.log('Generating synthetic snare');
          audioBuffer = generator.generateSnare();
        } else if (lowerName.includes('hat') || lowerName.includes('hi-hat')) {
          console.log('Generating synthetic hi-hat');
          audioBuffer = generator.generateHiHat();
        } else {
          console.log('Generating synthetic percussion');
          audioBuffer = generator.generatePerc();
        }
        
        console.log(`Generated synthetic ${name}: ${audioBuffer.duration}s, ${audioBuffer.sampleRate}Hz`);
        
        const sample: Sample = {
          buffer: audioBuffer,
          name: `${name} (Generated)`,
          startTime: 0,
          endTime: 1,
          gateMode: true,
          pitch: 0,
          reverse: false,
          volume: 0.8
        };
        
        console.log(`Adding sample to queue for pad ${padIndex}: ${sample.name}`);
        // Add to queue instead of setting pending immediately
        setSampleQueue(prev => [...prev, {
          sample,
          padIndex
        }]);
        
        // If no sample is currently pending, start processing queue
        setTimeout(() => {
          setSampleQueue(prev => {
            if (prev.length > 0 && !pendingSample) {
              const [nextSample, ...remaining] = prev;
              setPendingSample(nextSample);
              setDisplayMode('editor');
              console.log(`Processing next sample from queue: ${nextSample.sample.name} for pad ${nextSample.padIndex}`);
              return remaining;
            }
            return prev;
          });
        }, 100);
        return;
      }
      
      const audioBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer);
      console.log(`Audio decoded successfully: ${audioBuffer.duration}s, ${audioBuffer.sampleRate}Hz`);
      
      const sample: Sample = {
        buffer: audioBuffer,
        name: name,
        startTime: 0,
        endTime: 1,
        gateMode: true,
        pitch: 0,
        reverse: false,
        volume: 0.8
      };
      
      console.log(`Adding sample to queue for pad ${padIndex}: ${sample.name}`);
      // Add to queue instead of setting pending immediately
      setSampleQueue(prev => [...prev, {
        sample,
        padIndex
      }]);
      
      // If no sample is currently pending, start processing queue
      setTimeout(() => {
        setSampleQueue(prev => {
          if (prev.length > 0 && !pendingSample) {
            const [nextSample, ...remaining] = prev;
            setPendingSample(nextSample);
            setDisplayMode('editor');
            console.log(`Processing next sample from queue: ${nextSample.sample.name} for pad ${nextSample.padIndex}`);
            return remaining;
          }
          return prev;
        });
      }, 100);
      
    } catch (error) {
      console.error(`Failed to load sample ${name} from ${url}:`, error);
      
      // On any error, try to generate a synthetic sample as fallback
      try {
        console.log(`Generating fallback synthetic sample for ${name}`);
        if (!audioContextRef.current) return;
        
        const { SampleGenerator } = await import('../utils/sampleGenerator');
        const generator = new SampleGenerator(audioContextRef.current);
        
        let audioBuffer: AudioBuffer;
        const lowerName = name.toLowerCase();
        if (lowerName.includes('kick')) {
          audioBuffer = generator.generateKick();
        } else if (lowerName.includes('snare')) {
          audioBuffer = generator.generateSnare();
        } else if (lowerName.includes('hat') || lowerName.includes('hi-hat')) {
          audioBuffer = generator.generateHiHat();
        } else {
          audioBuffer = generator.generatePerc();
        }
        
        const sample: Sample = {
          buffer: audioBuffer,
          name: `${name} (Generated)`,
          startTime: 0,
          endTime: 1,
          gateMode: true,
          pitch: 0,
          reverse: false,
          volume: 0.8
        };
        
        console.log(`Adding fallback sample to queue for pad ${padIndex}: ${sample.name}`);
        setSampleQueue(prev => [...prev, {
          sample,
          padIndex
        }]);
        
        setTimeout(() => {
          setSampleQueue(prev => {
            if (prev.length > 0 && !pendingSample) {
              const [nextSample, ...remaining] = prev;
              setPendingSample(nextSample);
              setDisplayMode('editor');
              console.log(`Processing next sample from queue: ${nextSample.sample.name} for pad ${nextSample.padIndex}`);
              return remaining;
            }
            return prev;
          });
        }, 100);
      } catch (synthError) {
        console.error('Failed to generate synthetic sample:', synthError);
        toast.error(`Failed to load or generate sample: ${name}`);
      }
    }
  };

  const updateSample = (updatedSample: Sample) => {
    if (pendingSample) {
      setPendingSample({
        ...pendingSample,
        sample: updatedSample
      });
    } else if (selectedSample) {
      const newSamples = [...samples];
      const index = newSamples.findIndex(s => s === selectedSample);
      if (index !== -1) {
        newSamples[index] = updatedSample;
        setSamples(newSamples);
      }
    }
  };

  const confirmPendingSample = () => {
    if (pendingSample) {
      const newSamples = [...samples];
      newSamples[pendingSample.padIndex] = pendingSample.sample;
      setSamples(newSamples);
      setPendingSample(null);
      toast.success(`Sample confirmed and loaded to pad ${pendingSample.padIndex + 1}!`);
      
      // Process next sample in queue if any
      setTimeout(() => processNextInQueue(), 100);
    }
  };

  const cancelPendingSample = () => {
    if (pendingSample) {
      setPendingSample(null);
      toast.info('Sample loading cancelled');
      
      // Process next sample in queue if any
      setTimeout(() => processNextInQueue(), 100);
    }
  };

  // All other functions
  const playPad = useCallback((padIndex: number, velocity: number = 80, forceGateMode?: boolean) => {
    if (!audioContextRef.current || !samples[padIndex]?.buffer) return;

    const shouldPlay = !trackMutes[padIndex] && (trackSolos.every(s => !s) || trackSolos[padIndex]);
    if (!shouldPlay) return;

    const sampleGateMode = forceGateMode ?? samples[padIndex]?.gateMode ?? true;

    if (sampleGateMode) {
      const existingSource = playingSources.get(padIndex);
      if (existingSource) {
        try {
          existingSource.stop();
        } catch (e) { }
      }
    }

    const source = audioContextRef.current.createBufferSource();
    const gainNode = audioContextRef.current.createGain();
    
    source.buffer = samples[padIndex]!.buffer;
    
    const velocityMultiplier = velocitySensitive ? velocity / 127 : 1;
    const sampleVolume = samples[padIndex]?.volume ?? 0.8;
    const trackVolume = trackVolumes[padIndex];
    gainNode.gain.value = sampleVolume * trackVolume * velocityMultiplier * masterVolume;
    
    source.connect(gainNode);
    gainNode.connect(audioContextRef.current.destination);
    
    source.start();
    
    if (sampleGateMode) {
      setPlayingSources(prev => new Map(prev.set(padIndex, source)));
      source.onended = () => {
        setPlayingSources(prev => {
          const newMap = new Map(prev);
          newMap.delete(padIndex);
          return newMap;
        });
      };
    }
  }, [samples, trackMutes, trackSolos, trackVolumes, masterVolume, velocitySensitive, playingSources]);

  const toggleStep = (trackIndex: number, stepIndex: number) => {
    const newPatterns = [...patterns];
    newPatterns[trackIndex] = [...newPatterns[trackIndex]];
    newPatterns[trackIndex][stepIndex] = {
      ...newPatterns[trackIndex][stepIndex],
      active: !newPatterns[trackIndex][stepIndex].active
    };
    setPatterns(newPatterns);
  };

  const handlePadPress = (padIndex: number) => {
    playPad(padIndex, padVelocities[padIndex]);
    setSelectedPad(padIndex);
    if (editingSample !== null) {
      setEditingSample(null);
      setSelectedSample(null);
    }
  };

  // Keyboard shortcuts, etc.
  useKeyboardShortcuts({
    onPlay: () => setIsPlaying(!isPlaying),
    onStop: () => {
      setIsPlaying(false);
      setCurrentStep(0);
    },
    onRecord: () => {},
    onClear: () => {
      setPatterns(Array(16).fill(null).map(() => Array(16).fill({ active: false, velocity: 80 })));
    },
    onVolumeUp: () => setMasterVolume(prev => Math.min(1, prev + 0.1)),
    onVolumeDown: () => setMasterVolume(prev => Math.max(0, prev - 0.1)),
    onPadPress: padIndex => handlePadPress(padIndex),
    onStepToggle: stepIndex => {
      if (selectedTrack !== null && stepIndex < sequencerLength) {
        toggleStep(selectedTrack, stepIndex);
      }
    }
  });

  return (
    <div className="min-h-screen bg-black p-2 font-mono">
      <div className="max-w-7xl mx-auto">
        {/* Top Control Bar */}
        <div className="bg-gray-900 p-2 mb-2 rounded border border-gray-700 mx-[15px]">
          <div className="flex items-center justify-between">
            <div className="text-white font-bold text-lg tracking-wider">X BEAT STUDIO</div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="bg-gray-800 border-gray-600 text-gray-300 text-xs hover:bg-purple-800/20 hover:border-purple-400 neon-border" onClick={() => navigate('/library')}>
                <Music className="w-3 h-3 mr-1" />
                LIBRARY
              </Button>
            </div>
          </div>
        </div>

        {/* Main content area with conditional rendering */}
        {displayMode === 'patterns' ? (
          <div className="h-full overflow-auto p-4">
            <div className="text-center text-white">Pattern Manager - Coming Soon</div>
          </div>
        ) : displayMode === 'export' ? (
          <div className="h-full overflow-auto p-4">
            <AudioExporter 
              patterns={patterns} 
              samples={samples} 
              bpm={bpm[0]} 
              sequencerLength={sequencerLength} 
              trackVolumes={trackVolumes} 
              trackMutes={trackMutes} 
              trackSolos={trackSolos} 
              masterVolume={masterVolume} 
              swing={swing[0]} 
            />
          </div>
        ) : displayMode === 'editor' ? (
          <div className="h-full overflow-auto">
            {pendingSample ? (
              <div className="h-full overflow-auto p-2">
                <WaveformEditor 
                  sample={pendingSample.sample} 
                  onSampleUpdate={updateSample} 
                  onConfirm={confirmPendingSample} 
                  showConfirm={true} 
                  onClose={cancelPendingSample} 
                  audioContext={audioContextRef.current} 
                />
              </div>
            ) : (
              <div className="text-center mb-2">
                <p className="text-gray-300 text-sm">
                  {selectedPad !== null && samples[selectedPad]?.buffer 
                    ? `Editing: ${samples[selectedPad].name}` 
                    : 'Select a pad to edit or upload a new sample to edit'}
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-gray-900 rounded border border-gray-700 mx-[15px] mb-2">
            {/* Main Sequencer Interface */}
            <div className="p-4">
              <div className="grid grid-cols-4 gap-2 mb-4">
                {Array.from({ length: 16 }, (_, i) => (
                  <Button
                    key={i}
                    variant="outline"
                    size="lg"
                    className={`h-16 text-white font-bold text-sm border-2 transition-all duration-100 ${
                      samples[i]?.buffer ? 'bg-blue-600 border-blue-400' : 'bg-gray-700 border-gray-600'
                    } ${selectedPad === i ? 'ring-2 ring-purple-400' : ''}`}
                    onClick={() => handlePadPress(i)}
                  >
                    {samples[i]?.name ? samples[i].name.slice(0, 8) : `PAD ${i + 1}`}
                  </Button>
                ))}
              </div>
              
              {/* Basic Controls */}
              <div className="flex gap-4 items-center justify-center">
                <Button
                  onClick={() => setIsPlaying(!isPlaying)}
                  variant="outline"
                  size="sm"
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  {isPlaying ? 'PAUSE' : 'PLAY'}
                </Button>
                
                <div className="flex items-center gap-2">
                  <span className="text-white text-sm">BPM:</span>
                  <Slider
                    value={bpm}
                    onValueChange={setBpm}
                    min={60}
                    max={200}
                    step={1}
                    className="w-24"
                  />
                  <span className="text-white text-sm w-8">{bpm[0]}</span>
                </div>
                
                <Button
                  onClick={() => setDisplayMode('editor')}
                  variant="outline"
                  size="sm"
                  className="bg-purple-600 hover:bg-purple-700 text-white"
                >
                  <Edit className="w-4 h-4 mr-1" />
                  EDIT
                </Button>
              </div>
            </div>
            
            {/* Sample Library */}
            <div className="p-4 border-t border-gray-700">
              <SampleLibrary onLoadKit={loadKitSamples} onLoadSample={() => {}} />
            </div>
          </div>
        )}

        <input 
          ref={fileInputRef} 
          type="file" 
          accept="audio/*" 
          onChange={() => {}} 
          className="hidden" 
        />
      </div>
      
      <VisualFeedback 
        isPlaying={isPlaying} 
        currentStep={currentStep} 
        bpm={bpm[0]} 
        sequencerLength={sequencerLength} 
        patterns={patterns} 
      />
    </div>
  );
};

export default DrumMachine;
