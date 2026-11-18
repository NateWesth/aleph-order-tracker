import { MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { routeLegs } from "@/lib/routeExport";

export default function RouteExportLinks({ addresses }: { addresses: string[] }) {
  const legs = routeLegs(addresses);
  return <div className="flex flex-wrap gap-1.5">{legs.map((leg, i) => <Button key={i} size="sm" asChild><a href={leg.url} target="_blank" rel="noreferrer"><MapPin className="mr-1 h-4 w-4" />{legs.length === 1 ? "Google Maps" : `Google Maps · ${i + 1}/${legs.length}`}</a></Button>)}</div>;
}