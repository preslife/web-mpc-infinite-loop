import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Save, FolderOpen, Trash2, Play, Copy, Music, Clock, User } from 'lucide-react';
import { toast } from 'sonner';

interface PatternStep {
  active: boolean;
  velocity: number;
}

interface Pattern {
  id: string;
  name: string;
  description: string;
  steps: PatternStep[][];
  bpm: number;
  swing: number;
  genre: string;
  author: string;
  createdAt: string;
  trackCount: number;
}

interface PatternManagerProps {
  currentPattern: PatternStep[][];
  currentBpm: number;
  currentSwing: number;
  onLoadPattern: (pattern: Pattern) => void;
  onSavePattern: (name: string, description: string, genre: string) => void;
}

const PRESET_PATTERNS: Pattern[] = [
  {
    id: 'basic-house',
    name: 'Basic House',
    description: 'Classic four-on-the-floor house pattern',
    genre: 'House',
    author: 'X Beat Studio',
    createdAt: '2024-01-01',
    bpm: 128,
    swing: 0,
    trackCount: 4,
    steps: [
      // Kick - every beat
      [true, false, false, false, true, false, false, false, true, false, false, false, true, false, false, false].map(active => ({ active, velocity: 100 })),
      // Snare - beats 2 and 4
      [false, false, false, false, true, false, false, false, false, false, false, false, true, false, false, false].map(active => ({ active, velocity: 90 })),
      // Hi-hat closed - 8th notes
      [true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false].map(active => ({ active, velocity: 70 })),
      // Hi-hat open - offbeats
      [false, false, false, true, false, false, false, true, false, false, false, true, false, false, false, true].map(active => ({ active, velocity: 60 })),
      ...Array(12).fill([]).map(() => Array(16).fill({ active: false, velocity: 80 }))
    ]
  },
  {
    id: 'trap-beat',
    name: 'Trap Beat',
    description: 'Modern trap pattern with rolling hi-hats',
    genre: 'Hip Hop',
    author: 'X Beat Studio',
    createdAt: '2024-01-01',
    bpm: 140,
    swing: 0.1,
    trackCount: 5,
    steps: [
      // Kick
      [true, false, false, false, false, false, true, false, false, false, false, false, true, false, false, false].map(active => ({ active, velocity: 110 })),
      // Snare
      [false, false, false, false, true, false, false, false, false, false, false, false, true, false, false, false].map(active => ({ active, velocity: 100 })),
      // Hi-hat - trap pattern
      [true, false, true, true, false, true, true, false, true, false, true, true, false, true, true, false].map(active => ({ active, velocity: 65 })),
      // Open hat
      [false, false, false, false, false, false, false, true, false, false, false, false, false, false, false, true].map(active => ({ active, velocity: 50 })),
      // Perc
      [false, false, true, false, false, false, false, false, false, false, true, false, false, false, false, false].map(active => ({ active, velocity: 80 })),
      ...Array(11).fill([]).map(() => Array(16).fill({ active: false, velocity: 80 }))
    ]
  },
  {
    id: 'techno-loop',
    name: 'Techno Loop',
    description: 'Driving techno rhythm',
    genre: 'Techno',
    author: 'X Beat Studio', 
    createdAt: '2024-01-01',
    bpm: 135,
    swing: 0,
    trackCount: 6,
    steps: [
      // Kick - 4/4
      [true, false, false, false, true, false, false, false, true, false, false, false, true, false, false, false].map(active => ({ active, velocity: 110 })),
      // Snare - backbeat with ghost
      [false, false, false, false, true, false, false, true, false, false, false, false, true, false, false, true].map(active => ({ active, velocity: active ? 95 : 40 })),
      // Hi-hat - 16th notes
      [true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true].map(active => ({ active, velocity: 55 })),
      // Perc 1
      [false, true, false, false, false, true, false, false, false, true, false, false, false, true, false, false].map(active => ({ active, velocity: 70 })),
      // Perc 2
      [false, false, true, false, false, false, true, false, false, false, true, false, false, false, true, false].map(active => ({ active, velocity: 60 })),
      // FX
      [false, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false].map(active => ({ active, velocity: 90 })),
      ...Array(10).fill([]).map(() => Array(16).fill({ active: false, velocity: 80 }))
    ]
  },
  {
    id: 'dnb-break',
    name: 'DnB Break',
    description: 'Amen break inspired drum & bass pattern',
    genre: 'DnB',
    author: 'X Beat Studio',
    createdAt: '2024-01-01',
    bpm: 174,
    swing: 0.05,
    trackCount: 4,
    steps: [
      // Kick
      [true, false, false, false, false, false, true, false, false, true, false, false, false, false, false, false].map(active => ({ active, velocity: 110 })),
      // Snare - complex break
      [false, false, false, false, true, false, true, false, false, false, true, false, true, false, false, false].map(active => ({ active, velocity: 100 })),
      // Hi-hat
      [false, true, false, true, false, true, false, true, false, true, false, true, false, true, false, true].map(active => ({ active, velocity: 60 })),
      // Perc/Break element
      [false, false, true, false, false, false, false, true, false, false, false, true, false, false, true, false].map(active => ({ active, velocity: 80 })),
      ...Array(12).fill([]).map(() => Array(16).fill({ active: false, velocity: 80 }))
    ]
  }
];

