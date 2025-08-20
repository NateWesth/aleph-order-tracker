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
  return <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
      <h1 className="font-bold text-lg md:text-xl text-emerald-950">Orders Management</h1>
      <div className="flex items-center gap-2 w-full sm:w-auto">
        <div className="relative flex-1 sm:flex-none">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
          <Input 
            placeholder="Search orders..." 
            className="pl-10 w-full sm:w-64" 
            value={searchTerm} 
            onChange={e => onSearchChange(e.target.value)} 
          />
        </div>
      </div>
    </div>;
}