import { useState, useRef } from 'react';
import { Upload, Image as ImageIcon, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface TokenImageUploadProps {
  tokenId: string;
  tokenSymbol: string;
  currentImageUrl?: string | null;
  onUploadComplete: (imageUrl: string) => void;
}

export function TokenImageUpload({ 
  tokenId, 
  tokenSymbol, 
  currentImageUrl, 
  onUploadComplete 
}: TokenImageUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'image/gif'];
    if (!allowedTypes.includes(file.type)) {
      toast.error('Invalid file type. Please use PNG, JPG, WEBP, SVG, or GIF.');
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('File too large. Maximum size is 5MB.');
      return;
    }

    setSelectedFile(file);
    
    // Create preview
    const reader = new FileReader();
    reader.onload = (e) => {
      setPreview(e.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleUpload = async () => {
    if (!selectedFile || !preview) return;

    setIsUploading(true);
    try {
      toast.info('Uploading image to IPFS...');

      const { data, error } = await supabase.functions.invoke('upload-token-image', {
        body: {
          tokenDefinitionId: tokenId,
          imageBase64: preview,
          fileName: selectedFile.name,
          mimeType: selectedFile.type,
        },
      });

      if (error) {
        throw new Error(error.message || 'Upload failed');
      }

      if (!data.success) {
        throw new Error(data.error || 'Upload failed');
      }

      toast.success(`Image uploaded to IPFS!`);
      onUploadComplete(data.imageUrl);
      setPreview(null);
      setSelectedFile(null);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to upload image';
      toast.error(message);
    } finally {
      setIsUploading(false);
    }
  };

  const clearSelection = () => {
    setPreview(null);
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const displayImage = preview || currentImageUrl;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <ImageIcon className="h-4 w-4" />
        <span className="font-medium">Token Icon</span>
      </div>

      <div className="flex items-start gap-3">
        {/* Image preview area */}
        <div className="relative w-16 h-16 rounded-lg border border-border bg-muted/50 flex items-center justify-center overflow-hidden flex-shrink-0">
          {displayImage ? (
            <img 
              src={displayImage} 
              alt={`${tokenSymbol} icon`}
              className="w-full h-full object-cover"
            />
          ) : (
            <ImageIcon className="h-6 w-6 text-muted-foreground/50" />
          )}
        </div>

        {/* Upload controls */}
        <div className="flex-1 space-y-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif"
            onChange={handleFileSelect}
            className="hidden"
          />

          {!selectedFile ? (
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-4 w-4 mr-1" />
              {currentImageUrl ? 'Change Icon' : 'Upload Icon'}
            </Button>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground truncate flex-1">
                  {selectedFile.name}
                </span>
                <button
                  onClick={clearSelection}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <Button
                size="sm"
                className="w-full"
                onClick={handleUpload}
                disabled={isUploading}
              >
                {isUploading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-1" />
                    Upload to IPFS
                  </>
                )}
              </Button>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            Recommended: 512x512px PNG or SVG
          </p>
        </div>
      </div>
    </div>
  );
}
