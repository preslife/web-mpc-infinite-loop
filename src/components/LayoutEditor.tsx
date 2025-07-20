import React, { useCallback, useState, useRef } from 'react';
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  Node,
  NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Button } from './ui/button';
import { Save, RotateCcw, Edit3 } from 'lucide-react';
import { toast } from 'sonner';

// Panel Node Component
const PanelNode = ({ data }: { data: any }) => {
  return (
    <div className="panel-node">
      <div className="panel-content">
        {data.content}
      </div>
    </div>
  );
};

const nodeTypes: NodeTypes = {
  panel: PanelNode,
};

interface LayoutEditorProps {
  children: React.ReactNode;
  onLayoutChange?: (layout: any) => void;
}

export const LayoutEditor: React.FC<LayoutEditorProps> = ({ 
  children, 
  onLayoutChange 
}) => {
  const [isEditMode, setIsEditMode] = useState(false);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const childrenRef = useRef<HTMLDivElement>(null);

  // Convert current layout to nodes when entering edit mode
  const enterEditMode = useCallback(() => {
    const panels = [
      {
        id: 'master-volume',
        type: 'panel',
        position: { x: 50, y: 50 },
        data: { 
          label: 'Master Volume',
          content: 'Master Volume Panel'
        },
        style: { width: 200, height: 150 }
      },
      {
        id: 'drum-pads',
        type: 'panel', 
        position: { x: 300, y: 50 }, // Aligned with master volume
        data: { 
          label: 'Drum Pads',
          content: 'Drum Pads Panel'
        },
        style: { width: 280, height: 320 }
      },
      {
        id: 'sequencer',
        type: 'panel',
        position: { x: 50, y: 220 },
        data: { 
          label: 'Sequencer',
          content: 'Sequencer Panel'
        },
        style: { width: 530, height: 200 }
      },
      {
        id: 'effects',
        type: 'panel',
        position: { x: 50, y: 440 },
        data: { 
          label: 'Effects',
          content: 'Effects Panel'
        },
        style: { width: 530, height: 150 }
      }
    ];
    
    setNodes(panels);
    setIsEditMode(true);
    toast.info('Edit mode enabled - drag and resize panels');
  }, [setNodes]);

  const exitEditMode = useCallback(() => {
    setIsEditMode(false);
    toast.info('Edit mode disabled');
  }, []);

  const saveLayout = useCallback(() => {
    const layout = {
      nodes: nodes.map(node => ({
        id: node.id,
        position: node.position,
        style: node.style
      }))
    };
    
    localStorage.setItem('drumMachineLayout', JSON.stringify(layout));
    onLayoutChange?.(layout);
    toast.success('Layout saved successfully!');
  }, [nodes, onLayoutChange]);

  const resetLayout = useCallback(() => {
    localStorage.removeItem('drumMachineLayout');
    enterEditMode(); // Reset to default positions
    toast.info('Layout reset to default');
  }, [enterEditMode]);

  if (isEditMode) {
    return (
      <div className="min-h-screen bg-black p-2 font-mono">
        <div className="max-w-7xl mx-auto">
          {/* Edit Mode Header */}
          <div className="bg-gray-900 p-2 mb-2 rounded border border-gray-700">
            <div className="flex items-center justify-between">
              <div className="text-white font-bold text-lg tracking-wider">
                LAYOUT EDITOR
              </div>
              <div className="flex gap-2">
                <Button 
                  onClick={saveLayout} 
                  variant="outline" 
                  size="sm" 
                  className="bg-green-600/20 border-green-500/50 text-green-300 hover:bg-green-600/30"
                >
                  <Save className="w-3 h-3 mr-1" />
                  SAVE
                </Button>
                <Button 
                  onClick={resetLayout} 
                  variant="outline" 
                  size="sm" 
                  className="bg-yellow-600/20 border-yellow-500/50 text-yellow-300 hover:bg-yellow-600/30"
                >
                  <RotateCcw className="w-3 h-3 mr-1" />
                  RESET
                </Button>
                <Button 
                  onClick={exitEditMode} 
                  variant="outline" 
                  size="sm" 
                  className="bg-gray-800 border-gray-600 text-gray-300"
                >
                  EXIT EDIT
                </Button>
              </div>
            </div>
          </div>

          {/* React Flow Editor */}
          <div className="h-[80vh] bg-gray-900 rounded border border-gray-700">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              nodeTypes={nodeTypes}
              fitView
              attributionPosition="bottom-left"
              className="react-flow-dark"
            >
              <Background color="#374151" gap={20} />
              <Controls />
              <MiniMap 
                nodeColor="#6b7280"
                maskColor="rgba(0, 0, 0, 0.8)"
                className="bg-gray-800 border border-gray-600"
              />
            </ReactFlow>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black p-2 font-mono">
      <div className="max-w-7xl mx-auto">
        {/* Normal Mode Header with Edit Button */}
        <div className="bg-gray-900 p-2 mb-2 rounded border border-gray-700">
          <div className="flex items-center justify-between">
            <div className="text-white font-bold text-lg tracking-wider">X BEAT STUDIO</div>
            <div className="flex gap-2">
              <Button 
                onClick={enterEditMode} 
                variant="outline" 
                size="sm" 
                className="bg-purple-600/20 border-purple-500/50 text-purple-300 hover:bg-purple-600/30 neon-border"
              >
                <Edit3 className="w-3 h-3 mr-1" />
                EDIT LAYOUT
              </Button>
              
            </div>
          </div>
        </div>

        {/* Regular content */}
        <div ref={childrenRef}>
          {children}
        </div>
      </div>
    </div>
  );
};
