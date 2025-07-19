import { useState, useRef, useCallback } from 'react';

interface VolumeKnobProps {
  value: number;
  onChange: (value: number) => void;
  size?: 'sm' | 'md' | 'lg';
  label?: string;
}

export const VolumeKnob = ({ value, onChange, size = 'md', label }: VolumeKnobProps) => {
  const [isDragging, setIsDragging] = useState(false);
  const knobRef = useRef<HTMLDivElement>(null);
  const initialAngleRef = useRef<number>(0);
  const initialValueRef = useRef<number>(0);

  const sizeClasses = {
    sm: { container: 'w-16 h-16', knob: 'w-16 h-16', number: 'text-xs w-6 h-6', glow: 'w-20 h-20' },
    md: { container: 'w-20 h-20', knob: 'w-20 h-20', number: 'text-sm w-7 h-7', glow: 'w-24 h-24' },
    lg: { container: 'w-24 h-24', knob: 'w-24 h-24', number: 'text-base w-8 h-8', glow: 'w-28 h-28' }
  };

  const calculateAngle = useCallback((e: MouseEvent, rect: DOMRect) => {
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const deltaX = centerX - e.clientX;
    const deltaY = centerY - e.clientY;
    const rad = Math.atan2(deltaY, deltaX);
    let deg = rad * (180 / Math.PI);
    return deg;
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!knobRef.current) return;
    
    setIsDragging(true);
    const rect = knobRef.current.getBoundingClientRect();
    initialAngleRef.current = calculateAngle(e.nativeEvent, rect);
    initialValueRef.current = value;

    const handleMouseMove = (e: MouseEvent) => {
      if (!knobRef.current) return;
      
      const rect = knobRef.current.getBoundingClientRect();
      const currentAngle = calculateAngle(e, rect);
      const angleDiff = initialAngleRef.current - currentAngle;
      
      // Convert angle difference to value change (more sensitive)
      const valueChange = angleDiff / 3.6; // 360 degrees = 100 value units
      let newValue = initialValueRef.current + valueChange;
      
      // Clamp between 0 and 100
      newValue = Math.max(0, Math.min(100, newValue));
      onChange(newValue);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [value, onChange, calculateAngle]);

  // Calculate rotation based on value (0-100 maps to roughly 270 degrees of rotation)
  const rotation = (value / 100) * 270 - 135;
  const displayValue = Math.floor(value).toString().padStart(2, '0');

  return (
    <div className="relative flex flex-col items-center gap-2">
      {label && <div className="text-xs text-gray-400">{label}</div>}
      
      <div className={`relative ${sizeClasses[size].container}`}>
        {/* Glow effect */}
        <div 
          className={`absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 ${sizeClasses[size].glow} rounded-full z-0`}
          style={{
            background: `radial-gradient(circle at 50% 50%, #333333 40%, transparent 41%), conic-gradient(from 0deg, transparent 0%, transparent ${(value / 100) * 100}%, #00ddff ${(value / 100) * 100}%, #00ddff ${(value / 100) * 100 + 1}%, transparent ${(value / 100) * 100 + 2}%, transparent 100%)`,
            boxShadow: isDragging ? '0 0 20px #00ddff, inset 0 0 20px #00ddff' : '0 0 10px #00ddff40',
            border: '5px solid #00bcd410'
          }}
        />
        
        {/* Main knob container */}
        <div 
          ref={knobRef}
          className={`relative ${sizeClasses[size].knob} rounded-full cursor-pointer select-none`}
          style={{
            background: 'linear-gradient(145deg, #525252 0%, #373737 100%)',
            boxShadow: isDragging 
              ? '0 0 20px #00ddff, 0 20px 35px #111111, inset 0 5px 6px #979797, inset 0 -5px 6px #242424'
              : '0 -20px 20px #757575, 0 20px 35px #111111, inset 0 5px 6px #979797, inset 0 -5px 6px #242424'
          }}
          onMouseDown={handleMouseDown}
        >
          {/* Knob indicator */}
          <div 
            className="absolute top-3 left-1/2 transform -translate-x-1/2 w-6 h-6 rounded-full transition-all duration-200"
            style={{
              background: `radial-gradient(circle at 50% 45%, ${isDragging ? '#c7e6ff' : '#39c1ff'} 4px, transparent 5px), radial-gradient(circle at 50% 50%, #404040 4px, transparent 6px), radial-gradient(circle at 50% 40%, #1118 4px, transparent 5px), linear-gradient(0deg, #373737, #2e2e2e)`,
              boxShadow: isDragging 
                ? '0 0 10px #00ddff, 0 0 30px #00ddff, inset 0 0 10px #00ddff, 0 -1px 1px #111, 0 3px 3px #404040'
                : '0 -1px 1px #111, 0 1px 1px #555',
              border: `2px solid ${isDragging ? '#00ddff' : '#2e2e2e'}`,
              transform: `translateX(-50%) rotate(${rotation}deg)`
            }}
          />
        </div>
        
        {/* Value display */}
        <div 
          className={`absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-8 ${sizeClasses[size].number} rounded-full flex items-center justify-center font-mono`}
          style={{
            background: '#282828',
            color: isDragging ? '#c7eaff' : '#39c1ff',
            fontFamily: '"Alarm Clock", "Orbitron", monospace',
            boxShadow: isDragging 
              ? '0 0 10px #000 inset, 0 0 100px -40px #335564 inset, 0 0 30px #8edbff'
              : '0 0 10px #000 inset, 0 0 100px -80px #39c1ff inset',
            border: '2px solid #0001',
            textShadow: isDragging 
              ? '0 0 2px #2196f3, 0 0 2px #2196f3, 0 0 2px #23759b, 0 0 20px #144054, 0 0 25px #39c1ff'
              : '0 0 3px #000, 0 0 2px #000, 0 0 3px #39c1ff',
            filter: 'drop-shadow(-1px -2px 1px #111) drop-shadow(0px 1px 1px #404040)'
          }}
        >
          {displayValue}
        </div>
      </div>
    </div>
  );
};