import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { toast } from 'sonner';
import { Play, Pause, Square, Upload, Keyboard } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { KeyboardShortcutsHelp } from './KeyboardShortcutsHelp';
import { useNavigate } from 'react-router-dom';

interface Sample {
  buffer: AudioBuffer | null;
  name: string;
  gateMode: boolean;
}

interface PatternStep {
  active: boolean;
  velocity: number;
}

const DrumMachine: React.FC = () => {
  const navigate = useNavigate();
  const [audioContext, setAudioContext] = useState<AudioContext | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const [samples, setSamples] = useState<Sample[]>(Array(16).fill(null).map(() => ({
    buffer: null,
    name: '',
    gateMode: false
  })));
  const [patterns, setPatterns] = useState<PatternStep[][]>(
    Array(16).fill(null).map(() => Array(16).fill(null).map(() => ({ active: false, velocity: 100 })))
  );
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [bpm, setBpm] = useState<number>(120);
  const [masterVolume, setMasterVolume] = useState<number>(80);
  const [swing, setSwing] = useState<number>(0);
  const [selectedPad, setSelectedPad] = useState<number | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  const sequencerTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    setAudioContext(audioContextRef.current);

    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  const playPad = useCallback((index: number) => {
    if (!audioContextRef.current || !samples[index]?.buffer) return;

    const source = audioContextRef.current.createBufferSource();
    source.buffer = samples[index].buffer;
    source.connect(audioContextRef.current.destination);
    source.start();
  }, [samples]);

  const toggleStep = (padIndex: number, stepIndex: number) => {
    const newPatterns = [...patterns];
    newPatterns[padIndex][stepIndex] = {
      ...newPatterns[padIndex][stepIndex],
      active: !newPatterns[padIndex][stepIndex].active
    };
    setPatterns(newPatterns);
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
          const nextStep = (prevStep + 1) % 16;

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
      }, 60000 / bpm / 4);
    };

    scheduleStep();
  };

  const stopSequencer = () => {
    if (sequencerTimeoutRef.current) {
      clearTimeout(sequencerTimeoutRef.current);
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
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

      {/* Main Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left: Drum Pads */}
        <div className="neon-panel relative overflow-hidden bg-transparent rounded-lg border border-gray-700/50 p-4">
          <div className="shine"></div>
          <div className="glow"></div>
          <div className="inner">
            <h2 className="text-xl font-bold text-cyan-300 mb-4 text-shadow-glow">DRUM PADS</h2>
            <div className="grid grid-cols-4 gap-2">
              {Array.from({ length: 16 }, (_, index) => (
                <div key={index} className="relative">
                  <button
                    onMouseDown={() => playPad(index)}
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

        {/* Center: Sequencer */}
        <div className="neon-panel relative overflow-hidden bg-transparent rounded-lg border border-gray-700/50 p-4">
          <div className="shine"></div>
          <div className="glow"></div>
          <div className="inner">
            <h2 className="text-xl font-bold text-cyan-300 mb-4 text-shadow-glow">SEQUENCER</h2>
            
            {/* Sequencer grid */}
            <div className="space-y-1">
              {Array.from({ length: 16 }, (_, stepIndex) => (
                <div key={stepIndex} className="flex gap-1">
                  <div className="w-8 text-xs text-gray-400 flex items-center">
                    {stepIndex + 1}
                  </div>
                  {Array.from({ length: 16 }, (_, padIndex) => (
                    <button
                      key={padIndex}
                      onClick={() => toggleStep(stepIndex, padIndex)}
                      className={`w-6 h-6 rounded border transition-all duration-200 ${
                        patterns[stepIndex][padIndex].active
                          ? currentStep === padIndex
                            ? 'bg-red-500 border-red-400 shadow-lg'
                            : 'bg-cyan-500 border-cyan-400'
                          : currentStep === padIndex
                            ? 'border-red-400 bg-red-500/20'
                            : 'border-gray-600 hover:border-gray-500'
                      }`}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Controls */}
        <div className="space-y-4">
          {/* Transport Controls */}
          <div className="neon-panel relative overflow-hidden bg-transparent rounded-lg border border-gray-700/50 p-4">
            <div className="shine"></div>
            <div className="glow"></div>
            <div className="inner">
              <h3 className="text-lg font-bold text-cyan-300 mb-3 text-shadow-glow">TRANSPORT</h3>
              <div className="flex gap-2 mb-4">
                <Button onClick={togglePlayback} variant="outline" size="sm">
                  {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                </Button>
                <Button onClick={stopPlayback} variant="outline" size="sm">
                  <Square className="w-4 h-4" />
                </Button>
              </div>
              
              <div className="space-y-3">
                <div>
                  <label className="text-sm text-gray-300 mb-1 block">BPM: {bpm}</label>
                  <Slider
                    value={[bpm]}
                    onValueChange={(value) => setBpm(value[0])}
                    min={60}
                    max={200}
                    step={1}
                    className="w-full"
                  />
                </div>
                
                <div>
                  <label className="text-sm text-gray-300 mb-1 block">Volume: {masterVolume}%</label>
                  <Slider
                    value={[masterVolume]}
                    onValueChange={(value) => setMasterVolume(value[0])}
                    min={0}
                    max={100}
                    step={1}
                    className="w-full"
                  />
                </div>

                <div>
                  <label className="text-sm text-gray-300 mb-1 block">Swing: {swing}</label>
                  <Slider
                    value={[swing]}
                    onValueChange={(value) => setSwing(value[0])}
                    min={0}
                    max={100}
                    step={1}
                    className="w-full"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Help Dialog */}
      {showHelp && (
        <Dialog open={showHelp} onOpenChange={setShowHelp}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Keyboard Shortcuts</DialogTitle>
            </DialogHeader>
            <KeyboardShortcutsHelp />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

export default DrumMachine;