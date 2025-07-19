import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Play, Pause, Square, Plus, Trash2, ChevronUp, ChevronDown, Copy } from 'lucide-react';
import { toast } from 'sonner';

interface Pattern {
  name: string;
  steps: PatternStep[][];
  bpm: number;
  swing: number;
  length: number;
}

interface PatternStep {
  active: boolean;
  velocity: number;
}

interface Song {
  name: string;
  patterns: string[];
  currentPatternIndex: number;
}

interface SongModeProps {
  patterns: Pattern[];
  songs: Song[];
  currentSong: Song | null;
  isPlaying: boolean;
  isPatternChaining: boolean;
  onCreateSong: (song: Song) => void;
  onDeleteSong: (songIndex: number) => void;
  onSelectSong: (song: Song) => void;
  onPlaySong: () => void;
  onStopSong: () => void;
  onAddPatternToSong: (songIndex: number, patternName: string) => void;
  onRemovePatternFromSong: (songIndex: number, patternIndex: number) => void;
  onMovePattern: (songIndex: number, fromIndex: number, toIndex: number) => void;
}

export const SongMode = ({
  patterns,
  songs,
  currentSong,
  isPlaying,
  isPatternChaining,
  onCreateSong,
  onDeleteSong,
  onSelectSong,
  onPlaySong,
  onStopSong,
  onAddPatternToSong,
  onRemovePatternFromSong,
  onMovePattern
}: SongModeProps) => {
  const [newSongName, setNewSongName] = useState('');
  const [selectedPatternToAdd, setSelectedPatternToAdd] = useState<string>('');

  const handleCreateSong = () => {
    if (!newSongName.trim()) {
      toast.error('Please enter a song name');
      return;
    }
    
    const newSong: Song = {
      name: newSongName,
      patterns: [],
      currentPatternIndex: 0
    };
    
    onCreateSong(newSong);
    setNewSongName('');
    toast.success(`Created song "${newSongName}"`);
  };

  const handleAddPattern = (songIndex: number) => {
    if (!selectedPatternToAdd) {
      toast.error('Please select a pattern to add');
      return;
    }
    
    onAddPatternToSong(songIndex, selectedPatternToAdd);
    toast.success('Pattern added to song');
  };

  return (
    <div className="h-full overflow-auto p-4">
      <div className="space-y-6">
        {/* Header */}
        <div className="text-center">
          <h2 className="text-2xl font-bold text-cyan-300 mb-2">SONG MODE</h2>
          <p className="text-gray-400 text-sm">Chain patterns together to create songs</p>
        </div>

        {/* Create New Song */}
        <div className="bg-gray-800/50 rounded-lg p-4 border border-cyan-500/30">
          <h3 className="text-lg font-medium text-cyan-300 mb-3">Create New Song</h3>
          <div className="flex gap-2">
            <Input
              value={newSongName}
              onChange={(e) => setNewSongName(e.target.value)}
              placeholder="Enter song name..."
              className="flex-1 bg-gray-700 border-gray-600 text-white"
            />
            <Button 
              onClick={handleCreateSong}
              className="bg-cyan-600 hover:bg-cyan-700"
            >
              <Plus className="h-4 w-4 mr-1" />
              Create
            </Button>
          </div>
        </div>

        {/* Current Song Playback */}
        {currentSong && (
          <div className="bg-gray-800/50 rounded-lg p-4 border border-green-500/30">
            <h3 className="text-lg font-medium text-green-300 mb-3">Now Playing: {currentSong.name}</h3>
            <div className="flex items-center gap-4 mb-3">
              <Button
                onClick={isPlaying ? onStopSong : onPlaySong}
                variant={isPlaying ? "destructive" : "default"}
                className={isPlaying ? "bg-red-600 hover:bg-red-700" : "bg-green-600 hover:bg-green-700"}
              >
                {isPlaying ? <Square className="h-4 w-4 mr-1" /> : <Play className="h-4 w-4 mr-1" />}
                {isPlaying ? 'Stop' : 'Play Song'}
              </Button>
              
              <div className="text-sm text-gray-400">
                Pattern {currentSong.currentPatternIndex + 1} of {currentSong.patterns.length}
                {currentSong.patterns[currentSong.currentPatternIndex] && (
                  <span className="ml-2 text-cyan-400">
                    ({currentSong.patterns[currentSong.currentPatternIndex]})
                  </span>
                )}
              </div>
            </div>
            
            {/* Pattern Chain Progress */}
            <div className="grid grid-cols-8 gap-1">
              {currentSong.patterns.map((patternName, index) => (
                <div
                  key={index}
                  className={`h-8 rounded text-xs flex items-center justify-center transition-all ${
                    index === currentSong.currentPatternIndex
                      ? 'bg-green-500 text-white'
                      : index < currentSong.currentPatternIndex
                      ? 'bg-gray-600 text-gray-300'
                      : 'bg-gray-700 text-gray-400'
                  }`}
                >
                  {index + 1}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Songs List */}
        <div className="space-y-4">
          <h3 className="text-lg font-medium text-white">Songs ({songs.length})</h3>
          
          {songs.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <p>No songs created yet.</p>
              <p className="text-sm mt-1">Create your first song above!</p>
            </div>
          ) : (
            songs.map((song, songIndex) => (
              <div key={songIndex} className="bg-gray-800/30 rounded-lg p-4 border border-gray-600">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-lg font-medium text-white">{song.name}</h4>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => onSelectSong(song)}
                      variant="outline"
                      size="sm"
                      className={currentSong?.name === song.name ? "bg-cyan-600 border-cyan-500" : ""}
                    >
                      Select
                    </Button>
                    <Button
                      onClick={() => onDeleteSong(songIndex)}
                      variant="outline"
                      size="sm"
                      className="text-red-400 border-red-400 hover:bg-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* Add Pattern to Song */}
                <div className="flex gap-2 mb-3">
                  <Select value={selectedPatternToAdd} onValueChange={setSelectedPatternToAdd}>
                    <SelectTrigger className="flex-1 bg-gray-700 border-gray-600">
                      <SelectValue placeholder="Select pattern to add..." />
                    </SelectTrigger>
                    <SelectContent>
                      {patterns.map((pattern, index) => (
                        <SelectItem key={index} value={pattern.name}>
                          {pattern.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    onClick={() => handleAddPattern(songIndex)}
                    variant="outline"
                    size="sm"
                    className="bg-gray-700 border-gray-600"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>

                {/* Pattern Chain */}
                <div className="space-y-2">
                  <div className="text-sm text-gray-400">Pattern Chain ({song.patterns.length} patterns):</div>
                  {song.patterns.length === 0 ? (
                    <div className="text-center py-4 text-gray-500 text-sm">
                      No patterns in this song. Add some patterns above.
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {song.patterns.map((patternName, patternIndex) => (
                        <div key={patternIndex} className="flex items-center gap-2 bg-gray-700/50 rounded p-2">
                          <span className="text-xs text-gray-400 w-6">{patternIndex + 1}.</span>
                          <span className="flex-1 text-sm text-white">{patternName}</span>
                          
                          <div className="flex gap-1">
                            <Button
                              onClick={() => onMovePattern(songIndex, patternIndex, patternIndex - 1)}
                              disabled={patternIndex === 0}
                              variant="outline"
                              size="sm"
                              className="h-6 w-6 p-0"
                            >
                              <ChevronUp className="h-3 w-3" />
                            </Button>
                            <Button
                              onClick={() => onMovePattern(songIndex, patternIndex, patternIndex + 1)}
                              disabled={patternIndex === song.patterns.length - 1}
                              variant="outline"
                              size="sm"
                              className="h-6 w-6 p-0"
                            >
                              <ChevronDown className="h-3 w-3" />
                            </Button>
                            <Button
                              onClick={() => onRemovePatternFromSong(songIndex, patternIndex)}
                              variant="outline"
                              size="sm"
                              className="h-6 w-6 p-0 text-red-400 border-red-400"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};