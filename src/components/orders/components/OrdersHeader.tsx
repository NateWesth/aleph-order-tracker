import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Plus } from "lucide-react";
interface OrdersHeaderProps {
  searchTerm: string;
  onSearchChange: (value: string) => void;
}
export default function OrdersHeader({
  searchTerm,
  onSearchChange
}: OrdersHeaderProps) {
  return (
    <div className="flex flex-col gap-4 mb-6">
      <h1 className="font-bold text-lg md:text-xl text-emerald-950 truncate">Orders Management</h1>
      <div className="w-full">
        <div className="relative w-full">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4 z-10" />
          <Input 
            placeholder="Search orders..." 
            className="pl-10 w-full" 
            value={searchTerm} 
            onChange={e => onSearchChange(e.target.value)} 
          />
        </div>
      </div>
    </div>
  );
}