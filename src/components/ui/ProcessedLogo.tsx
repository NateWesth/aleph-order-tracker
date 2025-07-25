import { useState, useEffect } from 'react';
import { removeBackground, loadImageFromUrl } from '@/utils/backgroundRemoval';

interface ProcessedLogoProps {
  originalSrc: string;
  alt: string;
  className?: string;
}

export function ProcessedLogo({ originalSrc, alt, className }: ProcessedLogoProps) {
  const [processedImageUrl, setProcessedImageUrl] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const processImage = async () => {
      try {
        setIsProcessing(true);
        setError(null);
        
        // Load the original image
        const img = await loadImageFromUrl(originalSrc);
        
        // Remove background
        const processedBlob = await removeBackground(img);
        
        // Create URL for the processed image
        const url = URL.createObjectURL(processedBlob);
        setProcessedImageUrl(url);
        
      } catch (err) {
        console.error('Error processing image:', err);
        setError('Failed to process image');
      } finally {
        setIsProcessing(false);
      }
    };

    processImage();

    // Cleanup function to revoke object URL
    return () => {
      if (processedImageUrl) {
        URL.revokeObjectURL(processedImageUrl);
      }
    };
  }, [originalSrc]);

  if (isProcessing) {
    return (
      <div className={`${className} flex items-center justify-center bg-muted rounded`}>
        <div className="text-xs text-muted-foreground">Processing...</div>
      </div>
    );
  }

  if (error || !processedImageUrl) {
    // Fallback to original image if processing fails
    return <img src={originalSrc} alt={alt} className={className} />;
  }

  return <img src={processedImageUrl} alt={alt} className={className} />;
}