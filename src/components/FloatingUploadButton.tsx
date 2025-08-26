import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Upload } from "lucide-react";
import { GlobalFileUpload } from './GlobalFileUpload';
import { useAuth } from '@/contexts/AuthContext';

export const FloatingUploadButton: React.FC = () => {
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const { user } = useAuth();

  // Only show for authenticated users
  if (!user) return null;

  return (
    <>
      <Button
        onClick={() => setIsUploadOpen(true)}
        className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg hover:shadow-xl transition-all duration-200 z-40 bg-primary hover:bg-primary/90"
        size="icon"
      >
        <Upload className="h-6 w-6" />
      </Button>
      
      <GlobalFileUpload 
        isOpen={isUploadOpen} 
        onClose={() => setIsUploadOpen(false)} 
      />
    </>
  );
};