import React, { ReactNode } from 'react';
import { Handle, Position, NodeResizer } from '@xyflow/react';

interface DraggablePanelProps {
  id: string;
  title: string;
  children: ReactNode;
  className?: string;
  resizable?: boolean;
}

export const DraggablePanel: React.FC<DraggablePanelProps> = ({
  id,
  title,
  children,
  className = "",
  resizable = true
}) => {
  return (
    <div className={`draggable-panel ${className}`}>
      {resizable && <NodeResizer minWidth={150} minHeight={100} />}
      
      {/* Panel Header */}
      <div className="panel-header bg-gray-800/90 backdrop-blur-md border-b border-gray-600/50 p-2 rounded-t-lg">
        <div className="text-xs text-gray-300 font-bold tracking-wider">{title}</div>
      </div>
      
      {/* Panel Content */}
      <div className="panel-content h-full overflow-hidden">
        {children}
      </div>
      
      {/* Connection Handles */}
      <Handle 
        type="target" 
        position={Position.Left} 
        className="opacity-0 hover:opacity-100 transition-opacity"
      />
      <Handle 
        type="source" 
        position={Position.Right} 
        className="opacity-0 hover:opacity-100 transition-opacity"
      />
    </div>
  );
};