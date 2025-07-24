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
import { VisualFeedback, WaveformVisualizer } from './VisualFeedback';
import { VolumeKnob } from './VolumeKnob';
import { SimpleKnob } from './SimpleKnob';
import { KeyboardShortcutsHelp } from './KeyboardShortcutsHelp';
import { SampleOrganizer } from './SampleOrganizer';
import { NeuralDrumGenerator } from './NeuralDrumGenerator';
import { useNavigate } from 'react-router-dom';
import * as mm from '@magenta/music';
import useKeyboardShortcuts from '@/hooks/useKeyboardShortcuts';
import { SampleGenerator, defaultSampleConfigs } from '@/utils/sampleGenerator';
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
interface PatternStep {
  active: boolean;
  velocity: number; // 0 to 127 (MIDI standard)
}
interface Pattern {
  name: string;
  steps: PatternStep[][];
  bpm: number;
  swing: number;
  length: number; // pattern length in steps
}
interface Song {
  name: string;
  patterns: string[]; // array of pattern names
  currentPatternIndex: number;
}
const DrumMachine = () => {
  const navigate = useNavigate();
  const audioContextRef = useRef<AudioContext | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isPatternRecording, setIsPatternRecording] = useState(false);
  const [currentStep, setCurrentStep] = useState(-1);
  const [bpm, setBpm] = useState([120]);
  const [sequencerLength, setSequencerLength] = useState(16);
  const [samples, setSamples] = useState<Sample[]>(Array(16).fill({
    buffer: null,
    name: '',
    startTime: 0,
    endTime: 1,
    gateMode: true,
    pitch: 0,
    reverse: false,
    volume: 0.8
  }));
  const [patterns, setPatterns] = useState<PatternStep[][]>(Array(16).fill(null).map(() => Array(64).fill({
    active: false,
    velocity: 80
  })));
  const [trackVolumes, setTrackVolumes] = useState<number[]>(Array(16).fill(80));
  const [trackPans, setTrackPans] = useState<number[]>(Array(16).fill(50)); // 50 = center pan
  const [trackMutes, setTrackMutes] = useState<boolean[]>(Array(16).fill(false));
  const [trackSolos, setTrackSolos] = useState<boolean[]>(Array(16).fill(false));
  const [selectedPad, setSelectedPad] = useState<number | null>(null);
  const [selectedTrack, setSelectedTrack] = useState<number | null>(null);
  const [lastTrackClickTime, setLastTrackClickTime] = useState<{
    [key: number]: number;
  }>({});
  const [recordMode, setRecordMode] = useState(false);
  const [swing, setSwing] = useState([0]);
  const [savedPatterns, setSavedPatterns] = useState<Pattern[]>([]);
  const [currentPatternName, setCurrentPatternName] = useState('Pattern 1');
  const [editingSample, setEditingSample] = useState<number | null>(null);
  const [selectedSample, setSelectedSample] = useState<Sample | null>(null);
  const [pendingSample, setPendingSample] = useState<{
    sample: Sample;
    padIndex: number;
  } | null>(null);
  const [playingSources, setPlayingSources] = useState<Map<number, AudioBufferSourceNode>>(new Map());
  const [playingGainNodes, setPlayingGainNodes] = useState<Map<number, GainNode>>(new Map());
  const [displayMode, setDisplayMode] = useState<'sequencer' | 'editor' | 'patterns' | 'export' | 'song' | 'neural'>('sequencer');
  const [masterVolume, setMasterVolume] = useState(0.8);

  // Song mode state
  const [songs, setSongs] = useState<Song[]>([]);
  const [currentSong, setCurrentSong] = useState<Song | null>(null);
  const [isPatternChaining, setIsPatternChaining] = useState(false);

  // Quantization settings
  const [quantizeEnabled, setQuantizeEnabled] = useState(false);
  const [quantizeStrength, setQuantizeStrength] = useState(100); // 0-100%
  const [quantizeGrid, setQuantizeGrid] = useState<'1/16' | '1/8' | '1/4' | '1/2'>('1/16');

  // Velocity-sensitive pads
  const [velocitySensitive, setVelocitySensitive] = useState(true);
  const [padVelocities, setPadVelocities] = useState<number[]>(Array(16).fill(100)); // Current velocity for each pad

  // Neural generation state
  const [seedLength, setSeedLength] = useState(4);
  const [temperature, setTemperature] = useState([1.1]);
  const [isGenerating, setIsGenerating] = useState(false);
  const rnnRef = useRef<any>(null);
  const [neuralEnabled, setNeuralEnabled] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sampleGeneratorRef = useRef<SampleGenerator | null>(null);

  // MIDI support state
  const [midiAccess, setMidiAccess] = useState<MIDIAccess | null>(null);
  const [midiDevices, setMidiDevices] = useState<MIDIInput[]>([]);
  const [midiEnabled, setMidiEnabled] = useState(false);
  const [midiMapping, setMidiMapping] = useState<{
    [key: number]: number;
  }>({
    36: 0,
    37: 1,
    38: 2,
    39: 3,
    40: 4,
    41: 5,
    42: 6,
    43: 7,
    44: 8,
    45: 9,
    46: 10,
    47: 11,
    48: 12,
    49: 13,
    50: 14,
    51: 15
  });
  const [midiLearning, setMidiLearning] = useState<number | null>(null);
  const [showMidiPanel, setShowMidiPanel] = useState(false);
  const [patternTarget, setPatternTarget] = useState<'all' | 'selected'>('all');
  const sequencerTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Sample loading queue state
  const [sampleQueue, setSampleQueue] = useState<Array<{
    sample: Sample;
    padIndex: number;
    name: string;
  }>>([]);
  const [currentQueueIndex, setCurrentQueueIndex] = useState(0);

  // Audio effects state
  const [trackEffects, setTrackEffects] = useState<Array<{
    reverb: {
      enabled: boolean;
      roomSize: number;
      decay: number;
      wet: number;
    };
    delay: {
      enabled: boolean;
      time: number;
      feedback: number;
      wet: number;
    };
    filter: {
      enabled: boolean;
      frequency: number;
      resonance: number;
      type: 'lowpass' | 'highpass' | 'bandpass';
    };
    eq: {
      enabled: boolean;
      low: number;
      mid: number;
      high: number;
    };
  }>>(Array(16).fill({
    reverb: {
      enabled: false,
      roomSize: 0.5,
      decay: 2,
      wet: 0.3
    },
    delay: {
      enabled: false,
      time: 0.25,
      feedback: 0.3,
      wet: 0.3
    },
    filter: {
      enabled: false,
      frequency: 1000,
      resonance: 1,
      type: 'lowpass'
    },
    eq: {
      enabled: false,
      low: 0,
      mid: 0,
      high: 0
    }
  }));
  const [selectedEffectTrack, setSelectedEffectTrack] = useState<number | null>(null);

  // Audio effect nodes
  const effectNodesRef = useRef<Map<number, {
    reverb?: ConvolverNode;
    reverbGain?: GainNode;
    reverbDry?: GainNode;
    delay?: DelayNode;
    delayGain?: GainNode;
    delayFeedback?: GainNode;
    delayWet?: GainNode;
    delayDry?: GainNode;
    filter?: BiquadFilterNode;
    eqLow?: BiquadFilterNode;
    eqMid?: BiquadFilterNode;
    eqHigh?: BiquadFilterNode;
    gainNode?: GainNode;
    panner?: StereoPannerNode;
  }>>(new Map());

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

    // Initialize MIDI
    const initializeMIDI = async () => {
      try {
        if (navigator.requestMIDIAccess) {
          const access = await navigator.requestMIDIAccess();
          setMidiAccess(access);
          setMidiEnabled(true);

          // Get all MIDI input devices
          const inputs = Array.from(access.inputs.values());
          setMidiDevices(inputs);

          // Set up MIDI event listeners
          inputs.forEach(input => {
            input.onmidimessage = handleMIDIMessage;
          });

          // Listen for device connection/disconnection
          access.onstatechange = () => {
            const newInputs = Array.from(access.inputs.values());
            setMidiDevices(newInputs);
            newInputs.forEach(input => {
              input.onmidimessage = handleMIDIMessage;
            });
          };
          toast.success(`MIDI enabled - ${inputs.length} device(s) connected`);
        } else {
          console.warn('Web MIDI API not supported');
          toast.info('MIDI not supported in this browser');
        }
      } catch (error) {
        console.warn('MIDI initialization failed:', error);
        toast.info('MIDI access denied or unavailable');
      }
    };
    initializeMIDI();
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

  // Check for kit/sample selections from library
  useEffect(() => {
    const selectedKit = localStorage.getItem('selectedKit');
    const selectedSamples = localStorage.getItem('selectedSamples');
    if (selectedKit) {
      const kit = JSON.parse(selectedKit);
      loadKitSamples(kit);
      localStorage.removeItem('selectedKit');
    }
    if (selectedSamples) {
      const sampleData = JSON.parse(selectedSamples);
      Object.entries(sampleData).forEach(([padIndex, sample]: [string, any]) => {
        loadSampleFromUrl(sample.url, sample.name, parseInt(padIndex));
      });
      localStorage.removeItem('selectedSamples');
    }
  }, []);

  // Load samples from a drum kit
  const loadKitSamples = async (kit: any) => {
    try {
      const loadedSamples: Array<{
        sample: Sample;
        padIndex: number;
        name: string;
      }> = [];

      // Load all samples into memory first
      for (let i = 0; i < Math.min(kit.samples.length, 16); i++) {
        const kitSample = kit.samples[i];
        try {
          if (!audioContextRef.current) continue;
          let audioBuffer: AudioBuffer;

          // For the default kit, generate synthetic samples instead of loading broken files
          if (kit.id === 'default-kit') {
            if (!sampleGeneratorRef.current) {
              sampleGeneratorRef.current = new SampleGenerator(audioContextRef.current);
            }
            switch (kitSample.type) {
              case 'kick':
                audioBuffer = sampleGeneratorRef.current.generateKick(60, 0.5);
                break;
              case 'snare':
                audioBuffer = sampleGeneratorRef.current.generateSnare(0.2);
                break;
              case 'hihat':
                audioBuffer = sampleGeneratorRef.current.generateHiHat(0.1);
                break;
              default:
                audioBuffer = sampleGeneratorRef.current.generateKick(60, 0.5);
            }
          } else {
            // Try to load from URL for other kits
            const response = await fetch(kitSample.url);
            const arrayBuffer = await response.arrayBuffer();
            audioBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer);
          }
          const sample: Sample = {
            buffer: audioBuffer,
            name: kitSample.name,
            startTime: 0,
            endTime: 1,
            gateMode: true,
            pitch: 0,
            reverse: false,
            volume: 0.8
          };
          loadedSamples.push({
            sample,
            padIndex: i,
            name: kitSample.name
          });
        } catch (error) {
          console.warn(`Failed to load sample ${kitSample.name}:`, error);

          // Fallback to synthetic generation if loading fails
          if (audioContextRef.current) {
            try {
              if (!sampleGeneratorRef.current) {
                sampleGeneratorRef.current = new SampleGenerator(audioContextRef.current);
              }
              let fallbackBuffer: AudioBuffer;
              switch (kitSample.type) {
                case 'kick':
                  fallbackBuffer = sampleGeneratorRef.current.generateKick(60, 0.5);
                  break;
                case 'snare':
                  fallbackBuffer = sampleGeneratorRef.current.generateSnare(0.2);
                  break;
                case 'hihat':
                  fallbackBuffer = sampleGeneratorRef.current.generateHiHat(0.1);
                  break;
                default:
                  fallbackBuffer = sampleGeneratorRef.current.generateKick(60, 0.5);
              }
              const fallbackSample: Sample = {
                buffer: fallbackBuffer,
                name: `${kitSample.name} (Generated)`,
                startTime: 0,
                endTime: 1,
                gateMode: true,
                pitch: 0,
                reverse: false,
                volume: 0.8
              };
              loadedSamples.push({
                sample: fallbackSample,
                padIndex: i,
                name: `${kitSample.name} (Generated)`
              });
              toast.info(`Generated fallback sample for ${kitSample.name}`);
            } catch (genError) {
              console.error(`Failed to generate fallback for ${kitSample.name}:`, genError);
              toast.error(`Failed to load/generate sample: ${kitSample.name}`);
            }
          }
        }
      }

      // Set up the queue and start with the first sample
      setSampleQueue(loadedSamples);
      setCurrentQueueIndex(0);
      if (loadedSamples.length > 0) {
        setPendingSample({
          sample: loadedSamples[0].sample,
          padIndex: loadedSamples[0].padIndex
        });
        setDisplayMode('editor');
        toast.info(`Loading ${kit.name}: Confirm sample 1 of ${loadedSamples.length}`);
      } else {
        toast.error('No valid samples found in kit');
      }
    } catch (error) {
      console.error('Error loading kit:', error);
      toast.error('Failed to load drum kit');
    }
  };

  // Load a single sample from URL
  const loadSampleFromUrl = async (url: string, name: string, padIndex: number) => {
    try {
      if (!audioContextRef.current) return;
      const response = await fetch(url);
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer);
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

      // Set pending sample for editor confirmation (same as normal upload workflow)
      setPendingSample({
        sample,
        padIndex
      });

      // Switch to editor mode for confirmation
      setDisplayMode('editor');
    } catch (error) {
      console.warn(`Failed to load sample ${name}:`, error);
      toast.error(`Failed to load sample: ${name}`);
    }
  };

  // Process next sample in the queue
  const processNextInQueue = useCallback(() => {
    if (sampleQueue.length === 0) return;
    const nextIndex = currentQueueIndex + 1;
    if (nextIndex < sampleQueue.length) {
      setCurrentQueueIndex(nextIndex);
      const nextSample = sampleQueue[nextIndex];
      setPendingSample({
        sample: nextSample.sample,
        padIndex: nextSample.padIndex
      });
      setDisplayMode('editor');
      toast.info(`Confirm sample ${nextIndex + 1} of ${sampleQueue.length}: ${nextSample.name}`);
    } else {
      // All samples processed
      setSampleQueue([]);
      setCurrentQueueIndex(0);
      toast.success('All kit samples loaded successfully!');
      setDisplayMode('sequencer');
    }
  }, [sampleQueue, currentQueueIndex]);

  // Handle sample confirmation from the editor
  const handleSampleConfirm = useCallback((confirmedSample: Sample, padIndex: number) => {
    // Update the samples array with the confirmed sample
    const newSamples = [...samples];
    newSamples[padIndex] = confirmedSample;
    setSamples(newSamples);

    // Clear pending sample
    setPendingSample(null);

    // Process next sample in queue if exists
    if (sampleQueue.length > 0 && currentQueueIndex < sampleQueue.length - 1) {
      processNextInQueue();
    } else if (sampleQueue.length > 0) {
      // This was the last sample in the queue
      setSampleQueue([]);
      setCurrentQueueIndex(0);
      toast.success('All kit samples loaded successfully!');
      setDisplayMode('sequencer');
    } else {
      // Single sample load
      setDisplayMode('sequencer');
    }
  }, [samples, sampleQueue, currentQueueIndex, processNextInQueue]);

  // Handle sample rejection/skip
  const handleSampleReject = useCallback(() => {
    setPendingSample(null);

    // Process next sample in queue if exists
    if (sampleQueue.length > 0 && currentQueueIndex < sampleQueue.length - 1) {
      processNextInQueue();
    } else if (sampleQueue.length > 0) {
      // This was the last sample in the queue
      setSampleQueue([]);
      setCurrentQueueIndex(0);
      toast.success('Kit loading completed!');
      setDisplayMode('sequencer');
    } else {
      // Single sample load
      setDisplayMode('sequencer');
    }
  }, [sampleQueue, currentQueueIndex, processNextInQueue]);

  // Create reverb impulse response
  const createReverbImpulse = useCallback((roomSize: number, decay: number) => {
    if (!audioContextRef.current) return null;
    const sampleRate = audioContextRef.current.sampleRate;
    const length = sampleRate * decay;
    const impulse = audioContextRef.current.createBuffer(2, length, sampleRate);
    for (let channel = 0; channel < 2; channel++) {
      const channelData = impulse.getChannelData(channel);
      for (let i = 0; i < length; i++) {
        const n = length - i;
        channelData[i] = (Math.random() * 2 - 1) * Math.pow(n / length, roomSize);
      }
    }
    return impulse;
  }, []);

  // Initialize audio effects for a track
  const initializeTrackEffects = useCallback((trackIndex: number) => {
    if (!audioContextRef.current) return;
    const context = audioContextRef.current;
    const effects = trackEffects[trackIndex];

    // Create effect nodes
    const nodes: any = {};

    // Panner for stereo positioning (always create this)
    nodes.panner = context.createStereoPanner();
    nodes.panner.pan.value = (trackPans[trackIndex] - 50) / 50; // Convert 0-100 to -1 to 1

    // Reverb
    if (effects.reverb.enabled) {
      nodes.reverb = context.createConvolver();
      nodes.reverbGain = context.createGain();
      nodes.reverbDry = context.createGain();
      const impulse = createReverbImpulse(effects.reverb.roomSize, effects.reverb.decay);
      if (impulse) nodes.reverb.buffer = impulse;
      nodes.reverbGain.gain.value = effects.reverb.wet;
      nodes.reverbDry.gain.value = 1 - effects.reverb.wet;
    }

    // Delay
    if (effects.delay.enabled) {
      nodes.delay = context.createDelay(1);
      nodes.delayGain = context.createGain();
      nodes.delayFeedback = context.createGain();
      nodes.delayWet = context.createGain();
      nodes.delayDry = context.createGain();
      nodes.delay.delayTime.value = effects.delay.time;
      nodes.delayFeedback.gain.value = effects.delay.feedback;
      nodes.delayWet.gain.value = effects.delay.wet;
      nodes.delayDry.gain.value = 1 - effects.delay.wet;
    }

    // Filter
    if (effects.filter.enabled) {
      nodes.filter = context.createBiquadFilter();
      nodes.filter.type = effects.filter.type;
      nodes.filter.frequency.value = effects.filter.frequency;
      nodes.filter.Q.value = effects.filter.resonance;
    }

    // EQ (3-band)
    if (effects.eq.enabled) {
      nodes.eqLow = context.createBiquadFilter();
      nodes.eqMid = context.createBiquadFilter();
      nodes.eqHigh = context.createBiquadFilter();
      nodes.eqLow.type = 'lowshelf';
      nodes.eqLow.frequency.value = 320;
      nodes.eqLow.gain.value = effects.eq.low;
      nodes.eqMid.type = 'peaking';
      nodes.eqMid.frequency.value = 1000;
      nodes.eqMid.Q.value = 1;
      nodes.eqMid.gain.value = effects.eq.mid;
      nodes.eqHigh.type = 'highshelf';
      nodes.eqHigh.frequency.value = 3200;
      nodes.eqHigh.gain.value = effects.eq.high;
    }
    effectNodesRef.current.set(trackIndex, nodes);
  }, [trackEffects, trackPans, createReverbImpulse]);

  // Connect audio through effects chain
  const connectEffectsChain = useCallback((source: AudioNode, trackIndex: number, destination: AudioNode) => {
    const effects = effectNodesRef.current.get(trackIndex);
    if (!effects) {
      source.connect(destination);
      return;
    }
    let currentNode = source;

    // EQ first
    if (effects.eqLow && effects.eqMid && effects.eqHigh) {
      currentNode.connect(effects.eqLow);
      effects.eqLow.connect(effects.eqMid);
      effects.eqMid.connect(effects.eqHigh);
      currentNode = effects.eqHigh;
    }

    // Filter
    if (effects.filter) {
      currentNode.connect(effects.filter);
      currentNode = effects.filter;
    }

    // Create mixer for delay/reverb
    const mixer = audioContextRef.current!.createGain();
    currentNode.connect(mixer);

    // Pan control (always active) - connect mixer through panner to final destination
    let finalDestination = destination;
    if (effects.panner) {
      finalDestination = effects.panner;
      effects.panner.connect(destination);
    }

    // Delay
    if (effects.delay && effects.delayGain && effects.delayFeedback && effects.delayWet && effects.delayDry) {
      // Dry signal
      mixer.connect(effects.delayDry);
      effects.delayDry.connect(finalDestination);

      // Wet signal
      mixer.connect(effects.delay);
      effects.delay.connect(effects.delayGain);
      effects.delay.connect(effects.delayFeedback);
      effects.delayFeedback.connect(effects.delay);
      effects.delayGain.connect(effects.delayWet);
      effects.delayWet.connect(finalDestination);
    }

    // Reverb
    if (effects.reverb && effects.reverbGain && effects.reverbDry) {
      // Dry signal
      mixer.connect(effects.reverbDry);
      effects.reverbDry.connect(finalDestination);

      // Wet signal
      mixer.connect(effects.reverb);
      effects.reverb.connect(effects.reverbGain);
      effects.reverbGain.connect(finalDestination);
    }

    // If no time-based effects, connect directly
    if (!effects.delay && !effects.reverb) {
      mixer.connect(finalDestination);
    }
  }, []);

  // Save patterns to localStorage whenever savedPatterns changes
  useEffect(() => {
    localStorage.setItem('savedPatterns', JSON.stringify(savedPatterns));
  }, [savedPatterns]);

  // Helper function to count loaded samples
  const getLoadedSamplesCount = () => samples.filter(sample => sample?.buffer).length;

  // Helper function to check if pattern operations are possible
  const canPerformPatternOperations = () => {
    const loadedCount = getLoadedSamplesCount();
    console.log('canPerformPatternOperations check:', {
      patternTarget,
      loadedCount,
      selectedTrack,
      selectedPad,
      neuralEnabled,
      isGenerating
    });
    if (patternTarget === 'all') {
      return loadedCount > 0;
    } else {
      const targetTrack = selectedTrack !== null ? selectedTrack : selectedPad;
      const hasBuffer = targetTrack !== null && samples[targetTrack]?.buffer;
      console.log('Single track check:', {
        targetTrack,
        hasBuffer
      });
      return hasBuffer;
    }
  };

  // Helper function to get operation description
  const getOperationDescription = () => {
    if (patternTarget === 'all') {
      const count = getLoadedSamplesCount();
      return count > 0 ? `${count} loaded tracks` : 'No tracks loaded';
    } else {
      const targetTrack = selectedTrack !== null ? selectedTrack : selectedPad;
      if (targetTrack === null) return 'No track selected';
      if (!samples[targetTrack]?.buffer) return 'Selected track has no sample';
      return `track ${targetTrack + 1}`;
    }
  };
  const generateSequence = async () => {
    if (!neuralEnabled) {
      toast.error('Neural drum engine not initialized.');
      return;
    }

    // Check target tracks based on mode
    let targetTracks: number[] = [];
    if (patternTarget === 'all') {
      targetTracks = samples.map((sample, index) => sample?.buffer ? index : -1).filter(i => i !== -1);
      if (targetTracks.length === 0) {
        toast.error('Load samples first to generate patterns.');
        return;
      }
    } else {
      // Selected track mode
      const targetTrack = selectedTrack !== null ? selectedTrack : selectedPad;
      if (targetTrack === null) {
        toast.error('Select a track first to generate patterns.');
        return;
      }
      if (!samples[targetTrack]?.buffer) {
        toast.error('Selected track has no sample loaded.');
        return;
      }
      targetTracks = [targetTrack];
    }
    setIsGenerating(true);
    try {
      // Create a seed sequence - only for target tracks
      const seedSequence = {
        notes: patterns.map((pad, index) => {
          // Only include target tracks
          if (!targetTracks.includes(index)) return null;
          const activeStepIndex = pad.findIndex(step => step.active);
          return activeStepIndex !== -1 ? {
            pitch: index + 36,
            quantizedStartStep: activeStepIndex
          } : null;
        }).filter(note => note !== null).slice(0, seedLength),
        quantizationInfo: {
          stepsPerQuarter: 4
        },
        totalQuantizedSteps: seedLength
      };

      // Generate continuation
      const continuation = await rnnRef.current!.continueSequence(seedSequence, sequencerLength - seedLength, temperature[0]);

      // Update patterns with the generated sequence - only for target tracks
      const newPatterns = [...patterns];
      continuation.notes.forEach(note => {
        const stepIndex = note.quantizedStartStep;
        const padIndex = note.pitch - 36;

        // Only apply to target tracks
        if (stepIndex >= 0 && stepIndex < sequencerLength && targetTracks.includes(padIndex)) {
          newPatterns[padIndex] = [...newPatterns[padIndex]];
          newPatterns[padIndex][stepIndex] = {
            active: true,
            velocity: 80
          };
        }
      });
      setPatterns(newPatterns);
      const targetDescription = patternTarget === 'all' ? `${targetTracks.length} loaded tracks` : `track ${(selectedTrack !== null ? selectedTrack : selectedPad)! + 1}`;
      toast.success(`Generated patterns for ${targetDescription}!`);
    } catch (error) {
      console.error('Error generating sequence:', error);
      toast.error('Failed to generate sequence.');
    } finally {
      setIsGenerating(false);
    }
  };
  const clearPattern = () => {
    const newPatterns = patterns.map(pattern => pattern.map(step => ({
      ...step,
      active: false
    })));
    setPatterns(newPatterns);
    toast.info('Cleared current pattern');
  };
  const randomizePattern = () => {
    // Check target tracks based on mode
    let targetTracks: number[] = [];
    if (patternTarget === 'all') {
      targetTracks = samples.map((sample, index) => sample?.buffer ? index : -1).filter(i => i !== -1);
      if (targetTracks.length === 0) {
        toast.error('Load samples first to randomize patterns.');
        return;
      }
    } else {
      // Selected track mode
      const targetTrack = selectedTrack !== null ? selectedTrack : selectedPad;
      if (targetTrack === null) {
        toast.error('Select a track first to randomize patterns.');
        return;
      }
      if (!samples[targetTrack]?.buffer) {
        toast.error('Selected track has no sample loaded.');
        return;
      }
      targetTracks = [targetTrack];
    }
    const newPatterns = patterns.map((pattern, trackIndex) => {
      // Only randomize target tracks
      if (!targetTracks.includes(trackIndex)) {
        return pattern; // Keep existing pattern for non-target tracks
      }
      return pattern.map(() => ({
        active: Math.random() > 0.7,
        velocity: Math.floor(Math.random() * 127)
      }));
    });
    setPatterns(newPatterns);
    const targetDescription = patternTarget === 'all' ? `${targetTracks.length} loaded tracks` : `pad ${selectedPad! + 1}`;
    toast.info(`Randomized patterns for ${targetDescription}!`);
  };
  const fillPattern = (trackIndex: number, fillType: string) => {
    if (!samples[trackIndex]?.buffer) {
      toast.error(`Track ${trackIndex + 1} has no sample loaded.`);
      return;
    }
    const newPatterns = [...patterns];
    const pattern = [...newPatterns[trackIndex]];

    // Clear the pattern first
    pattern.forEach((step, index) => {
      pattern[index] = {
        ...step,
        active: false
      };
    });

    // Fill based on type
    switch (fillType) {
      case '4x4':
        // Every 4 steps (quarters)
        for (let i = 0; i < sequencerLength; i += 4) {
          pattern[i] = {
            active: true,
            velocity: 80
          };
        }
        break;
      case '2x2':
        // Every 2 steps (eighths)
        for (let i = 0; i < sequencerLength; i += 2) {
          pattern[i] = {
            active: true,
            velocity: 80
          };
        }
        break;
      case '1x1':
        // Every step (sixteenths)
        for (let i = 0; i < sequencerLength; i++) {
          pattern[i] = {
            active: true,
            velocity: 80
          };
        }
        break;
      case '8x8':
        // Every 8 steps (half notes)
        for (let i = 0; i < sequencerLength; i += 8) {
          pattern[i] = {
            active: true,
            velocity: 80
          };
        }
        break;
    }
    newPatterns[trackIndex] = pattern;
    setPatterns(newPatterns);
    toast.success(`Filled track ${trackIndex + 1} with ${fillType} pattern`);
  };
  const savePattern = () => {
    const newPattern = {
      name: currentPatternName,
      steps: patterns,
      bpm: bpm[0],
      swing: swing[0],
      length: sequencerLength
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

  // Sequencer loop with swing - with proper cleanup
  useEffect(() => {
    // Clear any existing timeout
    if (sequencerTimeoutRef.current) {
      clearTimeout(sequencerTimeoutRef.current);
      sequencerTimeoutRef.current = null;
    }
    if (!isPlaying) return;
    const baseStepTime = 60 / bpm[0] / 4 * 1000; // 16th notes
    let stepCounter = 0;
    const scheduleNextStep = () => {
      const swingAmount = swing[0] / 100;
      const isOffBeat = stepCounter % 2 === 1;
      const swingDelay = isOffBeat ? baseStepTime * swingAmount * 0.1 : 0;
      sequencerTimeoutRef.current = setTimeout(() => {
        setCurrentStep(prev => {
          const nextStep = (prev + 1) % sequencerLength;

          // Play samples for active steps
          patterns.forEach((pattern, padIndex) => {
            const shouldPlay = pattern[nextStep]?.active && samples[padIndex]?.buffer && !trackMutes[padIndex] && (trackSolos.every(s => !s) || trackSolos[padIndex]);
            if (shouldPlay) {
              // Use the sample's gate mode setting for pattern playback
              playPad(padIndex, pattern[nextStep].velocity, samples[padIndex]?.gateMode);
            }
          });
          stepCounter++;
          if (isPlaying) scheduleNextStep();
          return nextStep;
        });
      }, baseStepTime + swingDelay);
    };
    scheduleNextStep();

    // Cleanup function
    return () => {
      if (sequencerTimeoutRef.current) {
        clearTimeout(sequencerTimeoutRef.current);
        sequencerTimeoutRef.current = null;
      }
    };
  }, [isPlaying, bpm, patterns, samples, sequencerLength, swing, trackMutes, trackSolos]);
  const playPad = useCallback((padIndex: number, velocity: number = 80, forceGateMode?: boolean) => {
    if (!audioContextRef.current || !samples[padIndex]?.buffer) return;

    // Check mute/solo state
    const shouldPlay = !trackMutes[padIndex] && (trackSolos.every(s => !s) || trackSolos[padIndex]);
    if (!shouldPlay) return;

    // Use the sample's gate mode setting, or forced gate mode for pattern playback
    const sampleGateMode = forceGateMode ?? samples[padIndex]?.gateMode ?? true;

    // Stop any currently playing source for this pad if in gate mode
    if (sampleGateMode) {
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

    // Get sample data
    const sample = samples[padIndex];
    let buffer = sample.buffer!;

    // Apply reverse effect by creating a reversed buffer if needed
    if (sample.reverse) {
      const reversedBuffer = audioContextRef.current.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
      for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
        const originalData = buffer.getChannelData(channel);
        const reversedData = reversedBuffer.getChannelData(channel);
        for (let i = 0; i < originalData.length; i++) {
          reversedData[i] = originalData[originalData.length - 1 - i];
        }
      }
      buffer = reversedBuffer;
    }
    source.buffer = buffer;

    // Apply pitch adjustment
    const pitchRate = Math.pow(2, sample.pitch / 12);
    source.playbackRate.value = pitchRate;

    // Calculate sample slice timing
    const duration = buffer.duration;
    const startTime = sample.startTime * duration;
    const endTime = sample.endTime * duration;
    const sliceDuration = endTime - startTime;

    // Combine pattern velocity with track volume and master volume
    const finalVolume = velocity / 127 * (trackVolumes[padIndex] / 100) * masterVolume;
    gainNode.gain.value = finalVolume;

    // Initialize and connect through effects chain
    initializeTrackEffects(padIndex);
    source.connect(gainNode);
    connectEffectsChain(gainNode, padIndex, audioContextRef.current.destination);

    // Track both source and gain node for real-time volume control
    setPlayingSources(prev => new Map(prev).set(padIndex, source));
    setPlayingGainNodes(prev => new Map(prev).set(padIndex, gainNode));
    source.onended = () => {
      setPlayingSources(prev => {
        const newMap = new Map(prev);
        newMap.delete(padIndex);
        return newMap;
      });
      setPlayingGainNodes(prev => {
        const newMap = new Map(prev);
        newMap.delete(padIndex);
        return newMap;
      });
    };
    if (sampleGateMode) {
      // For gate mode, play the slice duration (respects start/end points)
      source.start(0, startTime, sliceDuration);
    } else {
      // For non-gate mode, play the slice duration normally
      source.start(0, startTime, sliceDuration);
    }
  }, [samples, trackVolumes, trackMutes, trackSolos, playingSources, initializeTrackEffects, connectEffectsChain]);

  // Update track volumes in real-time for currently playing sources
  useEffect(() => {
    playingGainNodes.forEach((gainNode, padIndex) => {
      if (gainNode) {
        // Get the current velocity from the pattern or use track volume as default
        const velocity = 80; // You could track this per playing source if needed
        const finalVolume = velocity / 127 * (trackVolumes[padIndex] / 100) * masterVolume;
        gainNode.gain.value = finalVolume;
      }
    });
  }, [trackVolumes, masterVolume, playingGainNodes]);

  // Update master volume in real-time for all currently playing sources
  useEffect(() => {
    playingGainNodes.forEach((gainNode, padIndex) => {
      if (gainNode) {
        const velocity = 80; // You could track this per playing source if needed
        const finalVolume = velocity / 127 * (trackVolumes[padIndex] / 100) * masterVolume;
        gainNode.gain.value = finalVolume;
      }
    });
  }, [masterVolume, trackVolumes, playingGainNodes]);
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
            gateMode: true,
            pitch: 0,
            reverse: false,
            volume: 0.8
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
        const sample = {
          buffer: audioBuffer,
          name: file.name.replace(/\.[^/.]+$/, ""),
          startTime: 0,
          endTime: 1,
          gateMode: true,
          pitch: 0,
          reverse: false,
          volume: 0.8
        };

        // Set pending sample for editor confirmation
        setPendingSample({
          sample,
          padIndex
        });
        setDisplayMode('editor');
        toast.info(`Sample "${file.name}" loaded! Please confirm edit points in the editor.`);
      }
    } catch (error) {
      toast.error('Failed to load sample');
    }
  };
  const handlePadPress = (padIndex: number) => {
    // Handle audio recording mode (for sample recording)
    if (isRecording && selectedPad === padIndex) {
      stopRecording();
      return;
    }
    if (isRecording) {
      return; // Don't allow other interactions while recording audio
    }

    // Start audio recording if in record mode
    if (recordMode) {
      startRecording(padIndex);
      return;
    }

    // If pad has a sample, play it and potentially record to pattern
    if (samples[padIndex]?.buffer) {
      // Real-time pattern recording: if sequencer is playing and pattern recording is on
      if (isPlaying && isPatternRecording && currentStep >= 0) {
        const newPatterns = [...patterns];
        newPatterns[padIndex] = [...newPatterns[padIndex]];

        // Apply quantization if enabled
        let targetStep = currentStep;
        if (quantizeEnabled) {
          const gridSize = {
            '1/16': 1,
            '1/8': 2,
            '1/4': 4,
            '1/2': 8
          }[quantizeGrid];
          const quantizedStep = Math.round(currentStep / gridSize) * gridSize;
          const strength = quantizeStrength / 100;
          targetStep = Math.round(currentStep * (1 - strength) + quantizedStep * strength);
          targetStep = Math.max(0, Math.min(sequencerLength - 1, targetStep));
        }
        newPatterns[padIndex][targetStep] = {
          active: true,
          velocity: trackVolumes[padIndex]
        };
        setPatterns(newPatterns);
        toast.success(`Recorded pad ${padIndex + 1} to step ${currentStep + 1}`);
      }

      // Always play the pad when pressed
      playPad(padIndex, trackVolumes[padIndex]);
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

  // MIDI message handler
  const handleMIDIMessage = useCallback((message: MIDIMessageEvent) => {
    const [status, note, velocity] = message.data;
    console.log('MIDI Message received:', {
      status,
      note,
      velocity,
      midiLearning
    });

    // Note On (144) or Note Off (128)
    if (status === 144 || status === 128) {
      // Check if we're in MIDI learning mode
      if (midiLearning !== null && status === 144 && velocity > 0) {
        console.log('MIDI Learning mode active, mapping note', note, 'to pad', midiLearning);
        const newMapping = {
          ...midiMapping
        };
        newMapping[note] = midiLearning;
        setMidiMapping(newMapping);
        setMidiLearning(null);
        toast.success(`MIDI note ${note} mapped to pad ${midiLearning + 1}`);
        return;
      }

      // Find pad index from MIDI mapping
      const padIndex = midiMapping[note];
      if (padIndex !== undefined && padIndex >= 0 && padIndex < 16) {
        if (status === 144 && velocity > 0) {
          console.log('Triggering pad', padIndex, 'from MIDI note', note);

          // If sequencer is playing and we're in pattern recording mode, record the step
          if (isPlaying && isPatternRecording && currentStep >= 0) {
            const newPatterns = [...patterns];
            newPatterns[padIndex] = [...newPatterns[padIndex]];

            // Apply quantization if enabled
            let targetStep = currentStep;
            if (quantizeEnabled) {
              const gridSize = {
                '1/16': 1,
                '1/8': 2,
                '1/4': 4,
                '1/2': 8
              }[quantizeGrid];
              const quantizedStep = Math.round(currentStep / gridSize) * gridSize;
              const strength = quantizeStrength / 100;
              targetStep = Math.round(currentStep * (1 - strength) + quantizedStep * strength);
              targetStep = Math.max(0, Math.min(sequencerLength - 1, targetStep));
            }
            newPatterns[padIndex][targetStep] = {
              active: true,
              velocity: Math.round(velocity * trackVolumes[padIndex] / 127)
            };
            setPatterns(newPatterns);
          }

          // Always play the pad when MIDI note is pressed, but respect sequencer timing
          if (samples[padIndex]?.buffer) {
            playPad(padIndex, velocity);
          }

          // Visual feedback
          setSelectedPad(padIndex);
          setTimeout(() => setSelectedPad(null), 100);
        } else if (status === 128 || status === 144 && velocity === 0) {
          console.log('Releasing pad', padIndex, 'from MIDI note', note);
          // Note Off - only handle gate release if sample is in gate mode
          if (samples[padIndex]?.gateMode) {
            handlePadRelease(padIndex);
          }
        }
      } else {
        console.log('No mapping found for MIDI note', note);
      }
    }
  }, [midiMapping, midiLearning, samples, isPlaying, isPatternRecording, currentStep, patterns, trackVolumes, playPad, handlePadRelease, quantizeEnabled, quantizeStrength, quantizeGrid, sequencerLength]);

  // Update MIDI event listeners when handleMIDIMessage changes
  useEffect(() => {
    if (midiDevices.length > 0) {
      console.log('Updating MIDI event listeners for learning state:', midiLearning);
      midiDevices.forEach(input => {
        input.onmidimessage = handleMIDIMessage;
      });
    }
  }, [handleMIDIMessage, midiDevices, midiLearning]);
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

    // Clear sequencer timeout
    if (sequencerTimeoutRef.current) {
      clearTimeout(sequencerTimeoutRef.current);
      sequencerTimeoutRef.current = null;
    }

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
  const handleTrackLabelClick = (trackIndex: number) => {
    const currentTime = Date.now();
    const lastClickTime = lastTrackClickTime[trackIndex] || 0;
    const isDoubleClick = currentTime - lastClickTime < 300;
    if (isDoubleClick) {
      // Double click - unselect track
      setSelectedTrack(null);
      setPatternTarget('all');
      toast.info('Switched to pattern mode (all tracks)');
    } else {
      // Single click - select track
      setSelectedTrack(trackIndex);
      setPatternTarget('selected');
      toast.info(`Selected track ${trackIndex + 1}`);
    }
    setLastTrackClickTime({
      ...lastTrackClickTime,
      [trackIndex]: currentTime
    });
  };

  // Helper function for pad colors based on Maschine style
  const getPadColor = (index: number) => {
    const colors = ['bg-yellow-600', 'bg-blue-500', 'bg-cyan-500', 'bg-pink-500', 'bg-purple-600', 'bg-blue-400', 'bg-green-500', 'bg-pink-400', 'bg-yellow-500', 'bg-orange-500', 'bg-cyan-400', 'bg-blue-600', 'bg-red-500', 'bg-yellow-400', 'bg-blue-300', 'bg-red-400'];
    return colors[index] || 'bg-gray-600';
  };
  const updateSample = (updatedSample: Sample) => {
    if (pendingSample) {
      // Update pending sample
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
      handleSampleConfirm(pendingSample.sample, pendingSample.padIndex);
      toast.success(`Sample confirmed and loaded to pad ${pendingSample.padIndex + 1}!`);
    }
  };
  const cancelPendingSample = () => {
    if (pendingSample) {
      handleSampleReject();
      toast.info('Sample skipped');
    }
  };

  // Keyboard shortcuts
  useKeyboardShortcuts({
    onPlay: () => isPlaying ? handlePause() : handlePlay(),
    onStop: handleStop,
    onRecord: () => setIsPatternRecording(!isPatternRecording),
    onClear: clearPattern,
    onRandomize: randomizePattern,
    onFill: () => {
      const targetTrack = selectedTrack ?? selectedPad;
      if (targetTrack !== null) {
        fillPattern(targetTrack, 'all');
      }
    },
    onBpmIncrease: () => setBpm([Math.min(200, bpm[0] + 5)]),
    onBpmDecrease: () => setBpm([Math.max(60, bpm[0] - 5)]),
    onVolumeUp: () => setMasterVolume(prev => Math.min(1, prev + 0.1)),
    onVolumeDown: () => setMasterVolume(prev => Math.max(0, prev - 0.1)),
    onPadPress: padIndex => handlePadPress(padIndex),
    onStepToggle: stepIndex => {
      if (selectedTrack !== null && stepIndex < sequencerLength) {
        toggleStep(selectedTrack, stepIndex);
      }
    }
  });
  return <div className="min-h-screen p-2 font-mono bg-zinc-200">
      <div className="max-w-7xl mx-auto bg-fuchsia-950">
        {/* Top Control Bar */}
        <div className="neon-panel animate-glow p-2 mb-2 rounded border border-gray-700 mx-[15px]">
          <div className="shine"></div>
          <div className="shine shine-bottom"></div>
          <div className="glow"></div>
          <div className="glow glow-bottom"></div>
          <div className="glow-bright"></div>
          <div className="glow-bright glow-bottom"></div>
          <div className="inner flex items-center justify-between bg-black">
            <img src="/lovable-uploads/8172f0a9-66b9-4449-b322-0291dc32073c.png" alt="XBEAT Studio" className="h-20 w-auto" />
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => navigate('/library')} className="border-gray-600 text-xs hover:border-purple-400 neon-border text-slate-950 bg-yellow-500 hover:bg-yellow-400">
                <Music className="w-3 h-3 mr-1" />
                LIBRARY
              </Button>
              <KeyboardShortcutsHelp />
              <Button variant="outline" size="sm" onClick={() => setDisplayMode('sequencer')} className="border-gray-600 text-xs neon-border text-slate-950 bg-yellow-500 hover:bg-yellow-400">
                SEQUENCER
              </Button>
            </div>
          </div>
        </div>

        {/* Main Display Area */}
        <div className="p-4 mb-2 rounded border border-gray-700 h-[32rem] relative overflow-hidden px-[6px] my-[7px] mx-[15px] bg-transparent">
          {/* Neon glass effect overlay */}
          <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 via-purple-500/10 to-pink-500/10 rounded pointer-events-none"></div>
          <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-transparent rounded pointer-events-none"></div>
          
          {/* Toggle buttons */}
          <div className="flex gap-2 mb-4 relative z-10">
            <Button onClick={() => setDisplayMode('sequencer')} variant={displayMode === 'sequencer' ? 'default' : 'outline'} size="sm" className={`text-xs transition-all duration-300 ${displayMode === 'sequencer' ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 shadow-lg shadow-cyan-500/25' : 'bg-gray-800 border-gray-600 text-gray-300'}`}>
              SEQUENCER
            </Button>
            <Button onClick={() => {
            setDisplayMode('editor');
            // If a track is selected, automatically set it for editing
            if (selectedTrack !== null) {
              setEditingSample(selectedTrack);
            }
          }} variant={displayMode === 'editor' ? 'default' : 'outline'} size="sm" className={`text-xs transition-all duration-300 ${displayMode === 'editor' ? 'bg-pink-500/20 border-pink-400 text-pink-300 shadow-lg shadow-pink-500/25' : 'bg-gray-800 border-gray-600 text-gray-300'}`}>
              EDITOR
            </Button>
            <Button onClick={() => setDisplayMode('patterns')} variant={displayMode === 'patterns' ? 'default' : 'outline'} size="sm" className={`text-xs transition-all duration-300 ${displayMode === 'patterns' ? 'bg-purple-500/20 border-purple-400 text-purple-300 shadow-lg shadow-purple-500/25' : 'bg-gray-800 border-gray-600 text-gray-300'}`}>
              PATTERNS
            </Button>
            <Button onClick={() => setDisplayMode('export')} variant={displayMode === 'export' ? 'default' : 'outline'} size="sm" className={`text-xs transition-all duration-300 ${displayMode === 'export' ? 'bg-orange-500/20 border-orange-400 text-orange-300 shadow-lg shadow-orange-500/25' : 'bg-gray-800 border-gray-600 text-gray-300'}`}>
              EXPORT
            </Button>
            <Button onClick={() => setDisplayMode('song')} variant={displayMode === 'song' ? 'default' : 'outline'} size="sm" className={`text-xs transition-all duration-300 ${displayMode === 'song' ? 'bg-yellow-500/20 border-yellow-400 text-yellow-300 shadow-lg shadow-yellow-500/25' : 'bg-gray-800 border-gray-600 text-gray-300'}`}>
              SONG
            </Button>
            <Button onClick={() => setDisplayMode('neural')} variant={displayMode === 'neural' ? 'default' : 'outline'} size="sm" className={`text-xs transition-all duration-300 ${displayMode === 'neural' ? 'bg-purple-500/20 border-purple-400 text-purple-300 shadow-lg shadow-purple-500/25' : 'bg-gray-800 border-gray-600 text-gray-300'}`}>
              <Sparkles className="w-3 h-3 mr-1" />
              AI
            </Button>
          </div>

          {/* Display Content */}
          <div className="backdrop-blur-sm h-full rounded border border-gray-600/50 p-4 relative z-10 shadow-inner bg-transparent">
            {displayMode === 'sequencer' ? <div className="h-full bg-transparent">
                <div className="flex justify-between items-center mb-4">
                  <div className="text-center flex-1">
                    <h2 className="text-xl font-bold text-cyan-300 mb-2 text-shadow-glow">SEQUENCER</h2>
                    <p className="text-gray-300 text-sm">{currentPatternName}</p>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {/* Neural Temperature Control */}
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400">Temp</span>
                      <Slider value={temperature} onValueChange={setTemperature} min={0.5} max={2.0} step={0.1} className="w-16" />
                      <span className="text-xs text-gray-400 w-8">{temperature[0].toFixed(1)}</span>
                    </div>
                    
                    {/* MIDI Control Button */}
                    <Button variant="outline" size="sm" onClick={() => setShowMidiPanel(true)} className="glass-strong bg-green-600/20 border-green-500/50 text-green-300 hover:bg-green-600/30 transition-all duration-200">
                      <span className="text-xs font-medium">MIDI MAP</span>
                    </Button>
                    <div className={`w-2 h-2 rounded-full ${midiEnabled ? 'bg-green-400' : 'bg-red-400'}`}></div>
                    
                    {/* Neural Generate Button */}
                    <Button onClick={generateSequence} disabled={isGenerating} title={neuralEnabled ? `Generate AI patterns for ${getOperationDescription()}` : 'Neural engine not available'} className="glass-strong h-8 text-xs bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 disabled:opacity-50 my-0 px-[20px] py-0">
                      {isGenerating ? <RefreshCw className="h-3 w-3 animate-spin mr-1" /> : <Sparkles className="h-3 w-3 mr-1" />}
                      {isGenerating ? 'Generating...' : 'Generate'}
                    </Button>
                  </div>
                </div>
                
                <div className="h-80 overflow-y-auto">
                  {/* Step numbers row */}
                  <div className="flex gap-1 mb-2 ml-[134px] overflow-x-auto">
                    {Array.from({
                  length: sequencerLength
                }, (_, stepIndex) => <div key={stepIndex} className={`
                        w-6 h-5 rounded text-xs flex items-center justify-center flex-shrink-0 transition-all duration-300
                        ${currentStep === stepIndex ? 'bg-gradient-to-br from-red-500 to-red-600 text-white shadow-lg shadow-red-500/50 scale-110' : 'bg-gray-700/50 text-gray-400 backdrop-blur-sm'}
                      `}>
                        {stepIndex + 1}
                      </div>)}
                  </div>
                  
                  {/* Track rows with labels */}
                  <div className="space-y-0">
                    {Array.from({
                  length: 16
                }, (_, padIndex) => <div key={padIndex} className="flex items-center gap-1 overflow-x-auto bg-fuchsia-950">
                        {/* Track label on the left - clickable with context menu */}
                        <ContextMenu>
                          <ContextMenuTrigger asChild>
                            <button onClick={() => handleTrackLabelClick(padIndex)} className={`glass w-14 flex-shrink-0 text-xs truncate transition-all duration-200 rounded px-1 py-0.5 ${selectedTrack === padIndex ? 'bg-cyan-600/30 border border-cyan-400/50 text-cyan-300 shadow-md shadow-cyan-500/30' : 'text-gray-400 hover:bg-gray-700/50 hover:text-gray-300'}`} title={`${selectedTrack === padIndex ? 'Double-click to unselect' : 'Click to select'} track ${padIndex + 1}. Right-click for fill options.`}>
                              {samples[padIndex]?.name || `T${padIndex + 1}`}
                            </button>
                          </ContextMenuTrigger>
                          <ContextMenuContent className="bg-gray-900 border-gray-700">
                            <ContextMenuItem onClick={() => fillPattern(padIndex, '8x8')} className="text-gray-300 hover:bg-gray-700 focus:bg-gray-700">
                              Fill 8x8 (Half Notes)
                            </ContextMenuItem>
                            <ContextMenuItem onClick={() => fillPattern(padIndex, '4x4')} className="text-gray-300 hover:bg-gray-700 focus:bg-gray-700">
                              Fill 4x4 (Quarter Notes)
                            </ContextMenuItem>
                            <ContextMenuItem onClick={() => fillPattern(padIndex, '2x2')} className="text-gray-300 hover:bg-gray-700 focus:bg-gray-700">
                              Fill 2x2 (Eighth Notes)
                            </ContextMenuItem>
                            <ContextMenuItem onClick={() => fillPattern(padIndex, '1x1')} className="text-gray-300 hover:bg-gray-700 focus:bg-gray-700">
                              Fill 1x1 (Sixteenth Notes)
                            </ContextMenuItem>
                          </ContextMenuContent>
                        </ContextMenu>
                        
                        {/* Volume knob */}
                        <div className="flex-shrink-0 w-6">
                          <SimpleKnob value={trackVolumes[padIndex]} onChange={value => {
                      const newVolumes = [...trackVolumes];
                      newVolumes[padIndex] = value;
                      setTrackVolumes(newVolumes);
                    }} size={20} color="hsl(var(--primary))" />
                        </div>
                        
                        {/* Pan knob */}
                        <div className="flex-shrink-0 w-6">
                          <SimpleKnob value={trackPans[padIndex]} onChange={value => {
                      const newPans = [...trackPans];
                      newPans[padIndex] = value;
                      setTrackPans(newPans);
                    }} size={20} color="hsl(var(--accent))" />
                        </div>
                        
                        {/* Mute/Solo buttons */}
                        <div className="flex gap-1 flex-shrink-0">
                          <button onClick={() => {
                      const newMutes = [...trackMutes];
                      newMutes[padIndex] = !newMutes[padIndex];
                      setTrackMutes(newMutes);
                    }} className={`glass w-6 h-6 rounded text-xs font-bold transition-all duration-200 ${trackMutes[padIndex] ? 'bg-red-600 border border-red-500 text-white shadow-md shadow-red-500/50' : 'bg-gray-700/50 border border-gray-600 text-gray-400 hover:bg-gray-600/70'}`} title={`Mute track ${padIndex + 1}`}>
                            M
                          </button>
                          <button onClick={() => {
                      const newSolos = [...trackSolos];
                      newSolos[padIndex] = !newSolos[padIndex];
                      setTrackSolos(newSolos);
                    }} className={`glass w-6 h-6 rounded text-xs font-bold transition-all duration-200 ${trackSolos[padIndex] ? 'bg-yellow-600 border border-yellow-500 text-white shadow-md shadow-yellow-500/50' : 'bg-gray-700/50 border border-gray-600 text-gray-400 hover:bg-gray-600/70'}`} title={`Solo track ${padIndex + 1}`}>
                            S
                          </button>
                        </div>
                        
                        {/* Step buttons */}
                        {Array.from({
                    length: sequencerLength
                  }, (_, stepIndex) => <button key={stepIndex} onClick={() => toggleStep(padIndex, stepIndex)} className={`
                            glass w-6 h-5 rounded flex-shrink-0 transition-all duration-200
                            ${patterns[padIndex][stepIndex]?.active ? 'bg-gradient-to-r from-cyan-400 to-cyan-500 shadow-md shadow-cyan-500/50' : 'bg-gray-600/50 hover:bg-gray-500/70 backdrop-blur-sm'}
                            ${currentStep === stepIndex && patterns[padIndex][stepIndex]?.active ? 'ring-2 ring-red-400 ring-opacity-75' : ''}
                          `} title={`Track ${padIndex + 1} (${samples[padIndex]?.name || 'Empty'}), Step ${stepIndex + 1}`} />)}
                      </div>)}
                  </div>
                </div>
              </div> : displayMode === 'patterns' ? <div className="h-full overflow-auto">
                <PatternManager currentPattern={patterns} currentBpm={bpm[0]} currentSwing={swing[0]} onLoadPattern={pattern => {
              setPatterns(pattern.steps);
              setBpm([pattern.bpm]);
              setSwing([pattern.swing]);
              setCurrentPatternName(pattern.name);
              toast.success(`Loaded pattern "${pattern.name}"`);
            }} onSavePattern={(name, description, genre) => {
              const newPattern = {
                id: Date.now().toString(),
                name,
                description,
                steps: patterns,
                bpm: bpm[0],
                swing: swing[0],
                length: sequencerLength,
                genre,
                author: 'User',
                createdAt: new Date().toISOString().split('T')[0],
                trackCount: patterns.filter(track => track.some(step => step.active)).length
              };
              setSavedPatterns([...savedPatterns, newPattern]);
              setCurrentPatternName(name);
              toast.success(`Saved pattern "${name}"`);
            }} />
              </div> : displayMode === 'song' ? <div className="h-full">
                <SongMode patterns={savedPatterns} songs={songs} currentSong={currentSong} isPlaying={isPlaying} isPatternChaining={isPatternChaining} onCreateSong={song => setSongs([...songs, song])} onDeleteSong={songIndex => {
              const newSongs = songs.filter((_, index) => index !== songIndex);
              setSongs(newSongs);
              if (currentSong === songs[songIndex]) {
                setCurrentSong(null);
              }
            }} onSelectSong={song => setCurrentSong(song)} onPlaySong={() => {
              if (currentSong && currentSong.patterns.length > 0) {
                setIsPatternChaining(true);
                handlePlay();
              }
            }} onStopSong={() => {
              setIsPatternChaining(false);
              handleStop();
            }} onAddPatternToSong={(songIndex, patternName) => {
              const newSongs = [...songs];
              newSongs[songIndex].patterns.push(patternName);
              setSongs(newSongs);
            }} onRemovePatternFromSong={(songIndex, patternIndex) => {
              const newSongs = [...songs];
              newSongs[songIndex].patterns.splice(patternIndex, 1);
              setSongs(newSongs);
            }} onMovePattern={(songIndex, fromIndex, toIndex) => {
              if (toIndex < 0 || toIndex >= songs[songIndex].patterns.length) return;
              const newSongs = [...songs];
              const [movedPattern] = newSongs[songIndex].patterns.splice(fromIndex, 1);
              newSongs[songIndex].patterns.splice(toIndex, 0, movedPattern);
              setSongs(newSongs);
            }} />
              </div> : displayMode === 'export' ? <div className="h-full overflow-auto p-4">
                <AudioExporter patterns={patterns} samples={samples} bpm={bpm[0]} sequencerLength={sequencerLength} trackVolumes={trackVolumes} trackMutes={trackMutes} trackSolos={trackSolos} masterVolume={masterVolume} swing={swing[0]} />
              </div> : displayMode === 'neural' ? <div className="h-full overflow-auto p-4">
                <NeuralDrumGenerator patterns={patterns} onPatternGenerated={setPatterns} bpm={bpm[0]} sequencerLength={sequencerLength} />
              </div> : <div className="h-full overflow-auto">
                {pendingSample ? <div className="h-full overflow-auto p-2">
                    <WaveformEditor sample={pendingSample.sample} onSampleUpdate={updateSample} onConfirm={confirmPendingSample} showConfirm={true} onClose={cancelPendingSample} audioContext={audioContextRef.current} />
                  </div> : <>
                    <div className="text-center mb-2">
                      <p className="text-gray-300 text-sm">
                        {selectedPad !== null && samples[selectedPad]?.buffer ? `Editing: ${samples[selectedPad].name}` : 'Select a pad to edit or upload a new sample to edit'}
                      </p>
                    </div>
                    
                    {selectedPad !== null && samples[selectedPad]?.buffer ? <div className="h-full overflow-auto p-2">
                        <WaveformEditor sample={samples[selectedPad]} onSampleUpdate={updatedSample => {
                  const newSamples = [...samples];
                  newSamples[selectedPad] = updatedSample;
                  setSamples(newSamples);
                  toast.success('Sample settings saved!');
                }} onClose={() => setSelectedPad(null)} audioContext={audioContextRef.current} />
                      </div> : <div className="flex items-center justify-center h-48">
                        <div className="text-center text-gray-400">
                          <Edit className="w-12 h-12 mx-auto mb-4 opacity-50" />
                          <p>Click on a drum pad to edit its sample or upload a new sample</p>
                        </div>
                      </div>}
                  </>}
              </div>}
          </div>
        </div>

        {/* Transport Controls */}
        <div className="neon-panel p-4 mb-2 relative overflow-hidden mx-[13px] px-[25px]">
          <div className="shine"></div>
          <div className="shine shine-bottom"></div>
          <div className="glow"></div>
          <div className="glow glow-bottom"></div>
          <div className="glow-bright"></div>
          <div className="glow-bright glow-bottom"></div>
          <div className="inner">
            <div className="flex items-center justify-center gap-6">
              {/* Transport Buttons */}
              <div className="flex items-center gap-4">
                {/* Play/Pause Button */}
                <div className="text-center">
                  <Button onClick={isPlaying ? handlePause : handlePlay} variant="outline" size="lg" className={`glass-strong h-14 w-14 rounded-full ${isPlaying ? 'bg-orange-600/20 border-orange-500/50 text-orange-300' : 'bg-green-600/20 border-green-500/50 text-green-300'} hover:scale-110 transition-all duration-200 shadow-lg`} title={isPlaying ? 'Pause sequencer' : 'Start sequencer'}>
                    {isPlaying ? <Pause className="h-7 w-7" /> : <Play className="h-7 w-7" />}
                  </Button>
                  <div className="text-xs text-gray-400 mt-1 font-medium">
                    {isPlaying ? 'PAUSE' : 'PLAY'}
                  </div>
                </div>
                
                {/* Stop Button */}
                <div className="text-center">
                  <Button onClick={handleStop} variant="outline" size="lg" className="glass-strong h-14 w-14 rounded-full bg-red-600/20 border-red-500/50 text-red-300 hover:bg-red-600/30 hover:scale-110 transition-all duration-200 shadow-lg" title="Stop sequencer and reset to beginning">
                    <Square className="h-7 w-7" />
                  </Button>
                  <div className="text-xs text-red-400 mt-1 font-medium">
                    STOP
                  </div>
                </div>
                
                {/* Pattern Record Button */}
                <div className="text-center">
                  <Button onClick={() => setIsPatternRecording(!isPatternRecording)} variant="outline" size="lg" className={`glass-strong h-14 w-14 rounded-full ${isPatternRecording ? 'bg-red-600/30 border-red-500 text-red-200 animate-pulse shadow-lg shadow-red-500/30' : 'bg-gray-600/20 border-gray-500/50 text-gray-300'} hover:scale-110 transition-all duration-200 shadow-lg`} title={isPatternRecording ? 'Stop pattern recording' : 'Start pattern recording (press pads while sequencer plays to record)'}>
                    <Mic className="h-7 w-7" />
                  </Button>
                  <div className={`text-xs mt-1 font-medium ${isPatternRecording ? 'text-red-400 animate-pulse' : 'text-gray-400'}`}>
                    {isPatternRecording ? 'RECORDING' : 'RECORD'}
                  </div>
                </div>
              </div>

              {/* BPM and Steps Controls */}
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400 w-8">BPM</span>
                  <Slider value={bpm} onValueChange={setBpm} min={60} max={200} step={1} className="w-20" />
                  <span className="text-xs text-gray-300 w-8">{bpm[0]}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400 w-12">Steps</span>
                  <Select value={sequencerLength.toString()} onValueChange={value => setSequencerLength(parseInt(value))}>
                    <SelectTrigger className="glass w-16 h-6 text-xs bg-gray-800/50 border-gray-600">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[8, 16, 32, 64].map(steps => <SelectItem key={steps} value={steps.toString()}>{steps}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Track Selection Status */}
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-400">Mode:</span>
                <span className="text-xs text-cyan-400">
                  {selectedTrack !== null ? `Track ${selectedTrack + 1} Selected` : 'All Tracks'}
                </span>
              </div>

              {/* Status Display */}
              <div className="text-center">
                <div className="text-lg font-bold text-white mb-1">
                  {isPlaying ? 'PLAYING' : 'STOPPED'}
                  {isPatternRecording && <span className="text-red-300 ml-2 animate-pulse">● REC</span>}
                </div>
                <div className="text-sm text-gray-400">
                  {bpm[0]} BPM • {sequencerLength} Steps
                  {isPatternRecording && <div className="text-xs text-red-400 mt-1">Press pads to record</div>}
                </div>
              </div>

              {/* Quick Actions */}
              <div className="flex items-center gap-3">
                <Button onClick={clearPattern} variant="outline" size="sm" className="bg-yellow-600/20 border-yellow-500/50 text-yellow-300 hover:bg-yellow-600/30 transition-all duration-200">
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Clear
                </Button>
                
                <Button onClick={randomizePattern} disabled={!canPerformPatternOperations()} variant="outline" size="sm" className={`transition-all duration-200 ${!canPerformPatternOperations() ? 'bg-gray-600/10 border-gray-500/30 text-gray-500 cursor-not-allowed' : 'bg-purple-600/20 border-purple-500/50 text-purple-300 hover:bg-purple-600/30'}`} title={!canPerformPatternOperations() ? `Load samples first (${getOperationDescription()})` : `Randomize patterns for ${getOperationDescription()}`}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Random
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Main Layout Container */}
        <div className="grid grid-cols-2 gap-4 mx-[12px]">
          {/* Left Control Panel */}
          <div className="space-y-2">
            {/* Volume & Main Controls */}
            <div className="neon-panel p-3 rounded-lg relative overflow-hidden flex justify-center">
              <div className="shine"></div>
              <div className="shine shine-bottom"></div>
              <div className="glow"></div>
              <div className="glow glow-bottom"></div>
              <div className="glow-bright"></div>
              <div className="glow-bright glow-bottom"></div>
              <div className="inner relative z-10">
                <VolumeKnob value={masterVolume * 100} onChange={value => setMasterVolume(value / 100)} size="lg" label="MASTER VOLUME" />
              </div>
            </div>

            <div className="neon-panel p-2 rounded-lg relative overflow-hidden py-[9px] px-[10px]">
              <div className="shine"></div>
              <div className="shine shine-bottom"></div>
              <div className="glow"></div>
              <div className="glow glow-bottom"></div>
              <div className="glow-bright"></div>
              <div className="glow-bright glow-bottom"></div>
              <div className="inner relative z-10">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 px-[11px] mx-[2px] my-[19px] py-[8px]">
                    <span className="text-xs text-gray-400 w-12">Swing</span>
                    <Slider value={swing} onValueChange={setSwing} min={0} max={100} step={1} className="flex-1" />
                    <span className="text-xs text-gray-300 w-8">{swing[0]}%</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Quantization Settings */}
            <div className="neon-panel p-2 rounded-lg relative overflow-hidden px-[10px] py-[3px]">
              <div className="shine"></div>
              <div className="shine shine-bottom"></div>
              <div className="glow"></div>
              <div className="glow glow-bottom"></div>
              <div className="glow-bright"></div>
              <div className="glow-bright glow-bottom"></div>
              <div className="inner relative z-10">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-yellow-400 font-medium">QUANTIZE</span>
                    <input type="checkbox" checked={quantizeEnabled} onChange={e => setQuantizeEnabled(e.target.checked)} className="w-3 h-3" />
                  </div>
                  {quantizeEnabled && <>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-400 w-12">Grid</span>
                        <Select value={quantizeGrid} onValueChange={(value: '1/16' | '1/8' | '1/4' | '1/2') => setQuantizeGrid(value)}>
                          <SelectTrigger className="h-6 text-xs bg-gray-800 border-gray-600">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="1/16">1/16</SelectItem>
                            <SelectItem value="1/8">1/8</SelectItem>
                            <SelectItem value="1/4">1/4</SelectItem>
                            <SelectItem value="1/2">1/2</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-400 w-12">Strength</span>
                        <Slider value={[quantizeStrength]} onValueChange={([value]) => setQuantizeStrength(value)} min={0} max={100} step={1} className="flex-1" />
                        <span className="text-xs text-gray-300 w-8">{quantizeStrength}%</span>
                      </div>
                  </>}
                </div>
              </div>
            </div>

            {/* Pattern Controls */}
            <div className="neon-panel p-2 rounded-lg relative overflow-hidden px-[10px] py-[11px]">
              <div className="shine"></div>
              <div className="shine shine-bottom"></div>
              <div className="glow"></div>
              <div className="glow glow-bottom"></div>
              <div className="glow-bright"></div>
              <div className="glow-bright glow-bottom"></div>
              <div className="inner relative z-10">
                <div className="space-y-2">
                  <Button onClick={savePattern} variant="outline" size="sm" className="w-full bg-gray-800 border-gray-600 text-gray-300 text-xs">
                    SAVE
                  </Button>
                  
                  <Button onClick={randomizePattern} disabled={!canPerformPatternOperations()} variant="outline" size="sm" className={`w-full text-xs ${!canPerformPatternOperations() ? 'bg-gray-700/50 border-gray-600/50 text-gray-500 cursor-not-allowed' : 'bg-gray-800 border-gray-600 text-gray-300 hover:bg-gray-700'}`} title={!canPerformPatternOperations() ? `Load samples first (${getOperationDescription()})` : `Randomize patterns for ${getOperationDescription()}`}>
                    RANDOM
                  </Button>
                  <Button onClick={clearPattern} variant="outline" size="sm" className="w-full bg-gray-800 border-gray-600 text-gray-300 text-xs">
                    CLEAR
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Right Drum Pads */}
          <div className="neon-panel animate-glow p-4 rounded-lg border border-purple-500/30 shadow-lg shadow-purple-500/20 relative overflow-hidden">
            <div className="shine"></div>
            <div className="shine shine-bottom"></div>
            <div className="glow"></div>
            <div className="glow glow-bottom"></div>
            <div className="glow-bright"></div>
            <div className="glow-bright glow-bottom"></div>
            
            <div className="inner grid grid-cols-4 gap-2 relative z-10">
              {Array.from({
              length: 16
            }, (_, i) => <ContextMenu key={i}>
                  <ContextMenuTrigger asChild>
                    <button onClick={() => setSelectedPad(i)} onMouseDown={() => handlePadPress(i)} onMouseUp={() => handlePadRelease(i)} onMouseLeave={() => handlePadRelease(i)} onTouchStart={() => handlePadPress(i)} onTouchEnd={() => handlePadRelease(i)} className={`
                        h-28 w-28 rounded-lg text-sm font-bold transition-all duration-150 active:scale-95 border backdrop-blur-sm relative overflow-hidden
                        ${samples[i]?.buffer ? getPadColor(i) + '/80 border-cyan-400/50 text-white shadow-lg shadow-cyan-500/30' : 'bg-gray-700/40 border-purple-400/30 text-gray-300 hover:bg-gray-600/50 hover:border-purple-400/50'}
                        ${isRecording && selectedPad === i ? 'animate-pulse ring-2 ring-red-500 shadow-lg shadow-red-500/50' : ''}
                        ${selectedPad === i ? 'ring-2 ring-cyan-400 shadow-lg shadow-cyan-500/70 border-cyan-400' : ''}
                      `}>
                      {samples[i]?.buffer ? samples[i].name.split(' ')[1] || (i + 1).toString() : isRecording && selectedPad === i ? 'REC' : i + 1}
                    </button>
                  </ContextMenuTrigger>
                  {samples[i]?.buffer && <ContextMenuContent>
                      <ContextMenuItem onClick={() => {
                  setSelectedPad(i);
                  fileInputRef.current?.click();
                }}>
                        Replace Sample
                      </ContextMenuItem>
                      <ContextMenuItem onClick={() => {
                  const newSamples = [...samples];
                  newSamples[i] = null;
                  setSamples(newSamples);
                  toast.success(`Cleared sample from pad ${i + 1}`);
                }}>
                        Clear Sample
                      </ContextMenuItem>
                      <ContextMenuItem onClick={() => setSelectedPad(i)}>
                        Edit Sample
                      </ContextMenuItem>
                    </ContextMenuContent>}
                </ContextMenu>)}
            </div>
          </div>
        </div>

        {/* Bottom Row - Effects Panel */}
        <div className="flex gap-4">
          {/* Effects Panel */}
          <div className="flex-1 neon-panel p-4 rounded-lg relative overflow-hidden my-[9px] mx-[11px]">
            <div className="shine"></div>
            <div className="shine shine-bottom"></div>
            <div className="glow"></div>
            <div className="glow glow-bottom"></div>
            <div className="glow-bright"></div>
            <div className="glow-bright glow-bottom"></div>
            <div className="inner relative z-10">
              <div className="text-xs text-gray-400 mb-2">AUDIO EFFECTS</div>
              
              {/* Track selector */}
              <div className="mb-3">
                <div className="grid grid-cols-8 gap-1">
                  {Array.from({
                  length: 16
                }, (_, i) => <Button key={i} onClick={() => setSelectedEffectTrack(i)} variant="outline" size="sm" className={`h-6 w-8 text-xs p-0 ${selectedEffectTrack === i ? 'bg-yellow-600/30 border-yellow-500 text-yellow-300' : 'bg-gray-800 border-gray-600 text-gray-300 hover:bg-gray-700'}`}>
                      {i + 1}
                    </Button>)}
                </div>
              </div>

              {/* Effect Buttons */}
              <div className="mb-3">
                <div className="grid grid-cols-4 gap-2">
                  <Button onClick={() => {
                  if (selectedEffectTrack !== null) {
                    const newEffects = [...trackEffects];
                    newEffects[selectedEffectTrack] = {
                      ...newEffects[selectedEffectTrack],
                      reverb: {
                        ...newEffects[selectedEffectTrack].reverb,
                        enabled: !newEffects[selectedEffectTrack].reverb.enabled
                      }
                    };
                    setTrackEffects(newEffects);
                  }
                }} variant="outline" size="sm" disabled={selectedEffectTrack === null} className={`text-xs ${selectedEffectTrack !== null && trackEffects[selectedEffectTrack]?.reverb?.enabled ? 'bg-green-600/30 border-green-500 text-green-300' : 'bg-gray-800 border-gray-600 text-gray-300 hover:bg-gray-700'}`}>
                    REVERB
                  </Button>
                  <Button onClick={() => {
                  if (selectedEffectTrack !== null) {
                    const newEffects = [...trackEffects];
                    newEffects[selectedEffectTrack] = {
                      ...newEffects[selectedEffectTrack],
                      delay: {
                        ...newEffects[selectedEffectTrack].delay,
                        enabled: !newEffects[selectedEffectTrack].delay.enabled
                      }
                    };
                    setTrackEffects(newEffects);
                  }
                }} variant="outline" size="sm" disabled={selectedEffectTrack === null} className={`text-xs ${selectedEffectTrack !== null && trackEffects[selectedEffectTrack]?.delay?.enabled ? 'bg-blue-600/30 border-blue-500 text-blue-300' : 'bg-gray-800 border-gray-600 text-gray-300 hover:bg-gray-700'}`}>
                    DELAY
                  </Button>
                  <Button onClick={() => {
                  if (selectedEffectTrack !== null) {
                    const newEffects = [...trackEffects];
                    newEffects[selectedEffectTrack] = {
                      ...newEffects[selectedEffectTrack],
                      filter: {
                        ...newEffects[selectedEffectTrack].filter,
                        enabled: !newEffects[selectedEffectTrack].filter.enabled
                      }
                    };
                    setTrackEffects(newEffects);
                  }
                }} variant="outline" size="sm" disabled={selectedEffectTrack === null} className={`text-xs ${selectedEffectTrack !== null && trackEffects[selectedEffectTrack]?.filter?.enabled ? 'bg-purple-600/30 border-purple-500 text-purple-300' : 'bg-gray-800 border-gray-600 text-gray-300 hover:bg-gray-700'}`}>
                    FILTER
                  </Button>
                  <Button onClick={() => {
                  if (selectedEffectTrack !== null) {
                    const newEffects = [...trackEffects];
                    newEffects[selectedEffectTrack] = {
                      ...newEffects[selectedEffectTrack],
                      eq: {
                        ...newEffects[selectedEffectTrack].eq,
                        enabled: !newEffects[selectedEffectTrack].eq.enabled
                      }
                    };
                    setTrackEffects(newEffects);
                  }
                }} variant="outline" size="sm" disabled={selectedEffectTrack === null} className={`text-xs ${selectedEffectTrack !== null && trackEffects[selectedEffectTrack]?.eq?.enabled ? 'bg-orange-600/30 border-orange-500 text-orange-300' : 'bg-gray-800 border-gray-600 text-gray-300 hover:bg-gray-700'}`}>
                    EQ
                  </Button>
                </div>
              </div>

              {selectedEffectTrack !== null && <div className="space-y-2">
                  {/* Reverb */}
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <input type="checkbox" checked={trackEffects[selectedEffectTrack]?.reverb?.enabled} onChange={e => {
                    const newEffects = [...trackEffects];
                    newEffects[selectedEffectTrack] = {
                      ...newEffects[selectedEffectTrack],
                      reverb: {
                        ...newEffects[selectedEffectTrack].reverb,
                        enabled: e.target.checked
                      }
                    };
                    setTrackEffects(newEffects);
                  }} className="w-3 h-3" />
                      <span className="text-xs text-gray-300">Reverb</span>
                    </div>
                    {trackEffects[selectedEffectTrack]?.reverb?.enabled && <div className="grid grid-cols-3 gap-1 text-xs">
                        <div>
                          <span className="text-gray-400">Room</span>
                          <Slider value={[trackEffects[selectedEffectTrack]?.reverb?.roomSize * 100]} onValueChange={([value]) => {
                      const newEffects = [...trackEffects];
                      newEffects[selectedEffectTrack] = {
                        ...newEffects[selectedEffectTrack],
                        reverb: {
                          ...newEffects[selectedEffectTrack].reverb,
                          roomSize: value / 100
                        }
                      };
                      setTrackEffects(newEffects);
                    }} min={0} max={100} className="h-4" />
                        </div>
                        <div>
                          <span className="text-gray-400">Decay</span>
                          <Slider value={[trackEffects[selectedEffectTrack]?.reverb?.decay]} onValueChange={([value]) => {
                      const newEffects = [...trackEffects];
                      newEffects[selectedEffectTrack] = {
                        ...newEffects[selectedEffectTrack],
                        reverb: {
                          ...newEffects[selectedEffectTrack].reverb,
                          decay: value
                        }
                      };
                      setTrackEffects(newEffects);
                    }} min={0.1} max={5} step={0.1} className="h-4" />
                        </div>
                        <div>
                          <span className="text-gray-400">Wet</span>
                          <Slider value={[trackEffects[selectedEffectTrack]?.reverb?.wet * 100]} onValueChange={([value]) => {
                      const newEffects = [...trackEffects];
                      newEffects[selectedEffectTrack] = {
                        ...newEffects[selectedEffectTrack],
                        reverb: {
                          ...newEffects[selectedEffectTrack].reverb,
                          wet: value / 100
                        }
                      };
                      setTrackEffects(newEffects);
                    }} min={0} max={100} className="h-4" />
                        </div>
                      </div>}
                  </div>

                  {/* Delay */}
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <input type="checkbox" checked={trackEffects[selectedEffectTrack]?.delay?.enabled} onChange={e => {
                    const newEffects = [...trackEffects];
                    newEffects[selectedEffectTrack] = {
                      ...newEffects[selectedEffectTrack],
                      delay: {
                        ...newEffects[selectedEffectTrack].delay,
                        enabled: e.target.checked
                      }
                    };
                    setTrackEffects(newEffects);
                  }} className="w-3 h-3" />
                      <span className="text-xs text-gray-300">Delay</span>
                    </div>
                    {trackEffects[selectedEffectTrack]?.delay?.enabled && <div className="grid grid-cols-3 gap-1 text-xs">
                        <div>
                          <span className="text-gray-400">Time</span>
                          <Slider value={[trackEffects[selectedEffectTrack]?.delay?.time * 1000]} onValueChange={([value]) => {
                      const newEffects = [...trackEffects];
                      newEffects[selectedEffectTrack] = {
                        ...newEffects[selectedEffectTrack],
                        delay: {
                          ...newEffects[selectedEffectTrack].delay,
                          time: value / 1000
                        }
                      };
                      setTrackEffects(newEffects);
                    }} min={10} max={1000} className="h-4" />
                        </div>
                        <div>
                          <span className="text-gray-400">Feedback</span>
                          <Slider value={[trackEffects[selectedEffectTrack]?.delay?.feedback * 100]} onValueChange={([value]) => {
                      const newEffects = [...trackEffects];
                      newEffects[selectedEffectTrack] = {
                        ...newEffects[selectedEffectTrack],
                        delay: {
                          ...newEffects[selectedEffectTrack].delay,
                          feedback: value / 100
                        }
                      };
                      setTrackEffects(newEffects);
                    }} min={0} max={90} className="h-4" />
                        </div>
                        <div>
                          <span className="text-gray-400">Wet</span>
                          <Slider value={[trackEffects[selectedEffectTrack]?.delay?.wet * 100]} onValueChange={([value]) => {
                      const newEffects = [...trackEffects];
                      newEffects[selectedEffectTrack] = {
                        ...newEffects[selectedEffectTrack],
                        delay: {
                          ...newEffects[selectedEffectTrack].delay,
                          wet: value / 100
                        }
                      };
                      setTrackEffects(newEffects);
                    }} min={0} max={100} className="h-4" />
                        </div>
                      </div>}
                  </div>

                  {/* Filter */}
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <input type="checkbox" checked={trackEffects[selectedEffectTrack]?.filter?.enabled} onChange={e => {
                    const newEffects = [...trackEffects];
                    newEffects[selectedEffectTrack] = {
                      ...newEffects[selectedEffectTrack],
                      filter: {
                        ...newEffects[selectedEffectTrack].filter,
                        enabled: e.target.checked
                      }
                    };
                    setTrackEffects(newEffects);
                  }} className="w-3 h-3" />
                      <span className="text-xs text-gray-300">Filter</span>
                    </div>
                    {trackEffects[selectedEffectTrack]?.filter?.enabled && <div className="space-y-1">
                        <Select value={trackEffects[selectedEffectTrack]?.filter?.type} onValueChange={(value: 'lowpass' | 'highpass' | 'bandpass') => {
                    const newEffects = [...trackEffects];
                    newEffects[selectedEffectTrack] = {
                      ...newEffects[selectedEffectTrack],
                      filter: {
                        ...newEffects[selectedEffectTrack].filter,
                        type: value
                      }
                    };
                    setTrackEffects(newEffects);
                  }}>
                          <SelectTrigger className="h-5 text-xs bg-gray-800 border-gray-600">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="lowpass">Low Pass</SelectItem>
                            <SelectItem value="highpass">High Pass</SelectItem>
                            <SelectItem value="bandpass">Band Pass</SelectItem>
                          </SelectContent>
                        </Select>
                        <div className="grid grid-cols-2 gap-1 text-xs">
                          <div>
                            <span className="text-gray-400">Freq</span>
                            <Slider value={[trackEffects[selectedEffectTrack]?.filter?.frequency]} onValueChange={([value]) => {
                        const newEffects = [...trackEffects];
                        newEffects[selectedEffectTrack] = {
                          ...newEffects[selectedEffectTrack],
                          filter: {
                            ...newEffects[selectedEffectTrack].filter,
                            frequency: value
                          }
                        };
                        setTrackEffects(newEffects);
                      }} min={20} max={20000} className="h-4" />
                          </div>
                          <div>
                            <span className="text-gray-400">Res</span>
                            <Slider value={[trackEffects[selectedEffectTrack]?.filter?.resonance]} onValueChange={([value]) => {
                        const newEffects = [...trackEffects];
                        newEffects[selectedEffectTrack] = {
                          ...newEffects[selectedEffectTrack],
                          filter: {
                            ...newEffects[selectedEffectTrack].filter,
                            resonance: value
                          }
                        };
                        setTrackEffects(newEffects);
                      }} min={0.1} max={20} step={0.1} className="h-4" />
                          </div>
                        </div>
                      </div>}
                  </div>

                  {/* EQ */}
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <input type="checkbox" checked={trackEffects[selectedEffectTrack]?.eq?.enabled} onChange={e => {
                    const newEffects = [...trackEffects];
                    newEffects[selectedEffectTrack] = {
                      ...newEffects[selectedEffectTrack],
                      eq: {
                        ...newEffects[selectedEffectTrack].eq,
                        enabled: e.target.checked
                      }
                    };
                    setTrackEffects(newEffects);
                  }} className="w-3 h-3" />
                      <span className="text-xs text-gray-300">EQ</span>
                    </div>
                    {trackEffects[selectedEffectTrack]?.eq?.enabled && <div className="grid grid-cols-3 gap-1 text-xs">
                        <div>
                          <span className="text-gray-400">Low</span>
                          <Slider value={[trackEffects[selectedEffectTrack]?.eq?.low]} onValueChange={([value]) => {
                      const newEffects = [...trackEffects];
                      newEffects[selectedEffectTrack] = {
                        ...newEffects[selectedEffectTrack],
                        eq: {
                          ...newEffects[selectedEffectTrack].eq,
                          low: value
                        }
                      };
                      setTrackEffects(newEffects);
                    }} min={-12} max={12} step={0.1} className="h-4" />
                        </div>
                        <div>
                          <span className="text-gray-400">Mid</span>
                          <Slider value={[trackEffects[selectedEffectTrack]?.eq?.mid]} onValueChange={([value]) => {
                      const newEffects = [...trackEffects];
                      newEffects[selectedEffectTrack] = {
                        ...newEffects[selectedEffectTrack],
                        eq: {
                          ...newEffects[selectedEffectTrack].eq,
                          mid: value
                        }
                      };
                      setTrackEffects(newEffects);
                    }} min={-12} max={12} step={0.1} className="h-4" />
                        </div>
                        <div>
                          <span className="text-gray-400">High</span>
                          <Slider value={[trackEffects[selectedEffectTrack]?.eq?.high]} onValueChange={([value]) => {
                      const newEffects = [...trackEffects];
                      newEffects[selectedEffectTrack] = {
                        ...newEffects[selectedEffectTrack],
                        eq: {
                          ...newEffects[selectedEffectTrack].eq,
                          high: value
                        }
                      };
                      setTrackEffects(newEffects);
                    }} min={-12} max={12} step={0.1} className="h-4" />
                        </div>
                      </div>}
                  </div>
                </div>}
            </div>
          </div>
        </div>

        <input ref={fileInputRef} type="file" accept="audio/*" onChange={handleFileLoad} className="hidden" />

        {/* MIDI Status Panel */}
        <div className="mt-4 neon-panel p-3 rounded relative overflow-hidden mx-[15px]">
          <div className="shine"></div>
          <div className="shine shine-bottom"></div>
          <div className="glow"></div>
          <div className="glow glow-bottom"></div>
          <div className="glow-bright"></div>
          <div className="glow-bright glow-bottom"></div>
          
          <div className="inner relative z-10">
            <div className="text-xs text-gray-400 mb-2">MIDI STATUS</div>
            <div className="space-y-2">
              <div className={`px-2 py-1 rounded text-xs ${midiEnabled ? 'bg-green-900/50 text-green-300' : 'bg-red-900/50 text-red-300'}`}>
                {midiEnabled ? `✓ ${midiDevices.length} device(s)` : '✗ Not available'}
              </div>
              {midiDevices.length > 0 && <div className="max-h-20 overflow-y-auto">
                  {midiDevices.map((device, index) => <div key={index} className="text-xs text-gray-500 truncate">
                      {device.name || `Device ${index + 1}`}
                    </div>)}
                </div>}
              <div className="text-xs text-gray-500">
                Notes 36-51 → Pads 1-16
              </div>
            </div>
          </div>
        </div>

        {/* MIDI Mapping Overlay Panel */}
        {showMidiPanel && <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-gray-900/90 backdrop-blur-md border border-green-500/30 shadow-2xl shadow-green-500/20 rounded-lg p-6 w-96 max-h-[80vh] overflow-y-auto relative">
              {/* Glassmorphism effects */}
              <div className="absolute inset-0 bg-gradient-to-br from-green-500/10 via-cyan-500/5 to-blue-500/10 rounded-lg pointer-events-none"></div>
              <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-transparent rounded-lg pointer-events-none"></div>
              
              {/* Panel content */}
              <div className="relative z-10">
                {/* Header */}
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-bold text-white">MIDI Mapping</h2>
                  <Button variant="outline" size="sm" onClick={() => {
                setShowMidiPanel(false);
                setMidiLearning(null);
              }} className="h-8 w-8 p-0 bg-gray-800/50 border-gray-600 text-gray-300 hover:bg-gray-700/50">
                    <X className="h-4 w-4" />
                  </Button>
                </div>

                {/* MIDI Status */}
                <div className="mb-4 p-3 bg-gray-800/50 rounded-lg border border-gray-700/50">
                  <div className={`flex items-center gap-2 text-sm ${midiEnabled ? 'text-green-400' : 'text-red-400'}`}>
                    <div className={`w-3 h-3 rounded-full ${midiEnabled ? 'bg-green-400' : 'bg-red-400'}`}></div>
                    {midiEnabled ? `${midiDevices.length} device(s) connected` : 'MIDI not available'}
                  </div>
                  {midiEnabled && midiDevices.length > 0 && <div className="mt-2 space-y-1">
                      {midiDevices.map((device, index) => <div key={index} className="text-xs text-gray-400 truncate">
                          • {device.name || `Device ${index + 1}`}
                        </div>)}
                    </div>}
                </div>

                {midiEnabled && <div className="space-y-4">
                    {/* MIDI Learn */}
                    <div className="space-y-3">
                      <h3 className="text-sm font-medium text-gray-300">MIDI Learn Mode</h3>
                      <p className="text-xs text-gray-400">Click a pad button below, then hit a MIDI note to map it</p>
                      <div className="grid grid-cols-4 gap-2">
                        {Array.from({
                    length: 16
                  }, (_, i) => <Button key={i} variant="outline" size="sm" onClick={() => setMidiLearning(midiLearning === i ? null : i)} className={`h-8 text-xs transition-all duration-200 ${midiLearning === i ? 'bg-green-600 border-green-500 text-white shadow-lg shadow-green-500/30' : 'bg-gray-800/50 border-gray-600 text-gray-300 hover:bg-gray-700/50 hover:border-green-500/50'}`}>
                            {midiLearning === i ? 'LEARN' : `P${i + 1}`}
                          </Button>)}
                      </div>
                      {midiLearning !== null && <div className="text-xs text-yellow-400 animate-pulse p-2 bg-yellow-900/20 rounded border border-yellow-500/30">
                          🎹 Hit a MIDI note to map to Pad {midiLearning + 1}
                        </div>}
                    </div>

                    {/* Current Mapping Display */}
                    <div className="space-y-3">
                      <h3 className="text-sm font-medium text-gray-300">Current Mapping</h3>
                      <div className="bg-gray-800/50 rounded-lg border border-gray-700/50 p-3 max-h-40 overflow-y-auto">
                        <div className="space-y-2">
                          {Object.entries(midiMapping).map(([note, pad]) => <div key={note} className="flex justify-between items-center text-xs">
                              <span className="text-gray-400">Note {note}</span>
                              <span className="text-gray-300">→ Pad {pad + 1}</span>
                            </div>)}
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-3">
                      <Button variant="outline" size="sm" onClick={() => {
                  setMidiMapping({
                    36: 0,
                    37: 1,
                    38: 2,
                    39: 3,
                    40: 4,
                    41: 5,
                    42: 6,
                    43: 7,
                    44: 8,
                    45: 9,
                    46: 10,
                    47: 11,
                    48: 12,
                    49: 13,
                    50: 14,
                    51: 15
                  });
                  toast.success('MIDI mapping reset to default');
                }} className="flex-1 bg-gray-800/50 border-gray-600 text-gray-300 hover:bg-gray-700/50">
                        Reset to Default
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setShowMidiPanel(false)} className="bg-green-600/20 border-green-500/50 text-green-300 hover:bg-green-600/30">
                        Done
                      </Button>
                    </div>
                  </div>}

                {!midiEnabled && <div className="text-center py-8">
                    <div className="text-gray-400 text-sm">
                      MIDI is not available in this browser or device.
                    </div>
                    <div className="text-xs text-gray-500 mt-2">
                      Try using Chrome, Edge, or Firefox with a MIDI controller connected.
                    </div>
                  </div>}
              </div>
            </div>
          </div>}
      
        {/* Visual Feedback Overlay */}
        <VisualFeedback isPlaying={isPlaying} currentStep={currentStep} bpm={bpm[0]} sequencerLength={sequencerLength} patterns={patterns} />
      </div>
    </div>;
};
export default DrumMachine;