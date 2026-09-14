import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, Loader2, Clock, MapPin, HelpCircle } from "lucide-react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useState } from "react";
import { useMeetups } from "@/hooks/use-meetups";
import * as z from "zod";
import { LocationPicker } from '@/components/map/location-picker';
import { useToast } from "@/hooks/use-toast";

const createMeetupSchema = z.object({
  title: z.string().min(1, "Title is required").max(100, "Title is too long"),
  description: z.string().min(1, "Description is required").max(280, "Bio cannot exceed 280 characters"),
  isPrivate: z.boolean().default(false),
  theme: z.string().min(1, "Theme is required"),
  maxParticipants: z.number().min(2, "Minimum 2 participants required").max(100, "Maximum 100 participants allowed"),
  location: z.object({
    latitude: z.number(),
    longitude: z.number(),
    radius: z.number().min(0.5, "Minimum radius is 0.5 miles").max(25, "Maximum radius is 25 miles"),
    address: z.string().min(1, "Please select a valid location")
  }),
  duration: z.number().min(1, "Minimum duration is 1 hour").max(24, "Maximum duration is 24 hours"),
  // New filter fields
  useFilters: z.boolean().default(false),
  genderFilter: z.enum(['Male', 'Female', 'Other', 'All']).optional(),
  minAgeFilter: z.number().min(18).max(100).optional(),
  maxAgeFilter: z.number().min(18).max(100).optional()
});

const DURATION_OPTIONS = Array.from({length: 47}, (_, i) => ({
  value: (i + 2) / 2,
  label: `${Math.floor((i + 2) / 2)}${(i + 2) % 2 ? '.5' : ''} hours`
}));

const THEMES = [
  "Technology",
  "Social",
  "Professional",
  "Education",
  "Sports",
  "Arts",
  "Gaming",
  "Music",
  "Food",
  "Other"
];

function generateRandomLocation(
  centerLat: number,
  centerLng: number,
  radiusMiles: number
): { latitude: number; longitude: number } {
  const radiusInDegrees = radiusMiles / 69;
  const angle = Math.random() * 2 * Math.PI;
  const randomRadius = Math.sqrt(Math.random()) * radiusInDegrees;
  const latOffset = randomRadius * Math.cos(angle);
  const lngOffset = randomRadius * Math.sin(angle) / Math.cos(centerLat * Math.PI / 180);
  return {
    latitude: centerLat + latOffset,
    longitude: centerLng + lngOffset
  };
}

