import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Play, Download, Folder, Music, Zap, Waves, Drum } from 'lucide-react';
import { toast } from 'sonner';

interface DrumKit {
  id: string;
  name: string;
  description: string;
  category: string;
  samples: Array<{
    name: string;
    url: string;
    type: 'kick' | 'snare' | 'hihat' | 'openhat' | 'crash' | 'perc' | 'other';
  }>;
  patterns?: Array<{
    name: string;
    steps: boolean[][];
    bpm: number;
  }>;
}

const DRUM_KITS: DrumKit[] = [
  {
    id: 'default-kit',
    name: 'Default Kit',
    description: 'Basic drum kit with kick, snare, and hi-hat',
    category: 'electronic',
    samples: [
      { name: 'Kick', url: './samples/kick.wav', type: 'kick' },
      { name: 'Snare', url: './samples/snare.wav', type: 'snare' },
      { name: 'Hi-Hat', url: './samples/hihat.wav', type: 'hihat' },
    ],
    patterns: [
      {
        name: 'Basic Beat',
        bpm: 120,
        steps: [
          [true, false, false, false, true, false, false, false, true, false, false, false, true, false, false, false], // Kick
          [false, false, false, false, true, false, false, false, false, false, false, false, true, false, false, false], // Snare
          [true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false], // Hi-hat
        ]
      }
    ]
  },
  {
    id: '808-classic',
    name: '808 Classic',
    description: 'Classic TR-808 drum machine sounds (Preview Only)',
    category: 'electronic',
    samples: [
      { name: 'BD_808', url: './samples/kick.wav', type: 'kick' },
      { name: 'SD_808', url: './samples/snare.wav', type: 'snare' },
      { name: 'HH_808', url: './samples/hihat.wav', type: 'hihat' },
      { name: 'OH_808', url: './samples/hihat.wav', type: 'openhat' },
      { name: 'CP_808', url: './samples/snare.wav', type: 'perc' },
      { name: 'CY_808', url: './samples/hihat.wav', type: 'crash' },
      { name: 'CB_808', url: './samples/kick.wav', type: 'perc' },
      { name: 'MA_808', url: './samples/hihat.wav', type: 'perc' },
    ],
    patterns: [
      {
        name: 'Basic 808',
        bpm: 120,
        steps: [
          [true, false, false, false, true, false, false, false, true, false, false, false, true, false, false, false], // Kick
          [false, false, false, false, true, false, false, false, false, false, false, false, true, false, false, false], // Snare
          [true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false], // Hi-hat
        ]
      }
    ]
  },
  {
    id: 'trap-modern',
    name: 'Trap Modern',
    description: 'Hard-hitting trap drums (Using default samples)',
    category: 'hip-hop',
    samples: [
      { name: 'Trap_Kick', url: './samples/kick.wav', type: 'kick' },
      { name: 'Trap_Snare', url: './samples/snare.wav', type: 'snare' },
      { name: 'Trap_HH', url: './samples/hihat.wav', type: 'hihat' },
      { name: 'Trap_OH', url: './samples/hihat.wav', type: 'openhat' },
      { name: 'Trap_Perc1', url: './samples/snare.wav', type: 'perc' },
      { name: 'Trap_Perc2', url: './samples/kick.wav', type: 'perc' },
      { name: 'Trap_Crash', url: './samples/hihat.wav', type: 'crash' },
      { name: 'Trap_Rim', url: './samples/snare.wav', type: 'perc' },
    ]
  },
  {
    id: 'house-classic',
    name: 'House Classic',
    description: 'Classic house music drums (Using default samples)',
    category: 'electronic',
    samples: [
      { name: 'House_Kick', url: './samples/kick.wav', type: 'kick' },
      { name: 'House_Snare', url: './samples/snare.wav', type: 'snare' },
      { name: 'House_HH_C', url: './samples/hihat.wav', type: 'hihat' },
      { name: 'House_HH_O', url: './samples/hihat.wav', type: 'openhat' },
      { name: 'House_Perc', url: './samples/snare.wav', type: 'perc' },
      { name: 'House_Clap', url: './samples/snare.wav', type: 'perc' },
      { name: 'House_Crash', url: './samples/hihat.wav', type: 'crash' },
      { name: 'House_Ride', url: './samples/hihat.wav', type: 'perc' },
    ]
  }
];

const CATEGORIES = [
  { id: 'all', name: 'All Kits', icon: Folder },
  { id: 'electronic', name: 'Electronic', icon: Zap },
  { id: 'hip-hop', name: 'Hip Hop', icon: Music },
  { id: 'acoustic', name: 'Acoustic', icon: Drum },
  { id: 'experimental', name: 'Experimental', icon: Waves },
];

interface SampleLibraryProps {
  onLoadKit: (kit: DrumKit) => void;
  onLoadSample: (sample: { name: string; url: string; type: string }, padIndex: number) => void;
}

