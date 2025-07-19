import { useState, useEffect, useRef } from 'react';

interface LogScale {
  minValue: number;
  maxValue: number;
  getRange(): number;
  linearToLogarithmic(linearValue: number): number;
  logarithmicToLinear(value: number): number;
}

class LogScaleClass implements LogScale {
  constructor(public minValue: number, public maxValue: number) {}

  getRange(): number {
    return this.maxValue - this.minValue;
  }

  linearToLogarithmic(linearValue: number): number {
    let value = Math.round(Math.pow(this.getRange() + 1, linearValue) + this.minValue - 1);
    
    if (value < this.minValue) {
      value = this.minValue;
    } else if (value > this.maxValue) {
      value = this.maxValue;
    }
    
    return value;
  }

  logarithmicToLinear(value: number): number {
    const normalizedValue = value - this.minValue + 1;
    
    if (normalizedValue <= 0) {
      return 0;
    } else if (value >= this.maxValue) {
      return 1;
    } else {
      return Math.log(normalizedValue) / Math.log(this.getRange() + 1);
    }
  }
}

interface FaderProps {
  value: number;
  onChange: (value: number) => void;
  label: string;
}

const Fader = ({ value, onChange, label }: FaderProps) => {
  const [faderTop, setFaderTop] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);
  const scale = new LogScaleClass(0, 100);

  const scalePositions = (() => {
    const intervals = 10;
    const increment = 1 / intervals;
    const positions = [];
    for (let i = 0; i <= 1; i += increment) {
      positions.push(scale.linearToLogarithmic(i));
    }
    return positions;
  })();

  useEffect(() => {
    const percentage = (1 - value) * 100;
    setFaderTop(percentage);
  }, [value]);

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    handleMouseMove(e);
  };

  const handleMouseMove = (e: React.MouseEvent | MouseEvent) => {
    if (!trackRef.current) return;
    
    const trackRect = trackRef.current.getBoundingClientRect();
    const relativeY = e.clientY - trackRect.top;
    const newFaderTop = Math.min(Math.max(relativeY, 0), trackRef.current.offsetHeight);
    const newValue = 1 - (newFaderTop / trackRef.current.offsetHeight);
    
    setFaderTop(newFaderTop);
    onChange(Math.max(0, Math.min(1, newValue)));
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  useEffect(() => {
    if (isDragging) {
      const handleGlobalMouseMove = (e: MouseEvent) => handleMouseMove(e);
      const handleGlobalMouseUp = () => handleMouseUp();
      
      document.addEventListener('mousemove', handleGlobalMouseMove);
      document.addEventListener('mouseup', handleGlobalMouseUp);
      
      return () => {
        document.removeEventListener('mousemove', handleGlobalMouseMove);
        document.removeEventListener('mouseup', handleGlobalMouseUp);
      };
    }
  }, [isDragging]);

  return (
    <div className="fader">
      <div ref={trackRef} className="fader-track">
        {scalePositions.map((position, index) => (
          <div
            key={index}
            className="scale-tick"
            style={{ top: `${(1 - position / 100) * 100}%` }}
          />
        ))}
      </div>
      <div
        className="fader-thumb"
        style={{ top: `${faderTop}px` }}
        onMouseDown={handleMouseDown}
      />
    </div>
  );
};

interface ChannelStripProps {
  label: string;
  value: number;
  mute: boolean;
  solo: boolean;
  onValueChange: (value: number) => void;
  onMuteChange: (mute: boolean) => void;
  onSoloChange: (solo: boolean) => void;
}

const ChannelStrip = ({ 
  label, 
  value, 
  mute, 
  solo, 
  onValueChange, 
  onMuteChange, 
  onSoloChange 
}: ChannelStripProps) => {

  return (
    <div className="channelstrip">
      <div className="label">{label}</div>
      
      <Fader value={value} onChange={onValueChange} label={label} />
      
      <button 
        className={mute ? 'active' : ''} 
        onClick={() => onMuteChange(!mute)}
      >
        Mute
      </button>
      
      <button 
        className={`solo ${solo ? 'active' : ''}`} 
        onClick={() => onSoloChange(!solo)}
      >
        Solo
      </button>
    </div>
  );
};

interface MixerPanelProps {
  samples: Array<{ name: string }>;
  volumes: number[];
  masterVolume: number;
  onVolumeChange: (index: number, volume: number) => void;
  onMasterVolumeChange: (volume: number) => void;
}

