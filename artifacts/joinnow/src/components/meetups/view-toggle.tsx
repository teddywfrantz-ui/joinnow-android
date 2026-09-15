import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Map, List } from "lucide-react";
import { cn } from "@/lib/utils";

interface ViewToggleProps {
  view: 'map' | 'list';
  onChange: (view: 'map' | 'list') => void;
}

export function ViewToggle({ view, onChange }: ViewToggleProps) {
  // Adding console logging to debug the toggle behavior
  console.log("ViewToggle rendering with view:", view);
  
  // Handle change with explicit logging
  const handleViewChange = (value: string) => {
    console.log("Toggle value changing from", view, "to", value);
    if (value) {
      onChange(value as 'map' | 'list');
    } else {
      // If no value is provided (which happens on deselect), force current view
      // This prevents the toggle from deselecting completely
      console.log("Empty value received, forcing current view:", view);
      onChange(view);
    }
  };
  
  return (
    <ToggleGroup
      type="single"
      value={view}
      onValueChange={handleViewChange}
      className="border rounded-lg"
    >
      <ToggleGroupItem 
        value="map" 
        aria-label="Toggle map view"
        className={cn(
          "data-[state=on]:bg-primary data-[state=on]:text-primary-foreground",
          "hover:bg-muted"
        )}
      >
        <Map className="h-4 w-4" />
      </ToggleGroupItem>
      <ToggleGroupItem 
        value="list" 
        aria-label="Toggle list view"
        className={cn(
          "data-[state=on]:bg-primary data-[state=on]:text-primary-foreground",
          "hover:bg-muted"
        )}
      >
        <List
          className="h-4 w-4 !text-blue-600"
          stroke="#2563eb"
        />
      </ToggleGroupItem>
    </ToggleGroup>
  );
}