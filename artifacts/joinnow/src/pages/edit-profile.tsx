import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/hooks/use-user";
import { useLocation } from "wouter";
import { format } from "date-fns";

import { 
  Form, 
  FormControl, 
  FormDescription,
  FormField, 
  FormItem, 
  FormLabel, 
  FormMessage 
} from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, CalendarIcon, User } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ProfilePictureUpload } from "@/components/users/profile-picture-upload";

// Define the form validation schema
const profileFormSchema = z.object({
  displayName: z.string().max(50, {
    message: "Display name must be no more than 50 characters",
  }).optional(),
  bio: z.string().max(500, {
    message: "Bio must be no more than 500 characters",
  }).optional(),
  gender: z.enum(["Male", "Female", "Other"]).optional(),
  birthday: z.date().optional(),
  profilePicture: z.string().nullable().optional(),
});

// Type for form values
type ProfileFormValues = z.infer<typeof profileFormSchema>;

export default function EditProfilePage() {
  const { toast } = useToast();
  const { user } = useUser();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Set up the form with React Hook Form and zod validation
  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    mode: "onChange",
    defaultValues: {
      displayName: "",
      bio: "",
      gender: undefined,
      birthday: undefined,
      profilePicture: null,
    },
  });

  // Fetch the current user profile data
  const { data: profile, isLoading: isProfileLoading } = useQuery({
    queryKey: ['/api/users', user?.id, 'profile'],
    queryFn: async () => {
      console.log('Fetching profile for user:', user?.id);
      const res = await fetch(`/api/users/${user?.id}/profile`);
      if (!res.ok) {
        console.error('Profile fetch error:', await res.text());
        throw new Error(await res.text());
      }
      const data = await res.json();
      console.log('Received profile data:', data);
      return data;
    },
    enabled: !!user?.id,
  });

  // Update form values when profile data is loaded
  useEffect(() => {
    if (profile) {
      console.log('Setting form values with profile:', profile);
      form.reset({
        displayName: profile.displayName || "",
        bio: profile.bio || "",
        gender: profile.gender as "Male" | "Female" | "Other" | undefined,
        birthday: profile.birthday ? new Date(profile.birthday) : undefined,
        profilePicture: profile.profilePicture || null,
      });
    }
  }, [profile, form]);

  // Set up the mutation to update the profile
  const mutation = useMutation({
    mutationFn: async (values: ProfileFormValues) => {
      console.log('Updating profile for user:', user?.id);
      console.log('Update values:', values);
      
      setIsSubmitting(true);
      
      const res = await fetch(`/api/users/${user?.id}/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(values),
      });

      if (!res.ok) {
        const errorText = await res.text();
        console.error('Profile update error:', errorText);
        throw new Error(errorText);
      }

      return await res.json();
    },
    onSuccess: (data, variables) => {
      console.log('Profile updated successfully');
      
      // Check if the profile is now complete (gender and birthday)
      // If so, remove the profileWarningDismissed flag from localStorage
      if (variables.gender && variables.birthday) {
        console.log('Profile is now complete, clearing banner dismissal state');
        localStorage.removeItem('profileWarningDismissed');
      }
      
      queryClient.invalidateQueries({ queryKey: ['/api/users', user?.id, 'profile'] });
      queryClient.invalidateQueries({ queryKey: ['/api/user-status'] });
      
      toast({
        title: "Profile updated",
        description: "Your profile has been updated successfully.",
      });
      
      // Use a timeout to ensure the navigation happens after the state is updated
      setTimeout(() => {
        navigate('/profile');
      }, 50);
    },
    onError: (error: Error) => {
      console.error('Profile update error:', error);
      toast({
        title: "Failed to update profile",
        description: error.message || "An error occurred while updating your profile.",
        variant: "destructive",
      });
    },
    onSettled: () => {
      setIsSubmitting(false);
    }
  });

  // Form submission handler
  const onSubmit = (values: ProfileFormValues) => {
    mutation.mutate(values);
  };

  // Redirect if not logged in
  if (!user) {
    useEffect(() => {
      // Safer navigation with a small delay to ensure state is updated
      const timer = setTimeout(() => {
        navigate("/auth");
      }, 100);
      
      return () => clearTimeout(timer);
    }, []);
    
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center space-y-4">
          <User className="w-12 h-12 mx-auto text-muted-foreground" />
          <h1 className="text-xl font-semibold">Please Sign In</h1>
          <p className="text-muted-foreground">You need to be signed in to edit your profile</p>
          <Button onClick={() => navigate("/auth")}>Sign In</Button>
        </div>
      </div>
    );
  }

  // Show loading state
  if (isProfileLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="container max-w-3xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-6">Edit Profile</h1>
      
      <Card className="p-6">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Profile Picture Upload */}
            <FormField
              control={form.control}
              name="profilePicture"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Profile Picture</FormLabel>
                  <FormControl>
                    <ProfilePictureUpload
                      currentProfilePicture={field.value || undefined}
                      onChange={(url) => {
                        field.onChange(url);
                      }}
                      username={profile?.username || ""}
                    />
                  </FormControl>
                  <FormDescription>
                    Upload a profile picture to make your profile more recognizable.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            {/* Display Name Field */}
            <FormField
              control={form.control}
              name="displayName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Display Name</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="Your display name" 
                      {...field} 
                      value={field.value || ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            {/* Username Display Info (Read-only) */}
            <div className="text-sm text-muted-foreground mb-6">
              <p>Username: <span className="font-medium">{profile?.username}</span></p>
              <p className="mt-1">On your profile page, this will display as: <span className="font-medium">{form.watch("displayName") || profile?.username} ({profile?.username})</span></p>
              <p className="mt-1">In other areas, only your display name will be shown: <span className="font-medium">{form.watch("displayName") || profile?.username}</span></p>
            </div>

            {/* Gender Field */}
            <FormField
              control={form.control}
              name="gender"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Gender</FormLabel>
                  <Select 
                    onValueChange={field.onChange} 
                    defaultValue={field.value || undefined}
                    value={field.value || undefined}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select your gender" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="Male">Male</SelectItem>
                      <SelectItem value="Female">Female</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Birthday Field - Custom Implementation */}
            <FormField
              control={form.control}
              name="birthday"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Birthday</FormLabel>
                  <div className="flex flex-col space-y-2">
                    <div className="flex gap-2">
                      {/* Month Select */}
                      <Select
                        value={field.value ? (field.value.getMonth() + 1).toString() : undefined}
                        onValueChange={(monthValue) => {
                          const currentDate = field.value || new Date();
                          const newDate = new Date(currentDate);
                          newDate.setMonth(parseInt(monthValue) - 1);
                          field.onChange(newDate);
                        }}
                      >
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Month" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="1">January</SelectItem>
                          <SelectItem value="2">February</SelectItem>
                          <SelectItem value="3">March</SelectItem>
                          <SelectItem value="4">April</SelectItem>
                          <SelectItem value="5">May</SelectItem>
                          <SelectItem value="6">June</SelectItem>
                          <SelectItem value="7">July</SelectItem>
                          <SelectItem value="8">August</SelectItem>
                          <SelectItem value="9">September</SelectItem>
                          <SelectItem value="10">October</SelectItem>
                          <SelectItem value="11">November</SelectItem>
                          <SelectItem value="12">December</SelectItem>
                        </SelectContent>
                      </Select>
                      
                      {/* Day Select */}
                      <Select
                        value={field.value ? field.value.getDate().toString() : undefined}
                        onValueChange={(dayValue) => {
                          const currentDate = field.value || new Date();
                          const newDate = new Date(currentDate);
                          newDate.setDate(parseInt(dayValue));
                          field.onChange(newDate);
                        }}
                      >
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Day" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {Array.from({ length: 31 }, (_, i) => i + 1).map(day => (
                            <SelectItem key={day} value={day.toString()}>{day}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      
                      {/* Year Select */}
                      <Select
                        value={field.value ? field.value.getFullYear().toString() : undefined}
                        onValueChange={(yearValue) => {
                          const currentDate = field.value || new Date();
                          const newDate = new Date(currentDate);
                          newDate.setFullYear(parseInt(yearValue));
                          field.onChange(newDate);
                        }}
                      >
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Year" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="max-h-[200px]">
                          {Array.from({ length: 100 }, (_, i) => new Date().getFullYear() - i).map(year => (
                            <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    
                    {field.value && (
                      <div className="text-sm text-muted-foreground">
                        Selected: {format(field.value, "PPP")}
                      </div>
                    )}
                    
                    <FormDescription>
                      Your birthday will not be shown publicly.
                    </FormDescription>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Bio Field */}
            <FormField
              control={form.control}
              name="bio"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Bio</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Tell others about yourself" 
                      className="resize-none min-h-[120px]" 
                      {...field} 
                      value={field.value || ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Spacer (previous username info section was removed) */}
            <div className="pt-3"></div>

            <div className="flex justify-between items-center pt-4">
              <Button 
                type="button" 
                variant="outline" 
                onClick={(e) => {
                  e.preventDefault();
                  // Use a timeout to ensure the navigation happens after the current event cycle
                  setTimeout(() => {
                    navigate('/profile');
                  }, 50);
                }}
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={isSubmitting}
                className="ml-4"
              >
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Changes
              </Button>
            </div>
          </form>
        </Form>
      </Card>
    </div>
  );
}