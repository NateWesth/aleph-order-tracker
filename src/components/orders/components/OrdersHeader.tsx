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
  return <div className="flex justify-between items-center mb-6">
      <h1 className="text-2xl font-bold text-aleph-green">Orders Management</h1>
      <div className="flex items-center gap-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
          <Input placeholder="Search orders..." className="pl-10 w-64" value={searchTerm} onChange={e => onSearchChange(e.target.value)} />
        </div>
        
      </div>
    </div>;
}