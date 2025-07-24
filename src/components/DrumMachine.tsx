import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { toast } from 'sonner';
import { Play, Pause, Square, Sparkles, RefreshCw, Upload, Download, Trash2, RotateCcw, Edit, Music, Piano, Volume2, VolumeX, Share, Settings, MessageSquare, Keyboard, Fingerprint, Copy } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem, ContextMenuLabel, ContextMenuSeparator } from '@/components/ui/context-menu';
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
  fadeIn: number;
  fadeOut: number;
  reverb: number;
  filter: number;
  pitch: number;
  distortion: number;
  delay: number;
  chorus: number;
  panning: number;
  normalize: boolean;
  removeDcOffset: boolean;
  highpassFilter: number;
  lowpassFilter: number;
  gain: number;
  gateMode: boolean;
}

interface PatternStep {
  active: boolean;
  velocity: number;
}

interface MidiMapping {
  [note: number]: number;
}

interface Song {
  id: string;
  name: string;
  patterns: Array<{
    id: string;
    name: string;
    steps: PatternStep[][];
    bpm: number;
    swing: number;
    repeat?: number;
  }>;
}

export const DrumMachine: React.FC = () => {
  const navigate = useNavigate();
  const [audioContext, setAudioContext] = useState<AudioContext | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const [samples, setSamples] = useState<Sample[]>(Array(16).fill(null).map((_, i) => ({
    buffer: null,
    name: '',
    startTime: 0,
    endTime: 1,
    fadeIn: 0,
    fadeOut: 0,
    reverb: 0,
    filter: 0,
    pitch: 0,
    distortion: 0,
    delay: 0,
    chorus: 0,
    panning: 0,
    normalize: true,
    removeDcOffset: true,
    highpassFilter: 0,
    lowpassFilter: 22000,
    gain: 1
  })));
  const [patterns, setPatterns] = useState<PatternStep[][]>(
    Array(16).fill(null).map(() => Array(16).fill(null).map(() => ({ active: false, velocity: 100 })))
  );
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [bpm, setBpm] = useState<number[]>([120]);
  const [masterVolume, setMasterVolume] = useState<number[]>([80]);
  const [swing, setSwing] = useState<number[]>([0]);
  const [sequencerLength, setSequencerLength] = useState(16);
  const [selectedPad, setSelectedPad] = useState<number | null>(null);
  const [pendingSample, setPendingSample] = useState<{ sample: Sample; padIndex: number } | null>(null);
  const [editingSample, setEditingSample] = useState<number | null>(null);
  const [trackVolumes, setTrackVolumes] = useState<number[]>(Array(16).fill(75));
  const [trackMutes, setTrackMutes] = useState<boolean[]>(Array(16).fill(false));
  const [trackSolos, setTrackSolos] = useState<boolean[]>(Array(16).fill(false));
  const [showHelp, setShowHelp] = useState(false);
  const [displayMode, setDisplayMode] = useState<'sequencer' | 'editor' | 'patterns' | 'export' | 'song' | 'neural'>('sequencer');
  const [songs, setSongs] = useState<Song[]>([{
    id: 'default',
    name: 'Song 1',
    patterns: []
  }]);
  const [currentSongIndex, setCurrentSongIndex] = useState(0);
  const [selectedTrack, setSelectedTrack] = useState<number | null>(null);
  const [midiMapping, setMidiMapping] = useState<MidiMapping>({});
  const [midiLearning, setMidiLearning] = useState<{ active: boolean; padIndex: number | null }>({ active: false, padIndex: null });
  const [showMidiPanel, setShowMidiPanel] = useState(false);
  const [midiEnabled, setMidiEnabled] = useState(false);
  const [isPatternRecording, setIsPatternRecording] = useState(false);
  const [quantizeEnabled, setQuantizeEnabled] = useState(true);
  const [quantizeStrength, setQuantizeStrength] = useState<number[]>([80]);
  const [quantizeGrid, setQuantizeGrid] = useState<'16th' | '8th' | '4th'>('16th');
  const [showSampleOrganizer, setShowSampleOrganizer] = useState(false);
  const [temperature, setTemperature] = useState<number[]>([1.0]);
  const [targetTracks, setTargetTracks] = useState<number[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [neuralEnabled, setNeuralEnabled] = useState(false);
  const [currentPatternName, setCurrentPatternName] = useState('New Pattern');

  const rnnRef = useRef<mm.MusicRNN | null>(null);
  const sequencerTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const sampleFilesRef = useRef<File[]>([]);

  useEffect(() => {
    audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    setAudioContext(audioContextRef.current);

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

    const initializeMIDI = async () => {
      try {
        if (navigator.requestMIDIAccess) {
          const access = await navigator.requestMIDIAccess();
          if (access) {
            setMidiEnabled(true);
            const inputs = access.inputs.values();
            for (let input = inputs.next(); input && !input.done; input = inputs.next()) {
              input.value.onmidimessage = handleMIDIMessage;
            }
            toast.success('MIDI enabled!');
          }
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

  const handleMIDIMessage = useCallback((message: any) => {
    const [status, note, velocity] = message.data;

    if (status === 144 && velocity > 0) {
      if (midiLearning.active && midiLearning.padIndex !== null) {
        setMidiMapping(prevMapping => ({ ...prevMapping, [note]: midiLearning.padIndex! }));
        setMidiLearning({ active: false, padIndex: null });
        toast.success(`MIDI note ${note} mapped to pad ${midiLearning.padIndex! + 1}`);
        return;
      }

      const padIndex = midiMapping[note];
      if (padIndex !== undefined) {
        playPad(padIndex);
      }
    }
  }, [midiMapping, midiLearning, playPad]);

  const toggleStep = (padIndex: number, stepIndex: number) => {
    const newPatterns = [...patterns];
    newPatterns[padIndex][stepIndex] = {
      ...newPatterns[padIndex][stepIndex],
      active: !newPatterns[padIndex][stepIndex].active
    };
    setPatterns(newPatterns);
  };

  const playPad = useCallback((index: number) => {
    if (!audioContextRef.current || !samples[index]?.buffer) return;

    const source = audioContextRef.current.createBufferSource();
    source.buffer = samples[index].buffer;
    source.connect(audioContextRef.current.destination);
    source.start();
  }, [samples]);

  const handlePadRelease = (index: number) => {
    // Handle pad release logic here
    console.log(`Released pad ${index}`);
  };

  const togglePlayback = () => {
    setIsPlaying(!isPlaying);
    if (!isPlaying) {
      startSequencer();
    } else {
      stopSequencer();
    }
  };

  const stopPlayback = () => {
    setIsPlaying(false);
    setCurrentStep(0);
    stopSequencer();
  };

  const startSequencer = () => {
    if (sequencerTimeoutRef.current) {
      clearTimeout(sequencerTimeoutRef.current);
    }

    const scheduleStep = () => {
      sequencerTimeoutRef.current = setTimeout(() => {
        setCurrentStep((prevStep) => {
          const nextStep = (prevStep + 1) % sequencerLength;

          patterns.forEach((pattern, padIndex) => {
            if (pattern[nextStep].active) {
              playPad(padIndex);
            }
          });

          if (isPlaying) {
            scheduleStep();
          }

          return nextStep;
        });
      }, 60000 / bpm[0] / 4);
    };

    scheduleStep();
  };

  const stopSequencer = () => {
    if (sequencerTimeoutRef.current) {
      clearTimeout(sequencerTimeoutRef.current);
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 bg-transparent min-h-screen">
      <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-lg p-6 relative overflow-hidden">
        
        {/* Header */}
        <div className="neon-panel flex justify-between items-center mb-6 relative overflow-hidden bg-transparent rounded-lg border border-gray-700/50 p-4">
          <div className="shine"></div>
          <div className="glow"></div>
          <div className="inner">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <img src="/lovable-uploads/8172f0a9-66b9-4449-b322-0291dc32073c.png" alt="XBEAT Studio" className="h-8 w-auto" />
                <h1 className="text-2xl font-bold text-cyan-300 text-shadow-glow">XBEAT Studio</h1>
              </div>
              <div className="text-sm text-gray-400">
                Professional Drum Machine
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              <Button variant="outline" size="sm" onClick={() => navigate('/library')} className="glass-strong bg-blue-600/20 border-blue-500/50 text-blue-300 hover:bg-blue-600/30 transition-all duration-200">
                <Upload className="w-4 h-4 mr-2" />
                Sample Library
              </Button>
              
              <Button variant="outline" size="sm" onClick={() => setShowHelp(true)} className="glass-strong bg-green-600/20 border-green-500/50 text-green-300 hover:bg-green-600/30 transition-all duration-200">
                <Keyboard className="w-4 h-4 mr-2" />
                Help
              </Button>
            </div>
          </div>
        </div>

        {/* Main Grid Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Left Column - Drum Pads */}
          <div className="space-y-4">
            <div className="neon-panel p-4 relative overflow-hidden bg-transparent rounded-lg border border-gray-700/50">
              <div className="shine"></div>
              <div className="glow"></div>
              <div className="inner">
                <h2 className="text-xl font-bold text-cyan-300 mb-4 text-shadow-glow">DRUM PADS</h2>
                <div className="grid grid-cols-4 gap-2">
                  {Array.from({ length: 16 }, (_, index) => (
                    <div key={index} className="relative">
                      <button
                        onMouseDown={() => playPad(index)}
                        onMouseUp={() => handlePadRelease(index)}
                        className={`neon-panel w-full aspect-square rounded-lg border transition-all duration-200 relative overflow-hidden ${
                          samples[index]?.buffer 
                            ? 'border-cyan-400/50 text-cyan-300 hover:border-cyan-400 hover:shadow-lg hover:shadow-cyan-500/25' 
                            : 'border-gray-600/50 text-gray-400 hover:border-gray-500'
                        } ${selectedPad === index ? 'ring-2 ring-cyan-400' : ''}`}
                        title={samples[index]?.name || `Pad ${index + 1}`}
                      >
                        <div className="shine"></div>
                        <div className="glow"></div>
                        <div className="inner">
                          <div className="flex flex-col items-center justify-center h-full">
                            <span className="text-xs font-medium">
                              {index + 1}
                            </span>
                            {samples[index]?.name && (
                              <span className="text-xs opacity-80 truncate w-full text-center">
                                {samples[index].name}
                              </span>
                            )}
                          </div>
                        </div>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Center Column - Main Display */}
          <div className="space-y-4">
            {/* Display Mode Buttons */}
            <div className="flex gap-2 mb-4">
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
                onClick={() => setDisplayMode('patterns')} 
                variant={displayMode === 'patterns' ? 'default' : 'outline'} 
                size="sm" 
                className={`text-xs transition-all duration-300 ${
                  displayMode === 'patterns' 
                    ? 'bg-purple-500/20 border-purple-400 text-purple-300 shadow-lg shadow-purple-500/25' 
                    : 'bg-gray-800 border-gray-600 text-gray-300'
                }`}
              >
                PATTERNS
              </Button>
              <Button 
                onClick={() => setDisplayMode('export')} 
                variant={displayMode === 'export' ? 'default' : 'outline'} 
                size="sm" 
                className={`text-xs transition-all duration-300 ${
                  displayMode === 'export' 
                    ? 'bg-green-500/20 border-green-400 text-green-300 shadow-lg shadow-green-500/25' 
                    : 'bg-gray-800 border-gray-600 text-gray-300'
                }`}
              >
                EXPORT
              </Button>
              <Button 
                onClick={() => setDisplayMode('neural')} 
                variant={displayMode === 'neural' ? 'default' : 'outline'} 
                size="sm" 
                className={`text-xs transition-all duration-300 ${
                  displayMode === 'neural' 
                    ? 'bg-pink-500/20 border-pink-400 text-pink-300 shadow-lg shadow-pink-500/25' 
                    : 'bg-gray-800 border-gray-600 text-gray-300'
                }`}
              >
                AI
              </Button>
            </div>

            {/* Main Display Panel */}
            <div className="neon-panel h-[32rem] rounded border border-gray-600/50 p-4 relative overflow-hidden">
              <div className="shine"></div>
              <div className="glow"></div>
              <div className="inner">
                {displayMode === 'sequencer' ? (
                  <div className="h-full bg-transparent">
                    <div className="flex justify-between items-center mb-4">
                      <div className="text-center flex-1">
                        <h2 className="text-xl font-bold text-cyan-300 mb-2 text-shadow-glow">SEQUENCER</h2>
                        <p className="text-gray-300 text-sm">{currentPatternName}</p>
                      </div>
                    </div>
                    
                    <div className="h-80 overflow-y-auto">
                      {/* Step numbers row */}
                      <div className="flex gap-1 mb-2 ml-[134px] overflow-x-auto">
                        {Array.from({ length: sequencerLength }, (_, stepIndex) => (
                          <div 
                            key={stepIndex} 
                            className={`w-6 h-5 rounded text-xs flex items-center justify-center flex-shrink-0 transition-all duration-300 ${
                              currentStep === stepIndex 
                                ? 'bg-gradient-to-br from-red-500 to-red-600 text-white shadow-lg shadow-red-500/50 scale-110' 
                                : 'bg-gray-700/50 text-gray-400 backdrop-blur-sm'
                            }`}
                          >
                            {stepIndex + 1}
                          </div>
                        ))}
                      </div>
                      
                      {/* Track rows with labels */}
                      <div className="space-y-0">
                        {Array.from({ length: 16 }, (_, padIndex) => (
                          <div key={padIndex} className="flex items-center gap-1 overflow-x-auto">
                            <button 
                              className={`glass w-14 flex-shrink-0 text-xs truncate transition-all duration-200 rounded px-1 py-0.5 ${
                                selectedTrack === padIndex 
                                  ? 'bg-cyan-600/30 border border-cyan-400/50 text-cyan-300 shadow-md shadow-cyan-500/30' 
                                  : 'text-gray-400 hover:bg-gray-700/50 hover:text-gray-300'
                              }`}
                            >
                              {samples[padIndex]?.name || `T${padIndex + 1}`}
                            </button>
                            
                            <div className="flex gap-1">
                              {Array.from({ length: sequencerLength }, (_, stepIndex) => (
                                <button 
                                  key={stepIndex} 
                                  onClick={() => toggleStep(padIndex, stepIndex)}
                                  className={`glass w-6 h-5 rounded flex-shrink-0 transition-all duration-200 ${
                                    patterns[padIndex][stepIndex]?.active 
                                      ? 'bg-gradient-to-r from-cyan-400 to-cyan-500 shadow-md shadow-cyan-500/50' 
                                      : 'bg-gray-600/50 hover:bg-gray-500/70 backdrop-blur-sm'
                                  } ${
                                    currentStep === stepIndex && patterns[padIndex][stepIndex]?.active 
                                      ? 'ring-2 ring-red-400 ring-opacity-75' 
                                      : ''
                                  }`}
                                />
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : displayMode === 'patterns' ? (
                  <div className="h-full overflow-auto">
                    <PatternManager 
                      currentPattern={patterns} 
                      currentBpm={bpm[0]} 
                      currentSwing={swing[0]} 
                      onLoadPattern={(pattern) => {
                        setPatterns(pattern.steps);
                        setBpm([pattern.bpm]);
                        setSwing([pattern.swing]);
                        setCurrentPatternName(pattern.name);
                        toast.success(`Loaded pattern "${pattern.name}"`);
                      }}
                      onSavePattern={(name, description, genre) => {
                        const newPattern = {
                          id: Date.now().toString(),
                          name,
                          description,
                          steps: patterns,
                          bpm: bpm[0],
                          swing: swing[0],
                          genre,
                          createdAt: new Date().toISOString(),
                          length: sequencerLength
                        };
                        toast.success(`Saved pattern "${name}"`);
                      }}
                    />
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
                ) : displayMode === 'neural' ? (
                  <div className="h-full overflow-auto p-4">
                    <NeuralDrumGenerator 
                      patterns={patterns} 
                      onPatternGenerated={setPatterns} 
                      bpm={bpm[0]} 
                      sequencerLength={sequencerLength} 
                    />
                  </div>
                ) : (
                  <div className="h-full overflow-auto">
                    <div className="text-center mb-2">
                      <p className="text-gray-300 text-sm">
                        Select a display mode to continue
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right Column - Controls */}
          <div className="space-y-4">
            {/* Transport Controls */}
            <div className="neon-panel p-4 relative overflow-hidden bg-transparent rounded-lg border border-gray-700/50">
              <div className="shine"></div>
              <div className="glow"></div>
              <div className="inner">
                <h2 className="text-lg font-bold text-cyan-300 mb-4 text-shadow-glow">TRANSPORT</h2>
                <div className="flex gap-2 mb-4">
                  <Button
                    onClick={togglePlayback}
                    variant="outline"
                    size="sm"
                    className={`glass-strong transition-all duration-200 ${
                      isPlaying 
                        ? 'bg-green-600/20 border-green-500/50 text-green-300 hover:bg-green-600/30' 
                        : 'bg-blue-600/20 border-blue-500/50 text-blue-300 hover:bg-blue-600/30'
                    }`}
                  >
                    {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  </Button>
                  <Button
                    onClick={stopPlayback}
                    variant="outline"
                    size="sm"
                    className="glass-strong bg-red-600/20 border-red-500/50 text-red-300 hover:bg-red-600/30 transition-all duration-200"
                  >
                    <Square className="w-4 h-4" />
                  </Button>
                </div>
                
                <div className="space-y-4">
                  <div>
                    <label className="text-sm text-gray-300 mb-2 block">BPM: {bpm[0]}</label>
                    <Slider
                      value={bpm}
                      onValueChange={setBpm}
                      min={60}
                      max={200}
                      step={1}
                      className="glass-glow"
                    />
                  </div>
                  
                  <div>
                    <label className="text-sm text-gray-300 mb-2 block">Master Volume: {masterVolume[0]}%</label>
                    <Slider
                      value={masterVolume}
                      onValueChange={setMasterVolume}
                      min={0}
                      max={100}
                      step={1}
                      className="glass-glow"
                    />
                  </div>
                  
                  <div>
                    <label className="text-sm text-gray-300 mb-2 block">Swing: {swing[0]}%</label>
                    <Slider
                      value={swing}
                      onValueChange={setSwing}
                      min={0}
                      max={100}
                      step={1}
                      className="glass-glow"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Visual Feedback Overlay */}
        <VisualFeedback 
          isPlaying={isPlaying} 
          currentStep={currentStep} 
          bpm={bpm[0]} 
          sequencerLength={sequencerLength} 
          patterns={patterns} 
        />
      </div>
    </div>
  );
};

export default DrumMachine;