export function CreateMeetupDialog({ 
  open, 
  onOpenChange, 
  initialLocation, 
  onAfterCreate,
  groupId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialLocation?: { latitude: number; longitude: number; } | null;
  onAfterCreate?: () => void;
  /** When present, use the same form to create a meetup for this group. */
  groupId?: number | null;
}) {
  const [isAdjustingRadius, setIsAdjustingRadius] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const { createMeetup } = useMeetups();
  const { toast } = useToast();
  const defaultMapZoom = 13; // Assuming this value is appropriately defined

  const form = useForm<z.infer<typeof createMeetupSchema>>({
    resolver: zodResolver(createMeetupSchema),
    defaultValues: {
      isPrivate: false,
      maxParticipants: 10,
      duration: 2,
      location: {
        latitude: initialLocation?.latitude ?? 41.4993,
        longitude: initialLocation?.longitude ?? -81.6944,
        radius: 1,
        address: ""
      },
      useFilters: false,
      genderFilter: 'All',
      minAgeFilter: 18,
      maxAgeFilter: 100
    }
  });

  const onSubmit = async (values: z.infer<typeof createMeetupSchema>) => {
    // Validate that a proper location was selected
    if (!values.location.address) {
      setLocationError("Please select a valid location from the map");
      return;
    }

    const { latitude, longitude } = generateRandomLocation(
      values.location.latitude,
      values.location.longitude,
      values.location.radius
    );

    const meetupData = {
      title: values.title,
      description: values.description,
      theme: values.theme,
      maxParticipants: values.maxParticipants,
      isPrivate: values.isPrivate,
      latitude,
      longitude,
      exactLocation: values.location.address,
      expiresAt: new Date(Date.now() + values.duration * 60 * 60 * 1000),
      radius: values.location.radius,
      duration: values.duration,
      // Add demographic filters if enabled
      ...(values.useFilters && {
        genderFilter: values.genderFilter,
        minAgeFilter: values.minAgeFilter,
        maxAgeFilter: values.maxAgeFilter
      })
    };

    try {
      await createMeetup({ ...meetupData, ...(groupId ? { groupId } : {}) });
      toast({
        title: "Success",
        description: "Your Meet has been created!",
      });
      form.reset();
      onOpenChange(false);
      if (onAfterCreate) {
        onAfterCreate();
      }
    } catch (error) {
      console.error('Error creating meetup:', error);
      let errorMessage = "Failed to create Meet";
      if (error instanceof Error) {
        errorMessage = error.message;
      }
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  const handleDialogClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  // Log the current location values to help with debugging
  console.log("Create meetup form location values:", form.watch("location"));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent 
        className="h-[90dvh] max-h-[90dvh] p-0 sm:max-w-[425px] !flex min-h-0 flex-col gap-0 overflow-hidden"
        onClick={handleDialogClick}
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex min-h-0 flex-1 flex-col"
            onClick={handleDialogClick}
          >
            <div className="flex-shrink-0 border-b">
              <DialogHeader className="px-6 py-4">
                <DialogTitle>Create a New Meet</DialogTitle>
              </DialogHeader>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-4">
              <div className="space-y-4" onClick={handleDialogClick}>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Location</label>
                  {locationError && (
                    <Alert variant="destructive">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription>{locationError}</AlertDescription>
                    </Alert>
                  )}
                  <LocationPicker
                    onChange={(location) => {
                      console.log("LocationPicker onChange called with:", location);
                      setLocationError(null);
                      form.setValue("location", {
                        ...form.getValues("location"),
                        latitude: location.latitude,
                        longitude: location.longitude,
                        address: location.address || "",
                      }, { shouldValidate: true });
                    }}
                    radius={form.watch("location.radius")}
                    isAdjusting={isAdjustingRadius}
                    initialLocation={initialLocation}
                    defaultZoom={defaultMapZoom}
                  />
                  {form.formState.errors.location?.latitude && (
                    <p className="text-sm text-destructive">
                      {form.formState.errors.location.latitude.message}
                    </p>
                  )}
                  {form.formState.errors.location?.longitude && (
                    <p className="text-sm text-destructive">
                      {form.formState.errors.location.longitude.message}
                    </p>
                  )}
                  {form.formState.errors.location?.address && (
                    <p className="text-sm text-destructive">
                      {form.formState.errors.location.address.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <div>
                    <label className="text-sm font-medium">Location Radius (miles)</label>
                    <p className="text-xs text-muted-foreground mt-1">We'll place your meet randomly within this radius for privacy.</p>
                  </div>
                  
                  <div className="flex items-center gap-4">
                    <div className="flex-1">
                      <Slider
                        value={[form.watch("location.radius")]}
                        onValueChange={([value]) => {
                          form.setValue("location.radius", value, { shouldValidate: true });
                          setIsAdjustingRadius(true);
                        }}
                        onPointerUp={() => setIsAdjustingRadius(false)}
                        max={25}
                        min={0.5}
                        step={0.5}
                      />
                    </div>
                    <div className="w-12 text-sm">
                      {form.watch("location.radius")}mi
                    </div>
                  </div>
                  {form.formState.errors.location?.radius && (
                    <p className="text-sm text-destructive">
                      {form.formState.errors.location.radius.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Title</label>
                  <Input {...form.register("title")} placeholder="Enter Meet title" />
                  {form.formState.errors.title && (
                    <p className="text-sm text-destructive">{form.formState.errors.title.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Description</label>
                  <Textarea
                    {...form.register("description")}
                    placeholder="What's this Meet about?"
                    className="h-20"
                    maxLength={280}
                  />
                  {form.formState.errors.description && (
                    <p className="text-sm text-destructive">{form.formState.errors.description.message}</p>
                  )}
                </div>

                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">Private Meet</label>
                  <Switch
                    checked={form.watch("isPrivate")}
                    onCheckedChange={(checked) => form.setValue("isPrivate", checked)}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Theme</label>
                  <Select
                    value={form.watch("theme")}
                    onValueChange={(value) => form.setValue("theme", value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a theme" />
                    </SelectTrigger>
                    <SelectContent>
                      {THEMES.map((theme) => (
                        <SelectItem key={theme} value={theme.toLowerCase()}>{theme}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {form.formState.errors.theme && (
                    <p className="text-sm text-destructive">{form.formState.errors.theme.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    Duration
                  </label>
                  <Select
                    value={form.watch("duration")?.toString()}
                    onValueChange={(value) => form.setValue("duration", parseFloat(value))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select duration" />
                    </SelectTrigger>
                    <SelectContent>
                      {DURATION_OPTIONS.map(({ value, label }) => (
                        <SelectItem key={value} value={value.toString()}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {form.formState.errors.duration && (
                    <p className="text-sm text-destructive">{form.formState.errors.duration.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Maximum Participants</label>
                  <Input
                    type="number"
                    {...form.register("maxParticipants", { valueAsNumber: true })}
                    placeholder="Enter max participants"
                    min={2}
                    max={100}
                  />
                  {form.formState.errors.maxParticipants && (
                    <p className="text-sm text-destructive">{form.formState.errors.maxParticipants.message}</p>
                  )}
                </div>

                {/* Demographic Filter Controls */}
                <div className="border-t pt-4 mt-4">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-sm font-medium">Demographic Filters</h3>
                      <p className="text-xs text-muted-foreground">Limit who can see this meet</p>
                    </div>
                    <Switch
                      checked={form.watch("useFilters")}
                      onCheckedChange={(checked) => form.setValue("useFilters", checked)}
                    />
                  </div>

                  {form.watch("useFilters") && (
                    <div className="space-y-4 mt-4 pl-2 border-l-2 border-primary/20">
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Gender Filter</label>
                        <Select
                          value={form.watch("genderFilter") || 'All'}
                          onValueChange={(value) => form.setValue("genderFilter", value as 'Male' | 'Female' | 'Other' | 'All')}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="All" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="All">All</SelectItem>
                            <SelectItem value="Male">Male</SelectItem>
                            <SelectItem value="Female">Female</SelectItem>
                            <SelectItem value="Other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <label className="text-sm font-medium">Age Range</label>
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            placeholder="Min age"
                            min={18}
                            max={100}
                            value={form.watch("minAgeFilter") || 18}
                            onChange={(e) => form.setValue("minAgeFilter", parseInt(e.target.value))}
                            className="w-24"
                          />
                          <span>to</span>
                          <Input
                            type="number"
                            placeholder="Max age"
                            min={18}
                            max={100}
                            value={form.watch("maxAgeFilter") || 100}
                            onChange={(e) => form.setValue("maxAgeFilter", parseInt(e.target.value))}
                            className="w-24"
                          />
                        </div>
                        {form.formState.errors.minAgeFilter && (
                          <p className="text-sm text-destructive">{form.formState.errors.minAgeFilter.message}</p>
                        )}
                        {form.formState.errors.maxAgeFilter && (
                          <p className="text-sm text-destructive">{form.formState.errors.maxAgeFilter.message}</p>
                        )}
                        {Number(form.watch("minAgeFilter")) > Number(form.watch("maxAgeFilter")) && (
                          <p className="text-sm text-destructive">Minimum age cannot be greater than maximum age</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-shrink-0 items-center justify-center border-t bg-background px-6 py-4">
              <Button
                type="submit"
                className="w-auto min-w-44"
                data-testid="button-create-meet"
                disabled={form.formState.isSubmitting}
                onClick={handleDialogClick}
              >
                {form.formState.isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Create Meet"
                )}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}