export const PatternManager = ({ 
  currentPattern, 
  currentBpm, 
  currentSwing, 
  onLoadPattern, 
  onSavePattern 
}: PatternManagerProps) => {
  const [savedPatterns, setSavedPatterns] = useState<Pattern[]>(() => {
    const stored = localStorage.getItem('savedPatterns');
    return stored ? JSON.parse(stored) : [];
  });
  
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [loadDialogOpen, setLoadDialogOpen] = useState(false);
  const [patternName, setPatternName] = useState('');
  const [patternDescription, setPatternDescription] = useState('');
  const [patternGenre, setPatternGenre] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<'user' | 'presets'>('presets');

  const allPatterns = selectedCategory === 'presets' ? PRESET_PATTERNS : savedPatterns;

  const handleSavePattern = () => {
    if (!patternName.trim()) {
      toast.error('Please enter a pattern name');
      return;
    }

    const newPattern: Pattern = {
      id: Date.now().toString(),
      name: patternName,
      description: patternDescription,
      steps: currentPattern,
      bpm: currentBpm,
      swing: currentSwing,
      genre: patternGenre || 'Custom',
      author: 'User',
      createdAt: new Date().toISOString().split('T')[0],
      trackCount: currentPattern.filter(track => track.some(step => step.active)).length
    };

    const updatedPatterns = [...savedPatterns, newPattern];
    setSavedPatterns(updatedPatterns);
    localStorage.setItem('savedPatterns', JSON.stringify(updatedPatterns));
    
    setSaveDialogOpen(false);
    setPatternName('');
    setPatternDescription('');
    setPatternGenre('');
    
    toast.success(`Pattern "${patternName}" saved successfully!`);
  };

  const handleLoadPattern = (pattern: Pattern) => {
    onLoadPattern(pattern);
    setLoadDialogOpen(false);
    toast.success(`Loaded pattern "${pattern.name}"`);
  };

  const handleDeletePattern = (patternId: string) => {
    const updatedPatterns = savedPatterns.filter(p => p.id !== patternId);
    setSavedPatterns(updatedPatterns);
    localStorage.setItem('savedPatterns', JSON.stringify(updatedPatterns));
    toast.success('Pattern deleted');
  };

  const handleDuplicatePattern = (pattern: Pattern) => {
    const duplicatedPattern: Pattern = {
      ...pattern,
      id: Date.now().toString(),
      name: `${pattern.name} (Copy)`,
      createdAt: new Date().toISOString().split('T')[0]
    };

    const updatedPatterns = [...savedPatterns, duplicatedPattern];
    setSavedPatterns(updatedPatterns);
    localStorage.setItem('savedPatterns', JSON.stringify(updatedPatterns));
    toast.success('Pattern duplicated');
  };

  const getGenreColor = (genre: string) => {
    const colors = {
      'House': 'bg-blue-600',
      'Hip Hop': 'bg-red-600',
      'Techno': 'bg-purple-600',
      'DnB': 'bg-green-600',
      'Custom': 'bg-gray-600'
    };
    return colors[genre as keyof typeof colors] || 'bg-gray-600';
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold text-white">Pattern Manager</h3>
        <div className="flex gap-2">
          <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="bg-green-600/20 border-green-500 text-green-300">
                <Save className="w-4 h-4 mr-2" />
                Save Pattern
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-gray-900 border-gray-700">
              <DialogHeader>
                <DialogTitle className="text-white">Save Pattern</DialogTitle>
                <DialogDescription>
                  Save your current pattern for later use
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-gray-300">Pattern Name</label>
                  <Input
                    value={patternName}
                    onChange={(e) => setPatternName(e.target.value)}
                    placeholder="Enter pattern name..."
                    className="bg-gray-800 border-gray-600 text-white"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-300">Description (optional)</label>
                  <Input
                    value={patternDescription}
                    onChange={(e) => setPatternDescription(e.target.value)}
                    placeholder="Describe your pattern..."
                    className="bg-gray-800 border-gray-600 text-white"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-300">Genre (optional)</label>
                  <Input
                    value={patternGenre}
                    onChange={(e) => setPatternGenre(e.target.value)}
                    placeholder="e.g., House, Hip Hop, Techno..."
                    className="bg-gray-800 border-gray-600 text-white"
                  />
                </div>
                <Button onClick={handleSavePattern} className="w-full">
                  Save Pattern
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={loadDialogOpen} onOpenChange={setLoadDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="bg-blue-600/20 border-blue-500 text-blue-300">
                <FolderOpen className="w-4 h-4 mr-2" />
                Load Pattern
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-gray-900 border-gray-700 max-w-2xl max-h-[80vh]">
              <DialogHeader>
                <DialogTitle className="text-white">Load Pattern</DialogTitle>
                <DialogDescription>
                  Choose a pattern to load into your sequencer
                </DialogDescription>
              </DialogHeader>
              
              <div className="flex gap-2 mb-4">
                <Button
                  variant={selectedCategory === 'presets' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedCategory('presets')}
                  className={selectedCategory === 'presets' ? 'bg-blue-600' : 'bg-gray-800 border-gray-600 text-gray-300'}
                >
                  <Music className="w-4 h-4 mr-2" />
                  Presets ({PRESET_PATTERNS.length})
                </Button>
                <Button
                  variant={selectedCategory === 'user' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedCategory('user')}
                  className={selectedCategory === 'user' ? 'bg-blue-600' : 'bg-gray-800 border-gray-600 text-gray-300'}
                >
                  <User className="w-4 h-4 mr-2" />
                  My Patterns ({savedPatterns.length})
                </Button>
              </div>

              <ScrollArea className="h-96">
                <div className="grid gap-3">
                  {allPatterns.length === 0 ? (
                    <div className="text-center py-8 text-gray-400">
                      {selectedCategory === 'user' ? 'No saved patterns yet' : 'No patterns available'}
                    </div>
                  ) : (
                    allPatterns.map((pattern) => (
                      <Card key={pattern.id} className="bg-gray-800 border-gray-700 hover:bg-gray-750 transition-colors">
                        <CardHeader className="pb-2">
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-white text-base">{pattern.name}</CardTitle>
                            <div className="flex items-center gap-2">
                              <Badge variant="secondary" className={`${getGenreColor(pattern.genre)} text-white`}>
                                {pattern.genre}
                              </Badge>
                              <Badge variant="outline" className="text-gray-300">
                                <Clock className="w-3 h-3 mr-1" />
                                {pattern.bpm} BPM
                              </Badge>
                            </div>
                          </div>
                          <CardDescription className="text-gray-400">
                            {pattern.description || 'No description'}
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="pt-0">
                          <div className="flex items-center justify-between">
                            <div className="text-xs text-gray-500">
                              {pattern.trackCount} tracks • {pattern.author} • {pattern.createdAt}
                            </div>
                            <div className="flex gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleLoadPattern(pattern)}
                                className="h-8 px-3 bg-blue-600/20 hover:bg-blue-600/30 text-blue-300"
                              >
                                <Play className="w-3 h-3 mr-1" />
                                Load
                              </Button>
                              {selectedCategory === 'user' && (
                                <>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleDuplicatePattern(pattern)}
                                    className="h-8 px-3 hover:bg-gray-700 text-gray-300"
                                  >
                                    <Copy className="w-3 h-3" />
                                  </Button>
                                  <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-8 px-3 hover:bg-red-600/20 text-red-400"
                                      >
                                        <Trash2 className="w-3 h-3" />
                                      </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent className="bg-gray-900 border-gray-700">
                                      <AlertDialogHeader>
                                        <AlertDialogTitle className="text-white">Delete Pattern</AlertDialogTitle>
                                        <AlertDialogDescription>
                                          Are you sure you want to delete "{pattern.name}"? This action cannot be undone.
                                        </AlertDialogDescription>
                                      </AlertDialogHeader>
                                      <AlertDialogFooter>
                                        <AlertDialogCancel className="bg-gray-800 border-gray-600 text-gray-300">Cancel</AlertDialogCancel>
                                        <AlertDialogAction
                                          onClick={() => handleDeletePattern(pattern.id)}
                                          className="bg-red-600 hover:bg-red-700"
                                        >
                                          Delete
                                        </AlertDialogAction>
                                      </AlertDialogFooter>
                                    </AlertDialogContent>
                                  </AlertDialog>
                                </>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))
                  )}
                </div>
              </ScrollArea>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </div>
  );
};