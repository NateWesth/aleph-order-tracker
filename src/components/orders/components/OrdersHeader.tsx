import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Plus } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
interface OrdersHeaderProps {
  searchTerm: string;
  onSearchChange: (value: string) => void;
}
export default function OrdersHeader({
  searchTerm,
  onSearchChange
}: OrdersHeaderProps) {
  const isMobile = useIsMobile();
  
  return (
    <div className={`flex flex-col gap-2 ${isMobile ? 'mb-3' : 'gap-4 mb-6'}`}>
      <h1 className={`font-bold text-emerald-950 truncate ${isMobile ? 'text-base' : 'text-lg md:text-xl'}`}>
        {isMobile ? 'Orders' : 'Orders Management'}
      </h1>
      <div className="w-full">
        <div className="relative w-full">
          <Search className={`absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 z-10 ${isMobile ? 'h-3 w-3' : 'h-4 w-4'}`} />
          <Input 
            placeholder={isMobile ? "Search..." : "Search orders..."} 
            className={`w-full ${isMobile ? 'pl-8 h-9 text-sm' : 'pl-10'}`}
            value={searchTerm} 
            onChange={e => onSearchChange(e.target.value)} 
          />
        </div>
      </div>
    </div>
  );
}