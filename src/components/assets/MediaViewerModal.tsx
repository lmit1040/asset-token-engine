import { useState, useEffect, useCallback } from 'react';
import { Download, ExternalLink, ZoomIn, ZoomOut, RotateCw, Maximize2, ChevronLeft, ChevronRight } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ProofOfReserveFile } from '@/types/database';
import { format } from 'date-fns';

interface MediaViewerModalProps {
  file: ProofOfReserveFile;
  files?: ProofOfReserveFile[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onFileChange?: (file: ProofOfReserveFile) => void;
}

export function MediaViewerModal({ file, files = [], open, onOpenChange, onFileChange }: MediaViewerModalProps) {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);

  const currentIndex = files.findIndex(f => f.id === file.id);
  const hasPrev = files.length > 1 && currentIndex > 0;
  const hasNext = files.length > 1 && currentIndex < files.length - 1;

  const isImage = file.file_type.startsWith('image/');
  const isVideo = file.file_type.startsWith('video/');
  const isAudio = file.file_type.startsWith('audio/');
  const isPdf = file.file_type === 'application/pdf';

  const handleZoomIn = () => setZoom(prev => Math.min(prev + 0.25, 3));
  const handleZoomOut = () => setZoom(prev => Math.max(prev - 0.25, 0.5));
  const handleRotate = () => setRotation(prev => (prev + 90) % 360);
  const handleReset = () => {
    setZoom(1);
    setRotation(0);
  };

  const goToPrev = useCallback(() => {
    if (hasPrev && onFileChange) {
      handleReset();
      onFileChange(files[currentIndex - 1]);
    }
  }, [hasPrev, currentIndex, files, onFileChange]);

  const goToNext = useCallback(() => {
    if (hasNext && onFileChange) {
      handleReset();
      onFileChange(files[currentIndex + 1]);
    }
  }, [hasNext, currentIndex, files, onFileChange]);

  // Keyboard navigation
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          onOpenChange(false);
          break;
        case 'ArrowLeft':
          e.preventDefault();
          goToPrev();
          break;
        case 'ArrowRight':
          e.preventDefault();
          goToNext();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onOpenChange, goToPrev, goToNext]);

  const renderContent = () => {
    if (isImage) {
      return (
        <div 
          className="flex items-center justify-center min-h-[400px] max-h-[70vh] overflow-auto bg-black/20 rounded-lg"
          onClick={handleReset}
        >
          <img
            src={file.file_url}
            alt={file.file_name}
            className="max-w-full max-h-full object-contain transition-transform duration-200"
            style={{
              transform: `scale(${zoom}) rotate(${rotation}deg)`,
            }}
          />
        </div>
      );
    }

    if (isVideo) {
      return (
        <div className="flex items-center justify-center min-h-[400px] max-h-[70vh] bg-black rounded-lg overflow-hidden">
          <video
            src={file.file_url}
            controls
            className="max-w-full max-h-full"
            autoPlay={false}
          >
            Your browser does not support the video tag.
          </video>
        </div>
      );
    }

    if (isAudio) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[200px] bg-muted/30 rounded-lg p-8">
          <div className="h-20 w-20 rounded-full bg-primary/20 flex items-center justify-center mb-6">
            <div className="h-12 w-12 rounded-full bg-primary/40 animate-pulse" />
          </div>
          <audio
            src={file.file_url}
            controls
            className="w-full max-w-md"
            autoPlay={false}
          >
            Your browser does not support the audio tag.
          </audio>
        </div>
      );
    }

    if (isPdf) {
      return (
        <div className="w-full h-[70vh] bg-muted/30 rounded-lg overflow-hidden">
          <iframe
            src={file.file_url}
            title={file.file_name}
            className="w-full h-full border-0"
          />
        </div>
      );
    }

    // Fallback for unsupported types
    return (
      <div className="flex flex-col items-center justify-center min-h-[200px] bg-muted/30 rounded-lg p-8">
        <p className="text-muted-foreground mb-4">
          This file type cannot be previewed inline.
        </p>
        <Button asChild>
          <a href={file.file_url} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-4 w-4 mr-2" />
            Open in New Tab
          </a>
        </Button>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[95vh] p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b border-border bg-muted/30">
          <div className="flex items-center justify-between">
            <div className="flex-1 min-w-0 mr-4">
              <DialogTitle className="text-sm font-medium truncate">
                {file.file_name}
              </DialogTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Uploaded {format(new Date(file.uploaded_at), 'MMMM d, yyyy')} • {file.file_type}
                {files.length > 1 && ` • ${currentIndex + 1} of ${files.length}`}
              </p>
            </div>
            <div className="flex items-center gap-2 mr-8">
              {isImage && (
                <>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleZoomOut}>
                    <ZoomOut className="h-4 w-4" />
                  </Button>
                  <span className="text-xs text-muted-foreground w-12 text-center">
                    {Math.round(zoom * 100)}%
                  </span>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleZoomIn}>
                    <ZoomIn className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleRotate}>
                    <RotateCw className="h-4 w-4" />
                  </Button>
                </>
              )}
              <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                <a href={file.file_url} target="_blank" rel="noopener noreferrer">
                  <Maximize2 className="h-4 w-4" />
                </a>
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                <a href={file.file_url} download={file.file_name}>
                  <Download className="h-4 w-4" />
                </a>
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="p-4 overflow-auto relative">
          {/* Navigation arrows */}
          {hasPrev && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute left-6 top-1/2 -translate-y-1/2 z-10 h-10 w-10 bg-background/80 hover:bg-background"
              onClick={goToPrev}
            >
              <ChevronLeft className="h-6 w-6" />
            </Button>
          )}
          {hasNext && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-6 top-1/2 -translate-y-1/2 z-10 h-10 w-10 bg-background/80 hover:bg-background"
              onClick={goToNext}
            >
              <ChevronRight className="h-6 w-6" />
            </Button>
          )}
          {renderContent()}
        </div>

        {/* File Hash Footer */}
        <div className="px-6 py-3 border-t border-border bg-muted/20">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-4">
              <span className="text-muted-foreground">SHA-256 Hash:</span>
              <code className="font-mono text-foreground bg-muted px-2 py-1 rounded">
                {file.file_hash}
              </code>
            </div>
            {files.length > 1 && (
              <span className="text-muted-foreground">
                Use ← → arrow keys to navigate
              </span>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
