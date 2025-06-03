
import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

export default function AdminWelcome() {
  const { user } = useAuth();
  const [userProfile, setUserProfile] = useState<any>(null);

  useEffect(() => {
    if (user) {
      fetchUserProfile();
    }
  }, [user]);

  const fetchUserProfile = async () => {
    if (!user) return;
    
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();
    
    setUserProfile(data);
  };

  return (
    <div className="flex items-center justify-center h-full relative bg-white dark:bg-gray-800">
      {/* Faded background logo */}
      <div 
        className="absolute inset-0 opacity-5 bg-no-repeat bg-center"
        style={{
          backgroundImage: 'url("/lovable-uploads/e1088147-889e-43f6-bdf0-271189b88913.png")',
          backgroundSize: '50%',
          zIndex: 0
        }}
      ></div>
      <div className="text-center relative z-10">
        <h1 className="text-4xl md:text-6xl font-bold text-aleph-green mb-4">
          Welcome{userProfile?.full_name ? `, ${userProfile.full_name}` : ''}
        </h1>
        <p className="text-xl text-gray-600 dark:text-gray-300">Admin Dashboard - Aleph Engineering and Supplies</p>
      </div>
    </div>
  );
}