export const MixerPanel = ({ 
  samples, 
  volumes, 
  masterVolume,
  onVolumeChange, 
  onMasterVolumeChange 
}: MixerPanelProps) => {
  const [muteStates, setMuteStates] = useState<boolean[]>(Array(16).fill(false));
  const [soloStates, setSoloStates] = useState<boolean[]>(Array(16).fill(false));
  const [masterMute, setMasterMute] = useState(false);

  const handleMuteChange = (index: number, mute: boolean) => {
    const newMuteStates = [...muteStates];
    newMuteStates[index] = mute;
    setMuteStates(newMuteStates);
  };

  const handleSoloChange = (index: number, solo: boolean) => {
    const newSoloStates = [...soloStates];
    newSoloStates[index] = solo;
    setSoloStates(newSoloStates);
  };

  return (
    <div className="mixer-panel">
      <style>{`
        @import url(https://fonts.googleapis.com/css?family=VT323);
        
        .mixer-panel {
          background: #222;
          color: #eee;
          padding: 1rem;
          overflow-x: auto;
        }
        
        .mixer {
          display: flex;
          gap: 0.25rem;
        }
        
        .channelstrip {
          user-select: none;
          background: rgb(50,50,50);
          box-shadow: 0 0 0 2px rgba(100,100,100,1);
          border-radius: 4px;
          padding: 0.25rem;
          width: 4rem;
          min-height: 30rem;
          display: flex;
          flex-direction: column;
          justify-content: stretch;
          align-items: stretch;
        }
        
        .channelstrip .label {
          font-family: 'VT323', monospace;
          font-size: 0.75rem;
          text-transform: uppercase;
          display: block;
          background: #122;
          border-radius: 1px;
          box-shadow: 
            0 0 10px 5px rgba(255,255,255,0.05),
            0 3px 10px 5px rgba(0,0,0,0.8) inset,
            0 5px 10px 5px rgba(20,30,40,0.5) inset,
            0 0 0 1px rgba(0,0,0,0.75);
          height: 3rem;
          display: flex;
          align-items: center;
          justify-content: center;
          text-shadow: 0 0 20px rgba(200,255,200,0.75);
          color: rgba(200,255,200,0.8);
          text-align: center;
          padding: 0 0.5rem;
          position: relative;
          overflow: hidden;
        }
        
        .channelstrip .label:after {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: linear-gradient(-10deg,
            transparent 10%,
            rgba(255,255,255,0.1) 60%,
            transparent 62%,
            transparent
          );
        }
        
        .fader {
          position: relative;
          flex-grow: 1;
          margin: 3rem 0;
        }
        
        .fader-track {
          position: absolute;
          z-index: 1;
          top: 0;
          bottom: 0;
          width: 0.25rem;
          left: 50%;
          margin-left: -0.125rem;
          background: rgb(0,0,0);
          border: none;
          border-radius: 5px;
          box-shadow: 0 -1px 0 0 rgba(255,255,255,0.25) inset;
        }
        
        .scale-tick {
          position: absolute;
          left: 50%;
          opacity: 0.5;
        }
        
        .scale-tick:before {
          content: '';
          display: block;
          position: absolute;
          top: 0;
          left: -1.5rem;
          width: 1rem;
          height: 1px;
          background: rgb(200,200,200);
        }
        
        .scale-tick:after {
          content: '';
          display: block;
          position: absolute;
          top: 0;
          left: 0.5rem;
          width: 1rem;
          height: 1px;
          background: rgb(200,200,200);
        }
        
        .scale-tick:last-child:after,
        .scale-tick:last-child:before,
        .scale-tick:first-child:after,
        .scale-tick:first-child:before {
          height: 2px;
        }
        
        .fader-thumb {
          position: absolute;
          z-index: 2;
          border: none;
          height: 4rem;
          width: 2rem;
          left: 50%;
          margin-left: -1rem;
          margin-top: -2rem;
          border-radius: 0px;
          cursor: move;
          user-select: none;
          background: 
            repeating-linear-gradient(
              0deg,
              transparent,
              transparent 5px,
              rgba(0,0,0,1) 6px
            ),
            linear-gradient(0deg, 
              rgb(70,70,70) 0%, 
              rgb(90,90,90) 14%, 
              rgb(20,20,20) 15%, 
              rgb(20,20,20) 50%,
              rgb(90,90,90) 84%,
              rgb(20,20,20) 85%,
              rgb(30,30,30) 100%
            );
          box-shadow: 0 0.25rem 0.5rem 0 rgba(0,0,0,0.5);
        }
        
        .fader-thumb:after {
          content: '';
          position: absolute;
          top: 50%;
          left: 0;
          right: 0;
          margin-top: -1px;
          height: 3px;
          background: rgba(255,255,255,0.75);
        }
        
        .horizontal-meter {
          height: 0.5rem;
          margin-top: 0.5rem;
          background: #000;
          border-radius: 1px;
          box-shadow: 
            0 0 10px 5px rgba(255,255,255,0.05),
            0 3px 5px 1px rgba(0,0,0,0.8) inset,
            0 5px 30px 0 rgba(255,255,255,0.25) inset,
            0 0 0 1px rgba(0,0,0,0.75);
          position: relative;
        }
        
        .activity {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: 
            repeating-linear-gradient(
              90deg,
              transparent 0px,
              transparent 2px,
              rgba(0,0,0,1) 2px,
              transparent 3px,
              transparent 3px
            ),
            linear-gradient(90deg,
              rgb(0,255,0),
              rgb(0,255,0) 70%,
              rgb(255,255,0) 70%,
              rgb(255,255,0) 90%,
              rgb(255,0,0) 90%
            );
          box-shadow: 
            0 1px 2px 1px rgba(0,0,0,0.8) inset,
            0 -1px 2px 1px rgba(0,0,0,0.8) inset;
        }
        
        .channelstrip button {
          text-transform: uppercase;
          border-radius: 5rem;
          background: linear-gradient(180deg, 
            rgb(255,255,255) 0%, 
            rgb(200,200,200) 5%, 
            rgb(150,150,150) 20%, 
            rgb(180,180,180) 95%
          );
          box-shadow: 
            0 -3px 1px 0 rgba(0,0,0,0.5) inset,
            0 0 1px 2px rgba(255,255,255,0.5) inset,
            0 2px 10px 0 rgba(0,0,0,0.125);
          border: none;
          font-size: 0.75rem;
          height: 30px;
          color: black;
          font-weight: bold;
          text-shadow: 0 1px 0 rgba(255,255,255,0.75);
          padding: 0;
          position: relative;
          top: 0.5rem;
          margin-bottom: 0.5rem;
        }
        
        .channelstrip button:focus {
          outline: none;
        }
        
        .channelstrip button:active {
          height: 28px;
          margin-top: 2px;
          background: linear-gradient(0deg, 
            rgb(255,255,255) 0%, 
            rgb(200,200,200) 5%, 
            rgb(150,150,150) 20%, 
            rgb(180,180,180) 95%
          );
          box-shadow:
            0 -2px 1px 0 rgba(0,0,0,0.5) inset,
            0 0 1px 2px rgba(255,255,255,0.5) inset,
            0 2px 10px 0 rgba(0,0,0,0.125);
          padding-top: 2px;
        }
        
        .channelstrip button.active {
          background: linear-gradient(0deg, 
            rgb(255,80,80) 5%, 
            rgb(240,10,10) 95%,
            rgb(200,100,100) 100% 
          );
          box-shadow:
            0 -3px 1px 0 rgba(0,0,0,0.5) inset,
            0 0 1px 2px rgba(255,255,255,0.25) inset,
            0 2px 10px 0 rgba(0,0,0,0.125),
            0 0 10px 0 rgba(255,0,0,1);
          text-shadow: 
            0 1px 0 rgba(255,255,255,0.2),
            0 0 20px rgba(255,200,100,1);
        }
        
        .channelstrip button.solo.active {
          background: linear-gradient(0deg, 
            rgb(80,200,255) 5%, 
            rgb(10,80,240) 95%,
            rgb(100,150,200) 100% 
          );
          box-shadow:
            0 -3px 1px 0 rgba(0,0,0,0.5) inset,
            0 0 1px 2px rgba(255,255,255,0.25) inset,
            0 2px 10px 0 rgba(0,0,0,0.5),
            0 0 10px 0 rgba(0,200,255,1);
          text-shadow: 
            0 1px 0 rgba(255,255,255,0.2),
            0 0 20px rgba(0,200,255,1);
        }
        
        .master-strip {
          border-left: 2px solid rgba(255,255,255,0.3);
          margin-left: 1rem;
          padding-left: 1rem;
        }
      `}</style>
      
      <div className="mixer">
        {/* Channel strips for each pad */}
        {samples.slice(0, 16).map((sample, index) => (
          <ChannelStrip
            key={index}
            label={sample.name || `PAD ${index + 1}`}
            value={volumes[index] || 0.8}
            mute={muteStates[index]}
            solo={soloStates[index]}
            onValueChange={(value) => onVolumeChange(index, value)}
            onMuteChange={(mute) => handleMuteChange(index, mute)}
            onSoloChange={(solo) => handleSoloChange(index, solo)}
          />
        ))}
        
        {/* Master strip */}
        <div className="master-strip">
          <ChannelStrip
            label="MASTER"
            value={masterVolume}
            mute={masterMute}
            solo={false}
            onValueChange={onMasterVolumeChange}
            onMuteChange={setMasterMute}
            onSoloChange={() => {}}
          />
        </div>
      </div>
    </div>
  );
};