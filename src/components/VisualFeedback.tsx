import { useEffect, useState } from 'react';

interface VisualFeedbackProps {
  isPlaying: boolean;
  currentStep: number;
  bpm: number;
  sequencerLength: number;
  patterns: Array<Array<{ active: boolean; velocity: number }>>;
}

export const VisualFeedback = ({ 
  isPlaying, 
  currentStep, 
  bpm, 
  sequencerLength, 
  patterns 
}: VisualFeedbackProps) => {
  const [beatPulse, setBeatPulse] = useState(false);
  const [stepIndicators, setStepIndicators] = useState<boolean[]>(new Array(16).fill(false));

  // Beat pulse animation
  useEffect(() => {
    if (!isPlaying) return;

    const stepTime = 60 / bpm / 4 * 1000; // ms per 16th note
    const interval = setInterval(() => {
      setBeatPulse(true);
      setTimeout(() => setBeatPulse(false), 100);
    }, stepTime);

    return () => clearInterval(interval);
  }, [isPlaying, bpm]);

  // Step indicators for active tracks
  useEffect(() => {
    if (currentStep >= 0) {
      const activeTrackIndicators = patterns.map((pattern) => 
        pattern[currentStep]?.active || false
      );
      setStepIndicators(activeTrackIndicators);
    }
  }, [currentStep, patterns]);

  return (
    <div className="fixed top-4 left-4 z-50 pointer-events-none">
      {/* Beat Pulse Indicator */}
      <div className={`
        w-6 h-6 rounded-full border-2 border-green-400 mb-2 transition-all duration-100
        ${beatPulse && isPlaying ? 'bg-green-400 shadow-lg shadow-green-400/50 scale-125' : 'bg-transparent'}
      `} />
      
      {/* Step Position Indicator */}
      <div className="bg-gray-900/80 backdrop-blur-md rounded-lg p-2 border border-cyan-500/30">
        <div className="text-xs text-cyan-300 mb-1">STEP</div>
        <div className="text-lg font-bold text-white">
          {isPlaying ? (currentStep + 1).toString().padStart(2, '0') : '--'}
        </div>
      </div>

      {/* Active Track Indicators */}
      <div className="mt-2 grid grid-cols-4 gap-1">
        {stepIndicators.map((active, index) => (
          <div
            key={index}
            className={`
              w-3 h-3 rounded-sm transition-all duration-150
              ${active && isPlaying 
                ? 'bg-cyan-400 shadow-sm shadow-cyan-400/50' 
                : 'bg-gray-600/50'
              }
            `}
          />
        ))}
      </div>
    </div>
  );
};

// Waveform visualization component for real-time feedback
interface WaveformVisualizerProps {
  isPlaying: boolean;
  className?: string;
}

export const WaveformVisualizer = ({ isPlaying, className = "" }: WaveformVisualizerProps) => {
  const [bars, setBars] = useState<number[]>(new Array(32).fill(0));

  useEffect(() => {
    if (!isPlaying) {
      setBars(new Array(32).fill(0));
      return;
    }

    const interval = setInterval(() => {
      setBars(prev => prev.map(() => Math.random() * 100));
    }, 50);

    return () => clearInterval(interval);
  }, [isPlaying]);

  return (
    <div className={`flex items-end gap-1 h-16 ${className}`}>
      {bars.map((height, index) => (
        <div
          key={index}
          className="bg-gradient-to-t from-cyan-500 to-purple-500 w-2 rounded-t transition-all duration-75"
          style={{ height: `${height}%` }}
        />
      ))}
    </div>
  );
};

// Pad glow effect for visual feedback
interface PadGlowProps {
  isActive: boolean;
  color?: string;
  children: React.ReactNode;
}

export const PadGlow = ({ isActive, color = "cyan", children }: PadGlowProps) => {
  return (
    <div className={`
      relative transition-all duration-200
      ${isActive ? `shadow-lg shadow-${color}-500/50 scale-105` : ''}
    `}>
      {isActive && (
        <div className={`
          absolute inset-0 rounded-lg
          bg-gradient-to-br from-${color}-400/20 to-${color}-600/20
          animate-pulse
        `} />
      )}
      {children}
    </div>
  );
};