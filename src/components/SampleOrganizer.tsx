import { useState, useMemo } from 'react';
import { Folder, Tag, Search, Filter, X, FolderOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';

interface Sample {
  buffer: AudioBuffer | null;
  name: string;
  startTime: number;
  endTime: number;
  gateMode: boolean;
  pitch: number;
  reverse: boolean;
  volume: number;
  category?: string;
  tags?: string[];
}

interface SampleOrganizerProps {
  samples: Sample[];
  onSampleSelect: (sample: Sample, padIndex: number) => void;
  selectedPad: number | null;
}

const defaultCategories = [
  'Kicks', 'Snares', 'Hi-Hats', 'Percussion', 'Bass', 'Synths', 
  'FX', 'Vocals', 'Leads', 'Pads', 'Arps', 'Loops', 'One-shots'
];

const sampleTags = [
  'punchy', 'deep', 'crisp', 'warm', 'analog', 'digital', 'vintage', 'modern',
  'dirty', 'clean', 'distorted', 'reverb', 'delay', 'filtered', 'compressed',
  'melodic', 'rhythmic', 'ambient', 'aggressive', 'soft', 'hard', 'bouncy'
];

export const SampleOrganizer = ({ samples, onSampleSelect, selectedPad }: SampleOrganizerProps) => {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  
  // Filter samples based on search and filters
  const filteredSamples = useMemo(() => {
    return samples.filter(sample => {
      if (!sample.buffer) return false;
      
      // Search term filter
      const matchesSearch = sample.name.toLowerCase().includes(searchTerm.toLowerCase());
      
      // Category filter
      const matchesCategory = selectedCategory === 'all' || 
        sample.category === selectedCategory ||
        (!sample.category && selectedCategory === 'uncategorized');
      
      // Tags filter
      const matchesTags = selectedTags.length === 0 || 
        selectedTags.every(tag => sample.tags?.includes(tag));
      
      return matchesSearch && matchesCategory && matchesTags;
    });
  }, [samples, searchTerm, selectedCategory, selectedTags]);

  // Group samples by category
  const groupedSamples = useMemo(() => {
    const groups: Record<string, Sample[]> = {};
    
    filteredSamples.forEach(sample => {
      const category = sample.category || 'Uncategorized';
      if (!groups[category]) {
        groups[category] = [];
      }
      groups[category].push(sample);
    });
    
    return groups;
  }, [filteredSamples]);

  const toggleTag = (tag: string) => {
    setSelectedTags(prev => 
      prev.includes(tag) 
        ? prev.filter(t => t !== tag)
        : [...prev, tag]
    );
  };

  const clearFilters = () => {
    setSearchTerm('');
    setSelectedCategory('all');
    setSelectedTags([]);
  };

  const handleSampleSelect = (sample: Sample) => {
    if (selectedPad !== null) {
      onSampleSelect(sample, selectedPad);
      setOpen(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button 
          variant="outline" 
          size="sm" 
          className="bg-gray-800 border-gray-600 text-gray-300 text-xs hover:bg-purple-800/20 hover:border-purple-400 neon-border"
          disabled={selectedPad === null}
        >
          <FolderOpen className="w-3 h-3 mr-1" />
          LIBRARY
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-6xl max-h-[80vh] glass-panel animate-scale-in">
        <DialogHeader>
          <DialogTitle className="text-center text-shadow-glow">
            Sample Library
            {selectedPad !== null && (
              <span className="text-sm text-muted-foreground ml-2">
                (Loading to Pad {selectedPad + 1})
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        {/* Search and Filters */}
        <div className="space-y-4">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <Input
                placeholder="Search samples..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger className="w-48">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                <SelectItem value="uncategorized">Uncategorized</SelectItem>
                <Separator />
                {defaultCategories.map(category => (
                  <SelectItem key={category} value={category}>
                    {category}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {(searchTerm || selectedCategory !== 'all' || selectedTags.length > 0) && (
              <Button variant="outline" size="sm" onClick={clearFilters}>
                <X className="w-4 h-4" />
              </Button>
            )}
          </div>

          {/* Tags Filter */}
          <div className="space-y-2">
            <p className="text-sm font-medium">Filter by tags:</p>
            <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
              {sampleTags.map(tag => (
                <Badge
                  key={tag}
                  variant={selectedTags.includes(tag) ? "default" : "outline"}
                  className="cursor-pointer text-xs transition-colors hover:bg-primary/20"
                  onClick={() => toggleTag(tag)}
                >
                  <Tag className="w-3 h-3 mr-1" />
                  {tag}
                </Badge>
              ))}
            </div>
          </div>
        </div>

        <Separator />

        {/* Sample Grid */}
        <div className="flex-1 overflow-y-auto space-y-6">
          {Object.keys(groupedSamples).length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Folder className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No samples found matching your criteria</p>
              <p className="text-sm mt-2">Try adjusting your search or filters</p>
            </div>
          ) : (
            Object.entries(groupedSamples).map(([category, categorySamples]) => (
              <div key={category} className="space-y-3">
                <h3 className="font-semibold text-primary flex items-center gap-2 text-shadow-glow-pink">
                  <Folder className="w-4 h-4" />
                  {category} ({categorySamples.length})
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {categorySamples.map((sample, index) => (
                    <div
                      key={`${category}-${index}`}
                      className="p-3 rounded-md bg-card/50 border border-border/50 hover:bg-card/70 transition-all cursor-pointer neon-border group"
                      onClick={() => handleSampleSelect(sample)}
                    >
                      <h4 className="font-medium text-sm truncate group-hover:text-primary transition-colors">
                        {sample.name}
                      </h4>
                      <p className="text-xs text-muted-foreground mt-1">
                        {sample.buffer?.duration.toFixed(2)}s
                      </p>
                      {sample.tags && sample.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {sample.tags.slice(0, 3).map(tag => (
                            <Badge key={tag} variant="secondary" className="text-xs">
                              {tag}
                            </Badge>
                          ))}
                          {sample.tags.length > 3 && (
                            <Badge variant="secondary" className="text-xs">
                              +{sample.tags.length - 3}
                            </Badge>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="text-center text-sm text-muted-foreground">
          {selectedPad !== null 
            ? `Click a sample to load it into Pad ${selectedPad + 1}`
            : 'Select a pad first to load samples'
          }
        </div>
      </DialogContent>
    </Dialog>
  );
};