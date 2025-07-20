import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Sparkles, Wand2, Shuffle, Music, Brain, Zap } from 'lucide-react';
import { toast } from 'sonner';
import * as mm from '@magenta/music';

interface PatternStep {
  active: boolean;
  velocity: number;
}

interface NeuralDrumGeneratorProps {
  patterns: PatternStep[][];
  onPatternGenerated: (newPattern: PatternStep[][]) => void;
  bpm: number;
  sequencerLength: number;
}

export const NeuralDrumGenerator = ({ 
  patterns, 
  onPatternGenerated, 
  bpm, 
  sequencerLength 
}: NeuralDrumGeneratorProps) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [temperature, setTemperature] = useState([1.0]);
  const [stepsToGenerate, setStepsToGenerate] = useState([16]);
  const [generationType, setGenerationType] = useState<'continue' | 'fill' | 'variation' | 'new'>('new');
  const [selectedTracks, setSelectedTracks] = useState<number[]>([0, 1, 2, 3]);
  
  const musicRNNRef = useRef<mm.MusicRNN | null>(null);

  const initializeMusicRNN = async () => {
    if (!musicRNNRef.current) {
      try {
        musicRNNRef.current = new mm.MusicRNN('https://storage.googleapis.com/magentadata/js/checkpoints/music_rnn/drum_kit_rnn');
        await musicRNNRef.current.initialize();
        toast.success('Neural drum engine loaded!');
      } catch (error) {
        console.error('Failed to initialize MusicRNN:', error);
        toast.error('Failed to load neural drum engine');
        throw error;
      }
    }
    return musicRNNRef.current;
  };

  const convertPatternToNoteSequence = (pattern: PatternStep[][]): mm.INoteSequence => {
    const noteSequence: mm.INoteSequence = {
      notes: [],
      totalTime: (sequencerLength / 4) * (60 / bpm), // Total time in seconds
      ticksPerQuarter: 220,
      quantizationInfo: {
        stepsPerQuarter: 4
      }
    };

    // Map drum pads to MIDI drum notes (General MIDI drum kit)
    const drumMap = [
      36, // Kick
      38, // Snare
      42, // Hi-hat closed
      46, // Hi-hat open
      49, // Crash
      50, // Ride
      41, // Low tom
      43, // Mid tom
      45, // High tom
      47, // Mid tom 2
      48, // High tom 2
      51, // Ride bell
      52, // Chinese cymbal
      53, // Ride bell 2
      54, // Tambourine
      55  // Splash cymbal
    ];

    pattern.forEach((track, trackIndex) => {
      if (selectedTracks.includes(trackIndex)) {
        track.forEach((step, stepIndex) => {
          if (step.active && stepIndex < sequencerLength) {
            noteSequence.notes!.push({
              pitch: drumMap[trackIndex] || 36,
              quantizedStartStep: stepIndex,
              quantizedEndStep: stepIndex + 1,
              velocity: step.velocity
            });
          }
        });
      }
    });

    return noteSequence;
  };

  const convertNoteSequenceToPattern = (noteSequence: mm.INoteSequence): PatternStep[][] => {
    const newPattern: PatternStep[][] = Array(16).fill(null).map(() => 
      Array(64).fill(null).map(() => ({ active: false, velocity: 80 }))
    );

    // Reverse drum map
    const reverseDrumMap: { [key: number]: number } = {
      36: 0, 38: 1, 42: 2, 46: 3, 49: 4, 50: 5,
      41: 6, 43: 7, 45: 8, 47: 9, 48: 10, 51: 11,
      52: 12, 53: 13, 54: 14, 55: 15
    };

    noteSequence.notes?.forEach(note => {
      const trackIndex = reverseDrumMap[note.pitch!] ?? null;
      if (trackIndex !== null && trackIndex < 16) {
        // Use quantized step if available, otherwise calculate from time
        const stepIndex = note.quantizedStartStep !== undefined 
          ? note.quantizedStartStep 
          : Math.floor((note.startTime! / (60 / bpm)) * 4);
        
        if (stepIndex < sequencerLength) {
          newPattern[trackIndex][stepIndex] = {
            active: true,
            velocity: note.velocity || 80
          };
        }
      }
    });

    return newPattern;
  };

  const generatePattern = async () => {
    setIsGenerating(true);
    try {
      const musicRNN = await initializeMusicRNN();
      
      let seedSequence: mm.INoteSequence | undefined;
      
      if (generationType !== 'new') {
        seedSequence = convertPatternToNoteSequence(patterns);
        console.log('Seed sequence created:', seedSequence);
      }

      const baseSequence = seedSequence || {
        notes: [],
        totalTime: 0,
        ticksPerQuarter: 220,
        quantizationInfo: {
          stepsPerQuarter: 4
        }
      };

      console.log('Calling continueSequence with:', { baseSequence, steps: stepsToGenerate[0], temp: temperature[0] });

      const generatedSequence = await musicRNN.continueSequence(
        baseSequence,
        stepsToGenerate[0],
        temperature[0]
      );

      console.log('Generated sequence:', generatedSequence);
      const newPattern = convertNoteSequenceToPattern(generatedSequence);
      console.log('Converted pattern:', newPattern);
      
      if (generationType === 'fill') {
        // Combine with existing pattern
        const combinedPattern = patterns.map((track, trackIndex) => 
          track.map((step, stepIndex) => {
            if (selectedTracks.includes(trackIndex) && newPattern[trackIndex][stepIndex].active) {
              return newPattern[trackIndex][stepIndex];
            }
            return step;
          })
        );
        console.log('Applying combined pattern:', combinedPattern);
        onPatternGenerated(combinedPattern);
      } else {
        console.log('Applying new pattern:', newPattern);
        onPatternGenerated(newPattern);
      }

      toast.success(`Generated ${generationType} pattern!`);
      
    } catch (error) {
      console.error('Pattern generation failed:', error);
      toast.error('Failed to generate pattern');
    } finally {
      setIsGenerating(false);
    }
  };

  const toggleTrackSelection = (trackIndex: number) => {
    setSelectedTracks(prev => 
      prev.includes(trackIndex) 
        ? prev.filter(t => t !== trackIndex)
        : [...prev, trackIndex]
    );
  };

  const presets = [
    { name: 'Creative', temp: 1.2, type: 'new' as const },
    { name: 'Balanced', temp: 1.0, type: 'variation' as const },
    { name: 'Conservative', temp: 0.8, type: 'continue' as const },
    { name: 'Wild', temp: 1.5, type: 'new' as const },
  ];

  return (
    <Card className="w-full bg-gradient-to-br from-purple-900/20 to-pink-900/20 backdrop-blur-md border-purple-500/30 shadow-2xl">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-3 text-2xl">
          <div className="p-2 rounded-lg bg-gradient-to-r from-purple-500 to-pink-500">
            <Brain className="w-6 h-6 text-white" />
          </div>
          <span className="bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
            Neural Drum Generator
          </span>
          <Badge variant="secondary" className="ml-auto animate-pulse">
            <Sparkles className="w-3 h-3 mr-1" />
            AI-Powered
          </Badge>
        </CardTitle>
        <CardDescription className="text-purple-200">
          Generate drum patterns using Google Magenta's AI models
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {/* Quick Presets */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-purple-300">Quick Presets</label>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {presets.map(preset => (
              <Button
                key={preset.name}
                variant="outline"
                size="sm"
                onClick={() => {
                  setTemperature([preset.temp]);
                  setGenerationType(preset.type);
                }}
                className="border-purple-500/30 hover:bg-purple-500/20 text-purple-200"
              >
                {preset.name}
              </Button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Generation Type */}
          <div className="space-y-3">
            <label className="text-sm font-medium text-purple-300">Generation Mode</label>
            <Select value={generationType} onValueChange={(value: any) => setGenerationType(value)}>
              <SelectTrigger className="bg-purple-950/30 border-purple-500/30">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="new">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4" />
                    New Pattern
                  </div>
                </SelectItem>
                <SelectItem value="continue">
                  <div className="flex items-center gap-2">
                    <Music className="w-4 h-4" />
                    Continue Current
                  </div>
                </SelectItem>
                <SelectItem value="variation">
                  <div className="flex items-center gap-2">
                    <Shuffle className="w-4 h-4" />
                    Create Variation
                  </div>
                </SelectItem>
                <SelectItem value="fill">
                  <div className="flex items-center gap-2">
                    <Wand2 className="w-4 h-4" />
                    Fill Gaps
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Steps to Generate */}
          <div className="space-y-3">
            <label className="text-sm font-medium text-purple-300">
              Pattern Length: {stepsToGenerate[0]} steps
            </label>
            <Slider
              value={stepsToGenerate}
              onValueChange={setStepsToGenerate}
              min={4}
              max={32}
              step={4}
              className="w-full"
            />
          </div>
        </div>

        {/* Creativity Temperature */}
        <div className="space-y-3">
          <label className="text-sm font-medium text-purple-300">
            Creativity Level: {temperature[0].toFixed(1)}
            <span className="text-xs text-purple-400 ml-2">
              (Lower = More Predictable, Higher = More Creative)
            </span>
          </label>
          <Slider
            value={temperature}
            onValueChange={setTemperature}
            min={0.5}
            max={2.0}
            step={0.1}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-purple-400">
            <span>Conservative</span>
            <span>Balanced</span>
            <span>Creative</span>
            <span>Wild</span>
          </div>
        </div>

        {/* Track Selection */}
        <div className="space-y-3">
          <label className="text-sm font-medium text-purple-300">
            Tracks to Generate ({selectedTracks.length} selected)
          </label>
          <div className="grid grid-cols-4 gap-1">
            {Array.from({ length: 16 }, (_, i) => (
              <Button
                key={i}
                variant={selectedTracks.includes(i) ? "default" : "outline"}
                size="sm"
                onClick={() => toggleTrackSelection(i)}
                className={`h-8 text-xs ${
                  selectedTracks.includes(i)
                    ? 'bg-purple-600 border-purple-500'
                    : 'border-purple-500/30 hover:bg-purple-500/20'
                }`}
              >
                {i + 1}
              </Button>
            ))}
          </div>
        </div>

        {/* Generate Button */}
        <Button
          onClick={generatePattern}
          disabled={isGenerating || selectedTracks.length === 0}
          className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-medium py-3"
        >
          {isGenerating ? (
            <>
              <div className="animate-spin w-4 h-4 mr-2 border-2 border-white border-t-transparent rounded-full" />
              Generating...
            </>
          ) : (
            <>
              <Zap className="w-4 h-4 mr-2" />
              Generate Pattern
            </>
          )}
        </Button>

        <div className="text-xs text-purple-400 space-y-1 bg-purple-950/20 p-3 rounded-lg">
          <p>• <strong>New Pattern:</strong> Generate completely new rhythms</p>
          <p>• <strong>Continue Current:</strong> Extend the existing pattern</p>
          <p>• <strong>Create Variation:</strong> Generate variations of current pattern</p>
          <p>• <strong>Fill Gaps:</strong> Add elements to empty parts of the pattern</p>
        </div>
      </CardContent>
    </Card>
  );
};