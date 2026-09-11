import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, FilterX, SlidersHorizontal } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils"; // Assuming cn is imported from a utils file

export type MeetupFilters = {
  searchQuery: string;
  hideFullMeetups: boolean;
  selectedTheme?: string;
  searchRadiusMiles: number;  // Changed from radiusKm to searchRadiusMiles for consistency
};

interface MeetupFiltersProps {
  filters: MeetupFilters;
  onFiltersChange: (filters: MeetupFilters) => void;
}

const themes = [
  'all',
  'technology',
  'social',
  'education',
  'sports',
  'arts',
  'gaming',
  'music',
  'food',
  'other'
];

const DEFAULT_SEARCH_RADIUS = 25; // Default 25 miles to match create meetup max radius

export function MeetupFilters({ filters, onFiltersChange }: MeetupFiltersProps) {
  const resetFilters = () => {
    onFiltersChange({
      searchQuery: '',
      hideFullMeetups: false,
      selectedTheme: undefined,
      searchRadiusMiles: DEFAULT_SEARCH_RADIUS
    });
  };

  const hasActiveFilters = filters.hideFullMeetups || 
    filters.selectedTheme || 
    filters.searchRadiusMiles !== DEFAULT_SEARCH_RADIUS;

  return (
    <div className="flex items-center gap-1 w-full min-w-0">
      <div className="relative flex-1 min-w-0">
        <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Search Meets..."
          value={filters.searchQuery}
          onChange={(e) => onFiltersChange({ ...filters, searchQuery: e.target.value })}
          className="w-full pl-8 pr-4 text-sm h-9"
        />
      </div>

      <Popover>
        <PopoverTrigger asChild>
          <Button 
            variant="outline" 
            size="icon"
            className={cn(
              "shrink-0 h-9 w-9 relative",
              hasActiveFilters && "border-primary text-primary"
            )}
          >
            <SlidersHorizontal className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[260px] p-3" align="end" side="bottom" sideOffset={4}>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-medium text-sm">Filters</h4>
              <Button
                variant="ghost"
                size="sm"
                onClick={resetFilters}
                className="h-7 px-2 text-muted-foreground hover:text-foreground text-xs"
              >
                <FilterX className="h-3 w-3 mr-1" />
                Reset
              </Button>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Theme</Label>
              <RadioGroup
                value={filters.selectedTheme || 'all'}
                onValueChange={(value) => onFiltersChange({
                  ...filters,
                  selectedTheme: value === 'all' ? undefined : value
                })}
                className="grid grid-cols-2 gap-1.5"
              >
                {themes.map((theme) => (
                  <div key={theme} className="flex items-center space-x-1.5">
                    <RadioGroupItem value={theme} id={`theme-${theme}`} />
                    <Label htmlFor={`theme-${theme}`} className="text-xs capitalize">
                      {theme}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Search Radius</Label>
                <span className="text-xs text-muted-foreground">{filters.searchRadiusMiles}mi</span>
              </div>
              <Slider
                value={[filters.searchRadiusMiles]}
                onValueChange={([value]) => onFiltersChange({ ...filters, searchRadiusMiles: value })}
                max={50}
                min={1}
                step={1}
                className="w-full"
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="hide-full" className="text-xs">Hide Full Meets</Label>
              <Switch
                id="hide-full"
                checked={filters.hideFullMeetups}
                onCheckedChange={(checked) => onFiltersChange({ ...filters, hideFullMeetups: checked })}
              />
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}