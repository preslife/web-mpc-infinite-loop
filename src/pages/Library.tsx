import { SampleLibrary } from '@/components/SampleLibrary';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';

export default function Library() {
  const navigate = useNavigate();

  const handleLoadKit = (kit: any) => {
    // For now, we'll store the kit selection and navigate back
    localStorage.setItem('selectedKit', JSON.stringify(kit));
    navigate('/');
  };

  const handleLoadSample = (sample: any, padIndex: number) => {
    // Store individual sample selection
    const selectedSamples = JSON.parse(localStorage.getItem('selectedSamples') || '{}');
    selectedSamples[padIndex] = sample;
    localStorage.setItem('selectedSamples', JSON.stringify(selectedSamples));
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-40">
        <div className="container flex h-14 items-center">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => navigate('/')}
            className="mr-4"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Studio
          </Button>
          <div className="flex items-center gap-2">
            <img src="/lovable-uploads/8172f0a9-66b9-4449-b322-0291dc32073c.png" alt="XBEAT Studio" className="h-6 w-auto" />
            <span className="text-lg font-semibold">Sample Library</span>
          </div>
        </div>
      </div>
      
      <SampleLibrary 
        onLoadKit={handleLoadKit}
        onLoadSample={handleLoadSample}
      />
    </div>
  );
}