export const SampleLibrary = ({ onLoadKit, onLoadSample }: SampleLibraryProps) => {
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedKit, setSelectedKit] = useState<DrumKit | null>(null);
  const [hoveredSample, setHoveredSample] = useState<string | null>(null);

  const filteredKits = selectedCategory === 'all' 
    ? DRUM_KITS 
    : DRUM_KITS.filter(kit => kit.category === selectedCategory);

  const playPreview = async (url: string) => {
    try {
      // Create audio context for preview
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const response = await fetch(url);
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      
      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContext.destination);
      source.start();
      
      setTimeout(() => {
        audioContext.close();
      }, 2000);
    } catch (error) {
      console.warn('Preview failed:', error);
      toast.error('Preview not available');
    }
  };

  const loadFullKit = (kit: DrumKit) => {
    onLoadKit(kit);
    toast.success(`Loaded ${kit.name} drum kit!`);
  };

  const getSampleTypeColor = (type: string) => {
    const colors = {
      kick: 'bg-red-600',
      snare: 'bg-blue-600', 
      hihat: 'bg-yellow-600',
      openhat: 'bg-orange-600',
      crash: 'bg-purple-600',
      perc: 'bg-green-600',
      other: 'bg-gray-600'
    };
    return colors[type as keyof typeof colors] || 'bg-gray-600';
  };

  return (
    <div className="h-full bg-background">
      <div className="p-6">
        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-2">Sample Library</h1>
          <p className="text-muted-foreground">Professional drum kits and samples for your beats</p>
        </div>

        <Tabs value={selectedCategory} onValueChange={setSelectedCategory} className="w-full">
          <TabsList className="grid w-full grid-cols-5 mb-6">
            {CATEGORIES.map(category => {
              const Icon = category.icon;
              return (
                <TabsTrigger key={category.id} value={category.id} className="flex items-center gap-2">
                  <Icon className="w-4 h-4" />
                  {category.name}
                </TabsTrigger>
              );
            })}
          </TabsList>

          {CATEGORIES.map(category => (
            <TabsContent key={category.id} value={category.id}>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredKits.map(kit => (
                  <Card key={kit.id} className="hover:shadow-lg transition-shadow">
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-lg">{kit.name}</CardTitle>
                        <Badge variant="secondary">{kit.category}</Badge>
                      </div>
                      <CardDescription>{kit.description}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-2">
                          {kit.samples.slice(0, 8).map((sample, index) => (
                            <Button
                              key={`${kit.id}-${index}`}
                              variant="ghost"
                              size="sm"
                              className={`justify-start text-xs p-2 h-8 transition-colors ${
                                hoveredSample === `${kit.id}-${index}` ? 'bg-primary/10' : ''
                              }`}
                              onMouseEnter={() => setHoveredSample(`${kit.id}-${index}`)}
                              onMouseLeave={() => setHoveredSample(null)}
                              onClick={() => playPreview(sample.url)}
                            >
                              <div className={`w-2 h-2 rounded-full mr-2 ${getSampleTypeColor(sample.type)}`} />
                              <span className="truncate">{sample.name}</span>
                              <Play className="w-3 h-3 ml-auto opacity-60" />
                            </Button>
                          ))}
                        </div>
                        
                        <div className="flex gap-2">
                          <Button 
                            onClick={() => loadFullKit(kit)}
                            className="flex-1"
                            size="sm"
                          >
                            <Download className="w-4 h-4 mr-2" />
                            Load Kit
                          </Button>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => setSelectedKit(kit)}
                          >
                            <Folder className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </div>

      {/* Sample Detail Modal/Sidebar */}
      {selectedKit && (
        <div className="fixed inset-y-0 right-0 w-80 bg-background border-l shadow-lg z-50">
          <div className="p-4 border-b">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">{selectedKit.name}</h3>
              <Button variant="ghost" size="sm" onClick={() => setSelectedKit(null)}>
                ×
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">{selectedKit.description}</p>
          </div>
          
          <ScrollArea className="h-[calc(100vh-120px)]">
            <div className="p-4 space-y-4">
              <Button onClick={() => loadFullKit(selectedKit)} className="w-full">
                <Download className="w-4 h-4 mr-2" />
                Load Full Kit
              </Button>
              
              <div className="space-y-2">
                <h4 className="font-medium">Individual Samples</h4>
                {selectedKit.samples.map((sample, index) => (
                  <div key={index} className="flex items-center gap-2 p-2 rounded-lg hover:bg-accent">
                    <div className={`w-3 h-3 rounded-full ${getSampleTypeColor(sample.type)}`} />
                    <span className="flex-1 text-sm">{sample.name}</span>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => playPreview(sample.url)}
                    >
                      <Play className="w-3 h-3" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => onLoadSample(sample, index)}
                    >
                      <Download className="w-3 h-3" />
                    </Button>
                  </div>
                ))}
              </div>

              {selectedKit.patterns && (
                <div className="space-y-2">
                  <h4 className="font-medium">Preset Patterns</h4>
                  {selectedKit.patterns.map((pattern, index) => (
                    <div key={index} className="p-2 rounded-lg border">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{pattern.name}</span>
                        <Badge variant="outline">{pattern.bpm} BPM</Badge>
                      </div>
                      <Button variant="ghost" size="sm" className="w-full mt-2">
                        Load Pattern
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
      )}
    </div>
  );
};