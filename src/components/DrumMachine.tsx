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
import { KeyboardShortcutsHelp } from './KeyboardShortcutsHelp';
import { SampleOrganizer } from './SampleOrganizer';
import { useNavigate } from 'react-router-dom';
import * as mm from '@magenta/music';
import useKeyboardShortcuts from '@/hooks/useKeyboardShortcuts';

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
  const [trackMutes, setTrackMutes] = useState<boolean[]>(Array(16).fill(false));
  const [trackSolos, setTrackSolos] = useState<boolean[]>(Array(16).fill(false));
  const [selectedPad, setSelectedPad] = useState<number | null>(null);
  const [selectedTrack, setSelectedTrack] = useState<number | null>(null);
  const [masterVolume, setMasterVolume] = useState(0.8);
  const [displayMode, setDisplayMode] = useState<'sequencer' | 'editor' | 'patterns' | 'export' | 'song'>('sequencer');

  // Additional state for playing sources to manage gate mode playback
  const [playingSources, setPlayingSources] = useState<Map<number, AudioBufferSourceNode>>(new Map());

  // Function to play a sound for a given pad index and velocity
  const playSound = useCallback(async (padIndex: number, velocity: number = 100) => {
    if (!audioContextRef.current || !samples[padIndex]?.buffer) return;

    const context = audioContextRef.current;
    const sample = samples[padIndex];
    
    try {
      const source = context.createBufferSource();
      const gainNode = context.createGain();
      
      source.buffer = sample.buffer;
      
      // Calculate velocity-based volume (MIDI velocity 0-127 to gain 0-1)
      const velocityGain = velocity / 127;
      const trackVolume = trackVolumes[padIndex] / 100;
      const sampleVolume = sample.volume;
      
      gainNode.gain.value = velocityGain * trackVolume * sampleVolume * masterVolume;
      
      if (sample.pitch !== 0) {
        source.playbackRate.value = Math.pow(2, sample.pitch / 12);
      }
      
      source.connect(gainNode);
      gainNode.connect(context.destination);
      
      const startTime = sample.startTime * sample.buffer.duration;
      const endTime = sample.endTime * sample.buffer.duration;
      const duration = endTime - startTime;
      
      if (sample.gateMode) {
        // If gate mode, stop any currently playing source for this pad
        const currentSource = playingSources.get(padIndex);
        if (currentSource) {
          currentSource.stop();
          setPlayingSources(prev => {
            const newMap = new Map(prev);
            newMap.delete(padIndex);
            return newMap;
          });
        }
        source.start(0, startTime, duration);
        setPlayingSources(prev => new Map(prev.set(padIndex, source)));
        source.onended = () => {
          setPlayingSources(prev => {
            const newMap = new Map(prev);
            newMap.delete(padIndex);
            return newMap;
          });
        };
      } else {
        // Non-gate mode plays normally
        source.start(0, startTime);
      }
    } catch (error) {
      console.error('Error playing sound:', error);
    }
  }, [samples, trackVolumes, masterVolume, playingSources]);

  // Handle pad press event
  const handlePadPress = useCallback((padIndex: number, velocity: number = 100) => {
    playSound(padIndex, velocity);
    setSelectedPad(padIndex);
  }, [playSound]);

  // Play/pause toggle handler
  const handlePlayPause = () => {
    if (isPlaying) {
      setIsPlaying(false);
      setCurrentStep(-1);
    } else {
      setIsPlaying(true);
    }
  };

  // Stop handler
  const handleStop = () => {
    setIsPlaying(false);
    setCurrentStep(-1);
  };

  // Record toggle handler
  const handleRecord = () => {
    setIsPatternRecording(!isPatternRecording);
  };

  // File upload handler for loading samples
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !audioContextRef.current || selectedPad === null) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const arrayBuffer = e.target?.result as ArrayBuffer;
        const audioBuffer = await audioContextRef.current!.decodeAudioData(arrayBuffer);
        
        const newSamples = [...samples];
        newSamples[selectedPad] = {
          buffer: audioBuffer,
          name: file.name,
          startTime: 0,
          endTime: 1,
          gateMode: true,
          pitch: 0,
          reverse: false,
          volume: 0.8
        };
        setSamples(newSamples);
        toast.success(`Sample loaded to pad ${selectedPad + 1}!`);
      } catch (error) {
        console.error('Error loading sample:', error);
        toast.error('Error loading sample file');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  useKeyboardShortcuts({
    onPlayPause: handlePlayPause,
    onStop: handleStop,
    onRecord: handleRecord,
    onBpmIncrease: () => setBpm([Math.min(200, bpm[0] + 5)]),
    onBpmDecrease: () => setBpm([Math.max(60, bpm[0] - 5)]),
    onVolumeUp: () => setMasterVolume(prev => Math.min(1, prev + 0.1)),
    onVolumeDown: () => setMasterVolume(prev => Math.max(0, prev - 0.1)),
    onPadPress: (padIndex) => handlePadPress(padIndex),
    onStepToggle: (stepIndex) => {
      // Add step toggle logic if needed
    }
  });

  return (
    <div className="min-h-screen bg-black p-2 font-mono">
      <div className="max-w-7xl mx-auto">
        {/* Top Control Bar */}
        <div className="bg-gray-900 p-2 mb-2 rounded border border-gray-700">
          <div className="flex items-center justify-between">
            <div className="text-white font-bold text-lg tracking-wider">X BEAT STUDIO</div>
            <div className="flex gap-2">
              <SampleOrganizer 
                samples={samples}
                onSampleSelect={(sample, padIndex) => {
                  const newSamples = [...samples];
                  newSamples[padIndex] = sample;
                  setSamples(newSamples);
                  toast.success(`Sample loaded to pad ${padIndex + 1}!`);
                }}
                selectedPad={selectedPad}
              />
              <KeyboardShortcutsHelp />
              <Button 
                variant="outline" 
                size="sm" 
                className="bg-gray-800 border-gray-600 text-gray-300 text-xs hover:bg-purple-800/20 hover:border-purple-400 neon-border"
                onClick={() => navigate('/library')}
              >
                <Music className="w-3 h-3 mr-1" />
                LIBRARY
              </Button>
            </div>
          </div>
        </div>

        {/* Main Layout Container - Effects panel left, smaller sequencer center, large pads right */}
        <div className="grid grid-cols-[200px_1fr_400px] gap-4 h-[600px]">
          {/* Left Control Panel */}
          <div className="space-y-2">
            {/* Master Volume */}
            <div className="bg-gray-900/80 backdrop-blur-md p-3 rounded-lg border border-cyan-500/30 shadow-lg shadow-cyan-500/20 relative overflow-hidden flex justify-center">
              <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 via-purple-500/5 to-blue-500/10 rounded-lg pointer-events-none"></div>
              <div className="relative z-10">
                <VolumeKnob
                  value={masterVolume * 100}
                  onChange={(value) => setMasterVolume(value / 100)}
                  size="lg"
                  label="MASTER"
                />
              </div>
            </div>

            {/* Effects Panel */}
            <div className="bg-gray-900/80 backdrop-blur-md p-4 rounded-lg border border-yellow-500/30 shadow-lg shadow-yellow-500/20 relative overflow-hidden flex-1">
              <div className="absolute inset-0 bg-gradient-to-br from-yellow-500/10 via-orange-500/5 to-red-500/10 rounded-lg pointer-events-none"></div>
              <div className="relative z-10">
                <div className="text-xs text-yellow-400 mb-4">AUDIO EFFECTS</div>
                
                <div className="grid grid-cols-2 gap-2">
                  <Button size="sm" variant="outline" className="h-8 text-xs bg-gray-800 border-gray-600 hover:bg-yellow-600/20">
                    REVERB
                  </Button>
                  <Button size="sm" variant="outline" className="h-8 text-xs bg-gray-800 border-gray-600 hover:bg-yellow-600/20">
                    DELAY
                  </Button>
                  <Button size="sm" variant="outline" className="h-8 text-xs bg-gray-800 border-gray-600 hover:bg-yellow-600/20">
                    FILTER
                  </Button>
                  <Button size="sm" variant="outline" className="h-8 text-xs bg-gray-800 border-gray-600 hover:bg-yellow-600/20">
                    DISTORT
                  </Button>
                  <Button size="sm" variant="outline" className="h-8 text-xs bg-gray-800 border-gray-600 hover:bg-yellow-600/20">
                    COMP
                  </Button>
                  <Button size="sm" variant="outline" className="h-8 text-xs bg-gray-800 border-gray-600 hover:bg-yellow-600/20">
                    EQ
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Center - Sequencer Panel */}
          <div className="bg-gray-900/80 backdrop-blur-md p-4 rounded-lg border border-cyan-500/30 shadow-lg shadow-cyan-500/20 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 via-blue-500/5 to-purple-500/10 rounded-lg pointer-events-none"></div>
            <div className="relative z-10 h-full overflow-hidden">
              <div className="text-cyan-400 text-sm mb-4">STEP SEQUENCER</div>
              
              {/* Sequencer Grid */}
              <div className="space-y-1">
                {Array.from({length: 8}, (_, trackIndex) => (
                  <div key={trackIndex} className="flex items-center gap-1">
                    <div className="w-8 text-xs text-gray-400">{trackIndex + 1}</div>
                    <div className="flex gap-1">
                      {Array.from({length: 16}, (_, stepIndex) => (
                        <button
                          key={stepIndex}
                          className={`w-6 h-6 rounded border ${
                            patterns[trackIndex]?.[stepIndex]?.active
                              ? 'bg-cyan-500 border-cyan-400'
                              : 'bg-gray-700 border-gray-600 hover:bg-gray-600'
                          } ${currentStep === stepIndex ? 'ring-2 ring-yellow-400' : ''}`}
                          onClick={() => {
                            const newPatterns = [...patterns];
                            if (!newPatterns[trackIndex]) {
                              newPatterns[trackIndex] = Array(64).fill({ active: false, velocity: 80 });
                            }
                            newPatterns[trackIndex][stepIndex] = {
                              ...newPatterns[trackIndex][stepIndex],
                              active: !newPatterns[trackIndex][stepIndex]?.active
                            };
                            setPatterns(newPatterns);
                          }}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right - Large Drum Pads */}
          <div className="bg-gray-900/80 backdrop-blur-md p-6 rounded-lg border border-purple-500/30 shadow-lg shadow-purple-500/20 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-purple-500/10 via-blue-500/5 to-cyan-500/10 rounded-lg pointer-events-none"></div>
            <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-transparent rounded-lg pointer-events-none"></div>
            
            <div className="text-purple-400 text-sm mb-4 relative z-10">DRUM PADS</div>
            
            <div className="grid grid-cols-4 gap-3 relative z-10">
              {Array.from({length: 16}, (_, i) => (
                <ContextMenu key={i}>
                  <ContextMenuTrigger asChild>
                    <button
                      className={`aspect-square bg-gray-800 hover:bg-gray-700 border-2 rounded-lg transition-all duration-200 transform hover:scale-105 active:scale-95 ${
                        selectedPad === i 
                          ? 'border-purple-400 shadow-lg shadow-purple-500/30' 
                          : 'border-gray-600 hover:border-purple-500/50'
                      } ${samples[i]?.buffer ? 'bg-gradient-to-br from-purple-600/30 to-blue-600/20' : ''}`}
                      onClick={() => handlePadPress(i)}
                      onMouseDown={(e) => {
                        if (!samples[i]?.buffer && fileInputRef.current) {
                          setSelectedPad(i);
                          fileInputRef.current.click();
                        }
                      }}
                    >
                      <div className="flex flex-col items-center justify-center h-full p-2">
                        <div className="text-white font-bold text-lg mb-1">{i + 1}</div>
                        <div className="text-xs text-gray-300 text-center truncate w-full">
                          {samples[i]?.name || 'EMPTY'}
                        </div>
                        {samples[i]?.buffer && (
                          <div className="flex gap-1 mt-1">
                            <button
                              className="text-xs bg-red-600/80 hover:bg-red-500 px-1 rounded"
                              onClick={(e) => {
                                e.stopPropagation();
                                setTrackMutes(prev => {
                                  const newMutes = [...prev];
                                  newMutes[i] = !newMutes[i];
                                  return newMutes;
                                });
                              }}
                            >
                              {trackMutes[i] ? 'M' : 'M'}
                            </button>
                            <button
                              className="text-xs bg-yellow-600/80 hover:bg-yellow-500 px-1 rounded"
                              onClick={(e) => {
                                e.stopPropagation();
                                setTrackSolos(prev => {
                                  const newSolos = [...prev];
                                  newSolos[i] = !newSolos[i];
                                  return newSolos;
                                });
                              }}
                            >
                              {trackSolos[i] ? 'S' : 'S'}
                            </button>
                          </div>
                        )}
                      </div>
                    </button>
                  </ContextMenuTrigger>
                  <ContextMenuContent>
                    <ContextMenuItem onClick={() => fileInputRef.current?.click()}>
                      Load Sample
                    </ContextMenuItem>
                    <ContextMenuItem onClick={() => {
                      const newSamples = [...samples];
                      newSamples[i] = {
                        buffer: null,
                        name: '',
                        startTime: 0,
                        endTime: 1,
                        gateMode: true,
                        pitch: 0,
                        reverse: false,
                        volume: 0.8
                      };
                      setSamples(newSamples);
                    }}>
                      Clear Sample
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
              ))}
            </div>
          </div>
        </div>

        {/* Transport Controls */}
        <div className="mt-4 bg-gray-900 p-3 rounded border border-gray-700">
          <div className="flex items-center justify-center gap-4">
            <Button 
              onClick={handlePlayPause}
              className="h-12 w-12 bg-green-600 hover:bg-green-700 border-green-500 rounded-full"
            >
              {isPlaying ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6" />}
            </Button>
            
            <Button 
              onClick={handleStop}
              className="h-12 w-12 bg-red-600 hover:bg-red-700 border-red-500 rounded-full"
            >
              <Square className="h-6 w-6" />
            </Button>
            
            <Button 
              onClick={handleRecord}
              className={`h-12 w-12 border rounded-full ${
                isPatternRecording 
                  ? 'bg-red-700 border-red-600 animate-pulse' 
                  : 'bg-gray-700 hover:bg-gray-600 border-gray-600'
              }`}
            >
              <Mic className="h-6 w-6" />
            </Button>

            <div className="flex items-center gap-2 ml-8">
              <span className="text-gray-400 text-sm">BPM</span>
              <Slider
                value={bpm}
                onValueChange={setBpm}
                min={60}
                max={200}
                step={1}
                className="w-24"
              />
              <span className="text-white text-sm w-12">{bpm[0]}</span>
            </div>

            <div className="text-right">
              <div className="text-green-400 font-mono text-lg">
                {isPlaying ? 'PLAYING' : 'STOPPED'}
              </div>
              <div className="text-gray-400 text-sm">
                {bpm[0]} BPM • {sequencerLength} Steps
              </div>
            </div>
          </div>
        </div>

        {/* Sample File Input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*"
          onChange={handleFileUpload}
          className="hidden"
        />

        {/* Display conditional content based on mode */}
        {displayMode === 'editor' && (
          <WaveformEditor 
            sample={selectedPad !== null ? samples[selectedPad] : null}
            onSampleUpdate={(updatedSample) => {
              if (selectedPad !== null) {
                const newSamples = [...samples];
                newSamples[selectedPad] = updatedSample;
                setSamples(newSamples);
              }
            }}
          />
        )}

        {displayMode === 'patterns' && (
          <PatternManager 
            patterns={[]}
            onPatternSelect={() => {}}
            onPatternSave={() => {}}
            onPatternDelete={() => {}}
          />
        )}

        {displayMode === 'export' && (
          <AudioExporter 
            onExport={() => {}}
          />
        )}

        {displayMode === 'song' && (
          <SongMode 
            songs={[]}
            onSongSelect={() => {}}
            onSongCreate={() => {}}
            onSongDelete={() => {}}
          />
        )}
      </div>
    </div>
  );
};

export default DrumMachine;
