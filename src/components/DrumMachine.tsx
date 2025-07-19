import { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from '@/components/ui/context-menu';
import { Play, Pause, Square, Mic, Volume2, Upload, Save, FolderOpen, Copy, RotateCcw, VolumeX, Download, Edit, RefreshCw, Sparkles, X, Music } from 'lucide-react';
import { toast } from 'sonner';
import { WaveformEditor } from './WaveformEditor';
import { MixerPanel } from './MixerPanel';
import { PatternManager } from './PatternManager';
import { AudioExporter } from './AudioExporter';
import { VisualFeedback, WaveformVisualizer } from './VisualFeedback';
import { VolumeKnob } from './VolumeKnob';
import { useNavigate } from 'react-router-dom';
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
    gateMode: false
  }));
  const [patterns, setPatterns] = useState<PatternStep[][]>(
    Array(16).fill(null).map(() => 
      Array(16).fill({ active: false, velocity: 80 })
    )
  );
  const [masterVolume, setMasterVolume] = useState(0.7);
  const [volumes, setVolumes] = useState<number[]>(Array(16).fill(0.7));
  const [muteStates, setMuteStates] = useState<boolean[]>(Array(16).fill(false));
  const [soloStates, setSoloStates] = useState<boolean[]>(Array(16).fill(false));
  const [selectedPad, setSelectedPad] = useState<number | null>(null);
  const [selectedTrack, setSelectedTrack] = useState<number | null>(null);
  const [swing, setSwing] = useState([0]);
  const [currentDisplayMode, setCurrentDisplayMode] = useState<'drum-machine' | 'sample-library' | 'patterns' | 'export'>('drum-machine');
  const [savedPatterns, setSavedPatterns] = useState<Pattern[]>([]);

  // Initialize audio context
  useEffect(() => {
    const initAudioContext = async () => {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        if (audioContextRef.current.state === 'suspended') {
          await audioContextRef.current.resume();
        }
      }
    };
    initAudioContext();
  }, []);

  // Transport controls
  const handlePlay = useCallback(() => {
    setIsPlaying(true);
    setCurrentStep(-1);
  }, []);

  const handlePause = useCallback(() => {
    setIsPlaying(false);
  }, []);

  const handleStop = useCallback(() => {
    setIsPlaying(false);
    setCurrentStep(-1);
  }, []);

  // Pattern operations
  const clearPattern = useCallback(() => {
    const newPatterns = patterns.map((pattern, index) => {
      if (selectedTrack !== null && selectedTrack !== index) {
        return pattern;
      }
      return Array(sequencerLength).fill({ active: false, velocity: 80 });
    });
    setPatterns(newPatterns);
    toast.success(`Pattern cleared for ${selectedTrack !== null ? `track ${selectedTrack + 1}` : 'all tracks'}`);
  }, [patterns, selectedTrack, sequencerLength]);

  const randomizePattern = useCallback(() => {
    const newPatterns = patterns.map((pattern, index) => {
      if (selectedTrack !== null && selectedTrack !== index) {
        return pattern;
      }
      return Array(sequencerLength).fill(null).map(() => ({
        active: Math.random() > 0.7,
        velocity: 60 + Math.random() * 40
      }));
    });
    setPatterns(newPatterns);
    toast.success(`Pattern randomized for ${selectedTrack !== null ? `track ${selectedTrack + 1}` : 'all tracks'}`);
  }, [patterns, selectedTrack, sequencerLength]);

  const canPerformPatternOperations = () => {
    if (selectedTrack !== null) {
      return samples[selectedTrack]?.buffer !== null;
    }
    return samples.some(sample => sample?.buffer !== null);
  };

  const getOperationDescription = () => {
    if (selectedTrack !== null) {
      return `track ${selectedTrack + 1}`;
    }
    const loadedCount = samples.filter(sample => sample?.buffer !== null).length;
    return `${loadedCount} loaded tracks`;
  };

  // Sample loading
  const handleSampleLoad = useCallback((index: number, file: File) => {
    if (!audioContextRef.current) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      if (!e.target?.result || !audioContextRef.current) return;
      
      try {
        const arrayBuffer = e.target.result as ArrayBuffer;
        const audioBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer);
        
        const newSamples = [...samples];
        newSamples[index] = {
          buffer: audioBuffer,
          name: file.name.replace(/\.[^/.]+$/, ""),
          startTime: 0,
          endTime: audioBuffer.duration,
          gateMode: false
        };
        setSamples(newSamples);
        toast.success(`Sample "${file.name}" loaded successfully`);
      } catch (error) {
        toast.error(`Failed to load sample: ${error}`);
      }
    };
    reader.readAsArrayBuffer(file);
  }, [samples]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black text-white p-4">
      <div className="max-w-7xl mx-auto space-y-4">
        {/* Header with Navigation */}
        <div className="flex items-center justify-between bg-gray-900/80 backdrop-blur-md p-4 rounded-lg border border-purple-500/30 shadow-lg shadow-purple-500/20 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-purple-500/10 via-pink-500/5 to-cyan-500/10 rounded-lg pointer-events-none"></div>
          <div className="relative z-10 flex items-center gap-4">
            <h1 className="text-2xl font-bold bg-gradient-to-r from-green-400 via-cyan-400 to-purple-400 bg-clip-text text-transparent">
              MPC-X Drum Machine
            </h1>
            <div className="flex gap-2">
              <Button
                variant={currentDisplayMode === 'drum-machine' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setCurrentDisplayMode('drum-machine')}
                className="text-xs"
              >
                SEQUENCER
              </Button>
              <Button
                variant={currentDisplayMode === 'sample-library' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setCurrentDisplayMode('sample-library')}
                className="text-xs"
              >
                LIBRARY
              </Button>
              <Button
                variant={currentDisplayMode === 'patterns' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setCurrentDisplayMode('patterns')}
                className="text-xs"
              >
                PATTERNS
              </Button>
              <Button
                variant={currentDisplayMode === 'export' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setCurrentDisplayMode('export')}
                className="text-xs"
              >
                EXPORT
              </Button>
            </div>
          </div>
        </div>

        {/* Transport Controls - Compact Layout */}
        <div className="bg-gray-900/80 backdrop-blur-md p-4 mb-2 rounded-lg border border-green-500/30 shadow-lg shadow-green-500/20 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-green-500/10 via-cyan-500/5 to-blue-500/10 rounded-lg pointer-events-none"></div>
          <div className="relative z-10">
            <div className="flex items-center justify-between">
              {/* Left: Transport Buttons */}
              <div className="flex items-center gap-3">
                {/* Play/Pause Button */}
                <div className="text-center">
                  <Button 
                    onClick={isPlaying ? handlePause : handlePlay}
                    variant="outline" 
                    size="lg" 
                    className={`h-12 w-12 rounded-full ${isPlaying ? 'bg-orange-600/20 border-orange-500/50 text-orange-300' : 'bg-green-600/20 border-green-500/50 text-green-300'} hover:scale-110 transition-all duration-200 shadow-lg`}
                    title={isPlaying ? 'Pause sequencer' : 'Start sequencer'}
                  >
                    {isPlaying ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6" />}
                  </Button>
                  <div className="text-xs text-gray-400 mt-1 font-medium">
                    {isPlaying ? 'PAUSE' : 'PLAY'}
                  </div>
                </div>
                
                {/* Stop Button */}
                <div className="text-center">
                  <Button 
                    onClick={handleStop}
                    variant="outline" 
                    size="lg" 
                    className="h-12 w-12 rounded-full bg-red-600/20 border-red-500/50 text-red-300 hover:bg-red-600/30 hover:scale-110 transition-all duration-200 shadow-lg"
                    title="Stop sequencer and reset to beginning"
                  >
                    <Square className="h-6 w-6" />
                  </Button>
                  <div className="text-xs text-red-400 mt-1 font-medium">
                    STOP
                  </div>
                </div>
                
                {/* Pattern Record Button */}
                <div className="text-center">
                  <Button 
                    onClick={() => setIsPatternRecording(!isPatternRecording)}
                    variant="outline" 
                    size="lg" 
                    className={`h-12 w-12 rounded-full ${isPatternRecording ? 'bg-red-600/30 border-red-500 text-red-200 animate-pulse shadow-lg shadow-red-500/30' : 'bg-gray-600/20 border-gray-500/50 text-gray-300'} hover:scale-110 transition-all duration-200 shadow-lg`}
                    title={isPatternRecording ? 'Stop pattern recording' : 'Start pattern recording (press pads while sequencer plays to record)'}
                  >
                    <Mic className="h-6 w-6" />
                  </Button>
                  <div className={`text-xs mt-1 font-medium ${isPatternRecording ? 'text-red-400 animate-pulse' : 'text-gray-400'}`}>
                    {isPatternRecording ? 'RECORDING' : 'RECORD'}
                  </div>
                </div>
              </div>

              {/* Center: BPM and Steps */}
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400 w-8">BPM</span>
                  <Slider
                    value={bpm}
                    onValueChange={setBpm}
                    min={60}
                    max={200}
                    step={1}
                    className="w-20"
                  />
                  <span className="text-xs text-gray-300 w-8">{bpm[0]}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400 w-12">Steps</span>
                  <Select value={sequencerLength.toString()} onValueChange={(value) => setSequencerLength(parseInt(value))}>
                    <SelectTrigger className="w-16 h-6 text-xs bg-gray-800/50 border-gray-600">
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

              {/* Right: Status and Quick Actions */}
              <div className="flex items-center gap-4">
                <div className="text-center">
                  <div className="text-sm font-bold text-white">
                    {isPlaying ? 'PLAYING' : 'STOPPED'}
                  </div>
                  <div className="text-xs text-gray-400">
                    {bpm[0]} BPM • {sequencerLength} Steps
                  </div>
                </div>
                
                <div className="flex gap-2">
                  <Button 
                    onClick={clearPattern} 
                    disabled={!canPerformPatternOperations()}
                    variant="outline" 
                    size="sm" 
                    className="text-xs bg-yellow-600/20 border-yellow-500/50 text-yellow-300 hover:bg-yellow-600/30"
                    title={`Clear patterns for ${getOperationDescription()}`}
                  >
                    <RotateCcw className="h-3 w-3 mr-1" />
                    Clear
                  </Button>
                  
                  <Button 
                    onClick={randomizePattern} 
                    disabled={!canPerformPatternOperations()}
                    variant="outline" 
                    size="sm" 
                    className="text-xs bg-purple-600/20 border-purple-500/50 text-purple-300 hover:bg-purple-600/30"
                    title={`Randomize patterns for ${getOperationDescription()}`}
                  >
                    <RefreshCw className="h-3 w-3 mr-1" />
                    Random
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        {currentDisplayMode === 'drum-machine' && (
          <div className="grid grid-cols-3 gap-4">
            {/* Left Panel - Controls */}
            <div className="space-y-2">
              <div className="bg-gray-900/80 backdrop-blur-md p-3 rounded-lg border border-cyan-500/30 shadow-lg shadow-cyan-500/20 relative overflow-hidden flex justify-center">
                <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 via-purple-500/5 to-blue-500/10 rounded-lg pointer-events-none"></div>
                <div className="relative z-10">
                  <VolumeKnob
                    value={masterVolume * 100}
                    onChange={(value) => setMasterVolume(value / 100)}
                    size="lg"
                    label="MASTER VOLUME"
                  />
                </div>
              </div>
            </div>

            {/* Center Panel - Drum Pads */}
            <div className="bg-gray-900/80 backdrop-blur-md p-4 rounded-lg border border-purple-500/30 shadow-lg shadow-purple-500/20 relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-purple-500/10 via-blue-500/5 to-cyan-500/10 rounded-lg pointer-events-none"></div>
              <div className="relative z-10">
                <div className="grid grid-cols-4 gap-3">
                  {samples.map((sample, index) => (
                    <div
                      key={index}
                      className={`relative group h-16 rounded-lg border-2 transition-all duration-200 cursor-pointer overflow-hidden ${
                        selectedPad === index 
                          ? 'border-cyan-400 shadow-lg shadow-cyan-400/50' 
                          : sample.buffer 
                            ? 'border-green-500/50 hover:border-green-400 shadow-md shadow-green-500/30' 
                            : 'border-gray-600 hover:border-gray-500'
                      } ${
                        sample.buffer 
                          ? 'bg-gradient-to-br from-green-600/20 to-cyan-600/20' 
                          : 'bg-gradient-to-br from-gray-800 to-gray-700'
                      }`}
                      onClick={() => setSelectedPad(selectedPad === index ? null : index)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        const files = Array.from(e.dataTransfer.files);
                        if (files.length > 0 && files[0].type.startsWith('audio/')) {
                          handleSampleLoad(index, files[0]);
                        }
                      }}
                    >
                      <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent rounded-lg pointer-events-none"></div>
                      <div className="relative z-10 h-full flex flex-col items-center justify-center p-2 text-center">
                        <div className="text-xs font-bold text-white mb-1">
                          PAD {index + 1}
                        </div>
                        <div className="text-xs text-gray-300 truncate w-full">
                          {sample.name || 'Empty'}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right Panel - Pattern Grid */}
            <div className="bg-gray-900/80 backdrop-blur-md p-4 rounded-lg border border-blue-500/30 shadow-lg shadow-blue-500/20 relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 via-cyan-500/5 to-green-500/10 rounded-lg pointer-events-none"></div>
              <div className="relative z-10">
                <div className="text-sm font-bold text-center mb-3 text-cyan-400">PATTERN GRID</div>
                <div className="space-y-1">
                  {patterns.slice(0, 8).map((pattern, trackIndex) => (
                    <div key={trackIndex} className="flex items-center gap-1">
                      <div className="w-6 text-xs text-gray-400 text-center">
                        {trackIndex + 1}
                      </div>
                      <div className="flex gap-1">
                        {pattern.slice(0, sequencerLength).map((step, stepIndex) => (
                          <div
                            key={stepIndex}
                            className={`w-3 h-3 border border-gray-600 cursor-pointer transition-all duration-150 ${
                              step.active 
                                ? 'bg-cyan-400 border-cyan-300 shadow-sm shadow-cyan-400/50' 
                                : 'bg-gray-800 hover:bg-gray-700'
                            } ${
                              currentStep === stepIndex 
                                ? 'ring-2 ring-yellow-400 ring-opacity-70' 
                                : ''
                            }`}
                            onClick={() => {
                              const newPatterns = [...patterns];
                              newPatterns[trackIndex] = [...pattern];
                              newPatterns[trackIndex][stepIndex] = {
                                active: !step.active,
                                velocity: step.velocity
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
          </div>
        )}

        {/* Sample Library Display */}
        {currentDisplayMode === 'sample-library' && (
          <div className="bg-gray-900/80 backdrop-blur-md p-6 rounded-lg border border-purple-500/30 shadow-lg shadow-purple-500/20">
            <h2 className="text-xl font-bold mb-4 text-purple-400">Sample Library</h2>
            <p className="text-gray-400">Sample library interface would go here...</p>
          </div>
        )}

        {/* Pattern Manager Display */}
        {currentDisplayMode === 'patterns' && (
          <div className="bg-gray-900/80 backdrop-blur-md p-6 rounded-lg border border-purple-500/30 shadow-lg shadow-purple-500/20">
            <h2 className="text-xl font-bold mb-4 text-purple-400">Pattern Manager</h2>
            <p className="text-gray-400">Pattern management interface would go here...</p>
          </div>
        )}

        {/* Audio Export Display */}
        {currentDisplayMode === 'export' && (
          <AudioExporter 
            patterns={patterns}
            samples={samples}
            bpm={bpm[0]}
            sequencerLength={sequencerLength}
            trackVolumes={volumes}
            trackMutes={muteStates}
            trackSolos={soloStates}
            masterVolume={masterVolume}
            swing={swing[0]}
          />
        )}
      </div>
    </div>
  );
};

export default DrumMachine;