import { useRef, useCallback, useEffect } from 'react';
interface VolumeKnobProps {
  value: number;
  onChange: (value: number) => void;
  size?: 'sm' | 'md' | 'lg';
  label?: string;
}
export const VolumeKnob = ({
  value,
  onChange,
  size = 'md',
  label
}: VolumeKnobProps) => {
  const sliderRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  const sizeMap = {
    sm: {
      scale: 0.2
    },
    // Much smaller for track controls
    md: {
      scale: 0.6
    },
    // Medium size 
    lg: {
      scale: 0.7
    } // Large but not too big for master volume
  };
  const calculateDegree = useCallback((e: MouseEvent) => {
    if (!sliderRef.current) return 0;
    const rect = sliderRef.current.getBoundingClientRect();
    const x1 = rect.left + rect.width / 2;
    const y1 = rect.top + rect.height / 2;
    const x2 = e.clientX;
    const y2 = e.clientY;
    const deltax = x1 - x2;
    const deltay = y1 - y2;
    const rad = Math.atan2(deltay, deltax);
    let deg = rad * (180 / Math.PI);
    return deg;
  }, []);
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!knobRef.current || !sliderRef.current) return;
    const handleRotate = (e: MouseEvent) => {
      const result = Math.floor(calculateDegree(e) - 180);
      if (knobRef.current) {
        knobRef.current.style.transform = `rotate(${result}deg)`;
      }
      let val = Math.floor(calculateDegree(e) + 90);
      let ran = 0;
      if (val > 0 && val < 181) ran = val / 180;
      if (val > 180) ran = Math.abs((val - 360) / 180);
      if (val < 0) ran = Math.abs(val) / 180;
      let num = Math.floor(ran * 100);
      if (num < 10) num = num;
      if (num >= 100) num = 99;
      onChange(num);
      if (sliderRef.current) {
        sliderRef.current.style.setProperty('--vol', Math.floor(ran * 100).toString());
      }
    };
    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleRotate);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    document.addEventListener('mousemove', handleRotate);
    document.addEventListener('mouseup', handleMouseUp);
  }, [calculateDegree, onChange]);

  // Update CSS variable when value changes
  useEffect(() => {
    if (sliderRef.current) {
      sliderRef.current.style.setProperty('--vol', value.toString());
    }
  }, [value]);
  const displayValue = Math.floor(value).toString().padStart(2, '0');
  const currentScale = sizeMap[size].scale;
  return <div className="relative flex flex-col items-center px-0 py-0 my-0 mx-[8px]">
      {label && <div className="text-xs text-gray-400">{label}</div>}
      
      <div ref={sliderRef} className="volume-knob-slider" style={{
      transform: `rotate(90deg) scale(${currentScale})`,
      margin: size === 'sm' ? '-3em' : '0',
      '--vol': value,
      '--c1': '#00ddff',
      '--mut': '#39c1ff'
    } as React.CSSProperties}>
        <div className="volume-knob-glow"></div>
        <div ref={knobRef} onMouseDown={handleMouseDown} style={{
        transform: `rotate(${value / 100 * 270 - 135}deg)`
      }} className="volume-knob-knob mx-0 px-0"></div>
        <div className="volume-knob-number">{displayValue}</div>
      </div>
    </div>;
};