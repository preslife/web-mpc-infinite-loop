import { useState } from 'react';
import { Keyboard, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';

const shortcuts = [
  { category: 'Transport', items: [
    { keys: ['Space'], description: 'Play/Pause' },
    { keys: ['Esc'], description: 'Stop' },
    { keys: ['Ctrl', 'R'], description: 'Toggle Record' },
  ]},
  { category: 'Pattern Control', items: [
    { keys: ['Ctrl', 'Shift', 'C'], description: 'Clear Pattern' },
    { keys: ['Alt', 'R'], description: 'Randomize Pattern' },
    { keys: ['Alt', 'F'], description: 'Fill Pattern' },
  ]},
  { category: 'BPM & Volume', items: [
    { keys: ['Shift', '↑'], description: 'Increase BPM' },
    { keys: ['Shift', '↓'], description: 'Decrease BPM' },
    { keys: ['Alt', '↑'], description: 'Master Volume Up' },
    { keys: ['Alt', '↓'], description: 'Master Volume Down' },
  ]},
  { category: 'Pads (Row 1)', items: [
    { keys: ['Q'], description: 'Pad 1' },
    { keys: ['W'], description: 'Pad 2' },
    { keys: ['E'], description: 'Pad 3' },
    { keys: ['R'], description: 'Pad 4' },
  ]},
  { category: 'Pads (Row 2)', items: [
    { keys: ['A'], description: 'Pad 5' },
    { keys: ['S'], description: 'Pad 6' },
    { keys: ['D'], description: 'Pad 7' },
    { keys: ['F'], description: 'Pad 8' },
  ]},
  { category: 'Pads (Row 3)', items: [
    { keys: ['Z'], description: 'Pad 9' },
    { keys: ['X'], description: 'Pad 10' },
    { keys: ['C'], description: 'Pad 11' },
    { keys: ['V'], description: 'Pad 12' },
  ]},
  { category: 'Pads (Row 4)', items: [
    { keys: ['T'], description: 'Pad 13' },
    { keys: ['G'], description: 'Pad 14' },
    { keys: ['B'], description: 'Pad 15' },
    { keys: ['H'], description: 'Pad 16' },
  ]},
  { category: 'Steps', items: [
    { keys: ['Alt', '1-9'], description: 'Toggle Steps 1-9' },
    { keys: ['Alt', '0'], description: 'Toggle Step 10' },
  ]}
];

export const KeyboardShortcutsHelp = () => {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button 
          variant="outline" 
          size="sm" 
          className="bg-gray-800 border-gray-600 text-gray-300 text-xs hover:bg-purple-800/20 hover:border-purple-400 neon-border"
        >
          <Keyboard className="w-3 h-3 mr-1" />
          SHORTCUTS
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto glass-panel animate-scale-in">
        <DialogHeader>
          <DialogTitle className="text-center text-shadow-glow">
            Keyboard Shortcuts
          </DialogTitle>
        </DialogHeader>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {shortcuts.map((category) => (
            <div key={category.category} className="space-y-3">
              <h3 className="font-semibold text-primary text-shadow-glow-pink">
                {category.category}
              </h3>
              <div className="space-y-2">
                {category.items.map((shortcut, index) => (
                  <div 
                    key={index} 
                    className="flex items-center justify-between p-2 rounded-md bg-card/50 border border-border/50 hover:bg-card/70 transition-colors"
                  >
                    <span className="text-sm text-muted-foreground">
                      {shortcut.description}
                    </span>
                    <div className="flex gap-1">
                      {shortcut.keys.map((key, keyIndex) => (
                        <Badge 
                          key={keyIndex} 
                          variant="secondary" 
                          className="text-xs font-mono px-2 py-1 bg-secondary/80"
                        >
                          {key}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        
        <div className="mt-6 p-4 bg-muted/50 rounded-md border border-border/50">
          <p className="text-sm text-muted-foreground text-center">
            <strong>Pro Tip:</strong> Shortcuts work when not typing in text fields. 
            Use these shortcuts to control your drum machine without reaching for the mouse!
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};