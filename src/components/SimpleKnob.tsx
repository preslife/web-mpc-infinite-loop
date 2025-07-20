import { useRef, useCallback, useState } from 'react';

interface SimpleKnobProps {
  value: number; // 0-100
  onChange: (value: number) => void;
  size?: number; // diameter in pixels
  color?: string;
  label?: string;
}

export const SimpleKnob = ({ 
  value, 
  onChange, 
  size = 24, 
  color = '#00ddff',
  label 
}: SimpleKnobProps) => {
  const knobRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!knobRef.current) return;
    
    setIsDragging(true);
    const rect = knobRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const handleMouseMove = (e: MouseEvent) => {
      const angle = Math.atan2(e.clientY - centerY, e.clientX - centerX);
      let degrees = (angle * 180) / Math.PI + 90;
      if (degrees < 0) degrees += 360;
      
      // Map 0-270 degrees to 0-100 value (leaving a gap at the bottom)
      const minAngle = 315; // Start angle
      const maxAngle = 225; // End angle (next day)
      
      let normalizedAngle;
      if (degrees >= minAngle || degrees <= maxAngle) {
        if (degrees >= minAngle) {
          normalizedAngle = degrees - minAngle;
        } else {
          normalizedAngle = degrees + (360 - minAngle);
        }
        const maxRange = (360 - minAngle) + maxAngle;
        const newValue = Math.round((normalizedAngle / maxRange) * 100);
        onChange(Math.max(0, Math.min(100, newValue)));
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [onChange]);

  // Convert value (0-100) to rotation angle
  const rotation = (value / 100) * 270 - 135; // -135 to +135 degrees

  return (
    <div className="flex flex-col items-center">
      {label && <div className="text-xs text-gray-400 mb-1">{label}</div>}
      <div
        ref={knobRef}
        className={`relative rounded-full border-2 cursor-pointer transition-all duration-150 ${
          isDragging ? 'scale-110' : 'hover:scale-105'
        }`}
        style={{
          width: size,
          height: size,
          borderColor: color,
          background: `conic-gradient(from -135deg, ${color} 0deg, ${color} ${(value / 100) * 270}deg, #374151 ${(value / 100) * 270}deg, #374151 270deg)`,
        }}
        onMouseDown={handleMouseDown}
      >
        {/* Knob indicator */}
        <div
          className="absolute w-1 h-1 bg-white rounded-full"
          style={{
            top: '2px',
            left: '50%',
            transformOrigin: `0 ${size / 2 - 2}px`,
            transform: `translateX(-50%) rotate(${rotation}deg)`,
          }}
        />
        
        {/* Value display */}
        <div 
          className="absolute inset-0 flex items-center justify-center text-xs font-mono text-white"
          style={{ fontSize: size < 30 ? '8px' : '10px' }}
        >
          {Math.round(value)}
        </div>
      </div>
    </div>
  );
};