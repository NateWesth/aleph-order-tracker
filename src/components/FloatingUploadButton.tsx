import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { GlobalFileUpload } from './GlobalFileUpload';
import { useAuth } from '@/contexts/AuthContext';
export const FloatingUploadButton: React.FC = () => {
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const {
    user
  } = useAuth();

  // Only show for authenticated users
  if (!user) return null;
  return <>
      
      
      <GlobalFileUpload isOpen={isUploadOpen} onClose={() => setIsUploadOpen(false)} />
    </>;
};