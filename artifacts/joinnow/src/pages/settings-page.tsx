import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/hooks/use-user";
import { useAppearance } from "@/hooks/use-appearance";
import { Link, useLocation } from "wouter";

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
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Loader2, User, Bell, Eye, Shield, Moon, Sun, Key, Mail, Lock, UserCog, LogIn } from "lucide-react";

// Define the form validation schema for notification settings
const notificationSettingsSchema = z.object({
  emailNotifications: z.boolean().default(true),
  pushNotifications: z.boolean().default(true),
  meetupReminders: z.boolean().default(true),
  friendRequestNotifications: z.boolean().default(true),
  meetupJoinRequestNotifications: z.boolean().default(true),
  nearbyMeetupNotifications: z.boolean().default(true),
});

// Define the form validation schema for privacy settings
const privacySettingsSchema = z.object({
  showOnlineStatus: z.boolean().default(true),
  allowLocationSharing: z.boolean().default(true),
  showProfileToPublic: z.boolean().default(true),
  allowFriendRequests: z.boolean().default(true),
});

// Define the form validation schema for appearance settings
const appearanceSettingsSchema = z.object({
  darkMode: z.boolean().default(false),
  highContrastMode: z.boolean().default(false),
  fontSize: z.enum(["small", "medium", "large"]).default("medium"),
});

// Define the form validation schema for account settings
const accountSettingsSchema = z.object({
  email: z.string().email("Please enter a valid email address").optional(),
  currentPassword: z.string().min(6, "Password must be at least 6 characters").optional(),
  newPassword: z.string().min(6, "Password must be at least 6 characters").optional(),
  confirmPassword: z.string().optional(),
}).refine((data) => {
  // If any password field is filled, all password fields must be filled
  // This does not affect email updates - email can be updated independently
  if (data.newPassword || data.confirmPassword) {
    return !!(data.currentPassword && data.newPassword && data.confirmPassword);
  }
  return true;
}, {
  message: "All password fields are required when changing password",
  path: ["currentPassword"],
}).refine((data) => {
  // New password and confirm password must match if both are provided
  if (data.newPassword && data.confirmPassword) {
    return data.newPassword === data.confirmPassword;
  }
  return true;
}, {
  message: "New passwords do not match",
  path: ["confirmPassword"],
});

// Type for notification form values
type NotificationSettingsFormValues = z.infer<typeof notificationSettingsSchema>;

// Type for privacy form values
type PrivacySettingsFormValues = z.infer<typeof privacySettingsSchema>;

// Type for appearance form values
type AppearanceSettingsFormValues = z.infer<typeof appearanceSettingsSchema>;

// Type for account form values
type AccountSettingsFormValues = z.infer<typeof accountSettingsSchema>;

export default function SettingsPage() {
  const { toast } = useToast();
  const { user } = useUser();
  const { appearance, updateAppearance } = useAppearance();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("account");
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Set up the notification form with React Hook Form and zod validation
  const notificationForm = useForm<NotificationSettingsFormValues>({
    resolver: zodResolver(notificationSettingsSchema),
    mode: "onChange",
    defaultValues: {
      emailNotifications: true,
      pushNotifications: true,
      meetupReminders: true,
      friendRequestNotifications: true,
      meetupJoinRequestNotifications: true,
      nearbyMeetupNotifications: true,
    },
  });

  // Set up the privacy form with React Hook Form and zod validation
  const privacyForm = useForm<PrivacySettingsFormValues>({
    resolver: zodResolver(privacySettingsSchema),
    mode: "onChange",
    defaultValues: {
      showOnlineStatus: true,
      allowLocationSharing: true,
      showProfileToPublic: true,
      allowFriendRequests: true,
    },
  });

  // Set up the appearance form with React Hook Form and zod validation
  const appearanceForm = useForm<AppearanceSettingsFormValues>({
    resolver: zodResolver(appearanceSettingsSchema),
    mode: "onChange",
    defaultValues: {
      darkMode: false,
      highContrastMode: false,
      fontSize: "medium",
    },
  });
  
  // Set up the email form with React Hook Form and zod validation
  const emailForm = useForm<{ email: string }>({
    resolver: zodResolver(z.object({
      email: z.string().email("Please enter a valid email address").optional(),
    })),
    mode: "onChange",
    defaultValues: {
      email: user?.email || "",
    },
  });
  
  // Set up the password form with React Hook Form and zod validation
  const passwordForm = useForm<{
    currentPassword: string;
    newPassword: string;
    confirmPassword: string;
  }>({
    resolver: zodResolver(z.object({
      currentPassword: z.string().min(6, "Password must be at least 6 characters"),
      newPassword: z.string().min(6, "Password must be at least 6 characters"),
      confirmPassword: z.string(),
    }).refine((data) => data.newPassword === data.confirmPassword, {
      message: "Passwords don't match",
      path: ["confirmPassword"],
    })),
    mode: "onChange",
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  });

  // Fetch user profile data to get email
  const { data: profileData, isLoading: isProfileLoading } = useQuery({
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
    // Refetch every 30 seconds to ensure we have latest data
    refetchInterval: 30000,
  });

  // Update email form when profile data is loaded
  useEffect(() => {
    if (profileData && profileData.email) {
      emailForm.setValue('email', profileData.email);
    }
  }, [profileData, emailForm]);

  // Fetch the current user settings
  const { data: settings, isLoading: isSettingsLoading } = useQuery({
    queryKey: ['/api/users', user?.id, 'settings'],
    queryFn: async () => {
      console.log('Fetching settings for user:', user?.id);
      const res = await fetch(`/api/users/${user?.id}/settings`);
      
      if (!res.ok) {
        if (res.status === 404) {
          // If settings not found, return default settings
          return {
            notifications: notificationForm.getValues(),
            privacy: privacyForm.getValues(),
            appearance: appearanceForm.getValues(),
          };
        }
        console.error('Settings fetch error:', await res.text());
        throw new Error(await res.text());
      }
      
      const data = await res.json();
      console.log('Received settings data:', data);
      return data;
    },
    enabled: !!user?.id,
  });

  // Update form values when settings data is loaded
  useEffect(() => {
    if (settings) {
      if (settings.notifications) {
        notificationForm.reset(settings.notifications);
      }
      if (settings.privacy) {
        privacyForm.reset(settings.privacy);
      }
      if (settings.appearance) {
        appearanceForm.reset(settings.appearance);
      }
    }
  }, [settings, notificationForm, privacyForm, appearanceForm]);

  // Initialize appearance form with current appearance settings from useAppearance hook
  useEffect(() => {
    if (appearance) {
      appearanceForm.reset(appearance);
    }
  }, [appearance, appearanceForm]);

  // Apply appearance settings to the app
  const applyAppearanceSettings = (appearance: AppearanceSettingsFormValues) => {
    // Apply dark mode
    if (appearance.darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }

    // Apply high contrast mode
    if (appearance.highContrastMode) {
      document.documentElement.classList.add('high-contrast');
    } else {
      document.documentElement.classList.remove('high-contrast');
    }

    // Apply font size
    document.documentElement.classList.remove('text-sm', 'text-base', 'text-lg');
    switch (appearance.fontSize) {
      case 'small':
        document.documentElement.classList.add('text-sm');
        break;
      case 'medium':
        document.documentElement.classList.add('text-base');
        break;
      case 'large':
        document.documentElement.classList.add('text-lg');
        break;
    }
  };

  // Set up the mutation to update notification settings
  const notificationMutation = useMutation({
    mutationFn: async (values: NotificationSettingsFormValues) => {
      console.log('Updating notification settings for user:', user?.id);
      console.log('Update values:', values);
      
      setIsSubmitting(true);
      
      const res = await fetch(`/api/users/${user?.id}/settings/notifications`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(values),
      });

      if (!res.ok) {
        const errorText = await res.text();
        console.error('Notification settings update error:', errorText);
        throw new Error(errorText);
      }

      return await res.json();
    },
    onSuccess: () => {
      console.log('Notification settings updated successfully');
      queryClient.invalidateQueries({ queryKey: ['/api/users', user?.id, 'settings'] });
      toast({
        title: "Notification settings updated",
        description: "Your notification preferences have been saved.",
      });
    },
    onError: (error: Error) => {
      console.error('Notification settings update error:', error);
      toast({
        title: "Failed to update notification settings",
        description: error.message || "An error occurred while updating your notification settings.",
        variant: "destructive",
      });
    },
    onSettled: () => {
      setIsSubmitting(false);
    }
  });

  // Set up the mutation to update privacy settings
  const privacyMutation = useMutation({
    mutationFn: async (values: PrivacySettingsFormValues) => {
      console.log('Updating privacy settings for user:', user?.id);
      console.log('Update values:', values);
      
      setIsSubmitting(true);
      
      const res = await fetch(`/api/users/${user?.id}/settings/privacy`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(values),
      });

      if (!res.ok) {
        const errorText = await res.text();
        console.error('Privacy settings update error:', errorText);
        throw new Error(errorText);
      }

      return await res.json();
    },
    onSuccess: () => {
      console.log('Privacy settings updated successfully');
      queryClient.invalidateQueries({ queryKey: ['/api/users', user?.id, 'settings'] });
      toast({
        title: "Privacy settings updated",
        description: "Your privacy preferences have been saved.",
      });
    },
    onError: (error: Error) => {
      console.error('Privacy settings update error:', error);
      toast({
        title: "Failed to update privacy settings",
        description: error.message || "An error occurred while updating your privacy settings.",
        variant: "destructive",
      });
    },
    onSettled: () => {
      setIsSubmitting(false);
    }
  });

  // Set up the mutation to update appearance settings
  const appearanceMutation = useMutation({
    mutationFn: async (values: AppearanceSettingsFormValues) => {
      console.log('Updating appearance settings for user:', user?.id);
      console.log('Update values:', values);
      
      setIsSubmitting(true);
      
      const res = await fetch(`/api/users/${user?.id}/settings/appearance`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(values),
      });

      if (!res.ok) {
        const errorText = await res.text();
        console.error('Appearance settings update error:', errorText);
        throw new Error(errorText);
      }

      return await res.json();
    },
    onSuccess: (data, variables) => {
      console.log('Appearance settings updated successfully');
      queryClient.invalidateQueries({ queryKey: ['/api/users', user?.id, 'settings'] });
      toast({
        title: "Appearance settings updated",
        description: "Your appearance preferences have been saved.",
      });
      
      // Apply the appearance settings
      applyAppearanceSettings(variables);
    },
    onError: (error: Error) => {
      console.error('Appearance settings update error:', error);
      toast({
        title: "Failed to update appearance settings",
        description: error.message || "An error occurred while updating your appearance settings.",
        variant: "destructive",
      });
    },
    onSettled: () => {
      setIsSubmitting(false);
    }
  });

  // Form submission handlers
  const onSubmitNotifications = (values: NotificationSettingsFormValues) => {
    notificationMutation.mutate(values);
  };

  const onSubmitPrivacy = (values: PrivacySettingsFormValues) => {
    privacyMutation.mutate(values);
  };

  const onSubmitAppearance = (values: AppearanceSettingsFormValues) => {
    // Use our enhanced useAppearance hook to update the appearance
    updateAppearance(values);
    
    // Show success toast
    toast({
      title: "Appearance settings updated",
      description: "Your appearance preferences have been saved.",
    });
  };
  
  // Mutation for email updates
  const emailMutation = useMutation({
    mutationFn: async (email: string) => {
      console.log('Updating email for user:', user?.id);
      console.log('New email:', email);
      
      setIsSubmitting(true);
      
      const res = await fetch(`/api/users/${user?.id}/account`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        console.error('Email update error:', errorText);
        throw new Error(errorText);
      }

      return await res.json();
    },
    onSuccess: (data, email) => {
      console.log('Email updated successfully to:', email);
      // Invalidate both profile and user queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['/api/users', user?.id, 'profile'] });
      queryClient.invalidateQueries({ queryKey: ['/api/users', user?.id] });
      
      // Update form with new email to reflect changes immediately
      emailForm.setValue('email', email);
      
      toast({
        title: "Email updated",
        description: "Your email address has been successfully updated to " + email,
      });
    },
    onError: (error: Error) => {
      console.error('Email update error:', error);
      toast({
        title: "Failed to update email",
        description: error.message || "An error occurred while updating your email.",
        variant: "destructive",
      });
    },
    onSettled: () => {
      setIsSubmitting(false);
    }
  });
  
  // Mutation for password updates
  const passwordMutation = useMutation({
    mutationFn: async (passwordData: {
      currentPassword: string;
      newPassword: string;
      confirmPassword: string;
    }) => {
      console.log('Updating password for user:', user?.id);
      
      setIsSubmitting(true);
      
      const res = await fetch(`/api/users/${user?.id}/account`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(passwordData),
      });

      if (!res.ok) {
        const errorText = await res.text();
        console.error('Password update error:', errorText);
        throw new Error(errorText);
      }

      return await res.json();
    },
    onSuccess: () => {
      console.log('Password updated successfully');
      queryClient.invalidateQueries({ queryKey: ['/api/users', user?.id] });
      toast({
        title: "Password updated",
        description: "Your password has been successfully updated.",
      });
      
      // Reset password fields after successful update
      passwordForm.setValue('currentPassword', '');
      passwordForm.setValue('newPassword', '');
      passwordForm.setValue('confirmPassword', '');
    },
    onError: (error: Error) => {
      console.error('Password update error:', error);
      toast({
        title: "Failed to update password",
        description: error.message || "An error occurred while updating your password.",
        variant: "destructive",
      });
    },
    onSettled: () => {
      setIsSubmitting(false);
    }
  });
  
  // Handle email update
  const handleEmailUpdate = () => {
    const email = emailForm.getValues('email');
    if (email) {
      emailMutation.mutate(email);
    }
  };
  
  // Handle password update
  const handlePasswordUpdate = () => {
    const { currentPassword, newPassword, confirmPassword } = passwordForm.getValues();
    
    // Validate password fields
    if (!currentPassword || !newPassword || !confirmPassword) {
      toast({
        title: "Incomplete form",
        description: "All password fields are required when changing password.",
        variant: "destructive",
      });
      return;
    }
    
    if (newPassword !== confirmPassword) {
      toast({
        title: "Password mismatch",
        description: "New passwords do not match.",
        variant: "destructive",
      });
      return;
    }
    
    passwordMutation.mutate({ currentPassword, newPassword, confirmPassword });
  };

  // Redirect if not logged in
  if (!user) {
    return (
      <div className="p-4 space-y-4">
        <h2 className="text-2xl font-bold">Settings</h2>
        <div className="flex flex-col items-center justify-center p-8 text-center">
          <UserCog className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold">Sign in to access settings</h3>
          <p className="text-muted-foreground mb-4">
            Customize your profile, notifications, privacy, and appearance preferences
          </p>
          <Link to="/auth" className="inline-flex">
            <Button className="gap-2">
              <LogIn className="h-4 w-4" />
              Sign In
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  // Show loading state
  if (isSettingsLoading || isProfileLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="container max-w-4xl mx-auto p-4">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Settings</h1>
      </div>
      
      <Tabs defaultValue="account" value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full md:w-auto md:inline-flex grid-cols-4">
          <TabsTrigger value="account" className="flex items-center gap-2">
            <UserCog className="h-4 w-4" />
            <span className="hidden sm:inline">Account</span>
          </TabsTrigger>
          <TabsTrigger value="notifications" className="flex items-center gap-2">
            <Bell className="h-4 w-4" />
            <span className="hidden sm:inline">Notifications</span>
          </TabsTrigger>
          <TabsTrigger value="privacy" className="flex items-center gap-2">
            <Shield className="h-4 w-4" />
            <span className="hidden sm:inline">Privacy</span>
          </TabsTrigger>
          <TabsTrigger value="appearance" className="flex items-center gap-2">
            <Eye className="h-4 w-4" />
            <span className="hidden sm:inline">Appearance</span>
          </TabsTrigger>
        </TabsList>

        {/* Account Settings */}
        <TabsContent value="account">
          <Card>
            <CardHeader>
              <CardTitle>Account Settings</CardTitle>
              <CardDescription>
                Manage your personal information and security settings.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-8">
                {/* Email Form */}
                <Form {...emailForm}>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-medium">Email Address</h3>
                      {profileData?.email && (
                        <Badge variant="outline" className="font-normal">
                          Current: {profileData.email}
                        </Badge>
                      )}
                    </div>
                    
                    <FormField
                      control={emailForm.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="your.email@example.com" 
                              {...field}
                              value={field.value || ''}
                              className="w-full"
                              type="email"
                            />
                          </FormControl>
                          <FormDescription>
                            Your email address is used for account recovery and notifications.
                            {!profileData?.email && (
                              <span className="text-amber-500 ml-1 font-medium">
                                No email set. Adding an email is recommended for account recovery.
                              </span>
                            )}
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <Button 
                      type="button" 
                      onClick={handleEmailUpdate} 
                      disabled={isSubmitting || emailMutation.isPending || !emailForm.getValues('email')}
                      className="w-full mt-2"
                    >
                      {emailMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      {profileData?.email ? 'Update Email' : 'Add Email'}
                    </Button>
                  </div>
                </Form>

                <Separator />

                {/* Password Form */}
                <Form {...passwordForm}>
                  <div className="space-y-4">
                    <h3 className="text-lg font-medium">Change Password</h3>
                    <FormField
                      control={passwordForm.control}
                      name="currentPassword"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Current Password</FormLabel>
                          <FormControl>
                            <Input
                              type="password"
                              placeholder="••••••••" 
                              {...field}
                              className="w-full"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={passwordForm.control}
                      name="newPassword"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>New Password</FormLabel>
                          <FormControl>
                            <Input
                              type="password"
                              placeholder="••••••••" 
                              {...field}
                              className="w-full"
                            />
                          </FormControl>
                          <FormDescription>
                            Password must be at least 6 characters long.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={passwordForm.control}
                      name="confirmPassword"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Confirm New Password</FormLabel>
                          <FormControl>
                            <Input
                              type="password"
                              placeholder="••••••••" 
                              {...field}
                              className="w-full"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <Button 
                      type="button" 
                      onClick={handlePasswordUpdate} 
                      disabled={isSubmitting || passwordMutation.isPending}
                      className="w-full mt-2"
                    >
                      {passwordMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Update Password
                    </Button>
                  </div>
                </Form>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        {/* Notification Settings */}
        <TabsContent value="notifications">
          <Card>
            <CardHeader>
              <CardTitle>Notification Settings</CardTitle>
              <CardDescription>
                Manage how and when you receive notifications.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...notificationForm}>
                <form onSubmit={notificationForm.handleSubmit(onSubmitNotifications)} className="space-y-4">
                  <FormField
                    control={notificationForm.control}
                    name="emailNotifications"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">Email Notifications</FormLabel>
                          <FormDescription>
                            Receive notifications via email
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={notificationForm.control}
                    name="pushNotifications"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">Push Notifications</FormLabel>
                          <FormDescription>
                            Receive notifications on your device
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={notificationForm.control}
                    name="meetupReminders"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
        <FormLabel className="text-base">Meet Reminders</FormLabel>
                          <FormDescription>
          Get reminders about upcoming Meets
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={notificationForm.control}
                    name="friendRequestNotifications"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">Friend Requests</FormLabel>
                          <FormDescription>
                            Get notified about new friend requests
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={notificationForm.control}
                    name="meetupJoinRequestNotifications"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
        <FormLabel className="text-base">Meet Join Requests</FormLabel>
                          <FormDescription>
          Get notified when someone requests to join your Meet
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={notificationForm.control}
                    name="nearbyMeetupNotifications"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
        <FormLabel className="text-base">Nearby Meets</FormLabel>
                          <FormDescription>
          Get notified about new Meets in your area
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  
                  <Button type="submit" disabled={isSubmitting} className="w-full">
                    {isSubmitting && notificationMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Save Notification Settings
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        </TabsContent>
        
        {/* Privacy Settings */}
        <TabsContent value="privacy">
          <Card>
            <CardHeader>
              <CardTitle>Privacy Settings</CardTitle>
              <CardDescription>
                Control who can see your information and how your data is used.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...privacyForm}>
                <form onSubmit={privacyForm.handleSubmit(onSubmitPrivacy)} className="space-y-4">
                  <FormField
                    control={privacyForm.control}
                    name="showOnlineStatus"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">Show Online Status</FormLabel>
                          <FormDescription>
                            Let others see when you're online
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={privacyForm.control}
                    name="allowLocationSharing"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">Location Sharing</FormLabel>
                          <FormDescription>
        Share your location with others in active Meets
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={privacyForm.control}
                    name="showProfileToPublic"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">Public Profile</FormLabel>
                          <FormDescription>
                            Allow anyone to view your profile
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={privacyForm.control}
                    name="allowFriendRequests"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">Friend Requests</FormLabel>
                          <FormDescription>
                            Allow others to send you friend requests
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  
                  <Button type="submit" disabled={isSubmitting} className="w-full">
                    {isSubmitting && privacyMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Save Privacy Settings
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        </TabsContent>
        
        {/* Appearance Settings */}
        <TabsContent value="appearance">
          <Card>
            <CardHeader>
              <CardTitle>Appearance Settings</CardTitle>
              <CardDescription>
                Customize how the application looks and feels.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...appearanceForm}>
                <form onSubmit={appearanceForm.handleSubmit(onSubmitAppearance)} className="space-y-4">
                  <FormField
                    control={appearanceForm.control}
                    name="darkMode"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">Dark Mode</FormLabel>
                          <FormDescription className="flex items-center gap-2">
                            {field.value ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
                            {field.value ? "Switch to light mode" : "Switch to dark mode"}
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={appearanceForm.control}
                    name="highContrastMode"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">High Contrast Mode</FormLabel>
                          <FormDescription>
                            Increase contrast for better visibility
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={appearanceForm.control}
                    name="fontSize"
                    render={({ field }) => (
                      <FormItem className="rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">Font Size</FormLabel>
                          <FormDescription>
                            Adjust the text size
                          </FormDescription>
                        </div>
                        <div className="grid grid-cols-3 gap-2 pt-2">
                          <Button 
                            type="button"
                            variant={field.value === "small" ? "default" : "outline"}
                            className="w-full text-sm"
                            onClick={() => field.onChange("small")}
                          >
                            Small
                          </Button>
                          <Button 
                            type="button"
                            variant={field.value === "medium" ? "default" : "outline"}
                            className="w-full text-base"
                            onClick={() => field.onChange("medium")}
                          >
                            Medium
                          </Button>
                          <Button 
                            type="button"
                            variant={field.value === "large" ? "default" : "outline"}
                            className="w-full text-lg"
                            onClick={() => field.onChange("large")}
                          >
                            Large
                          </Button>
                        </div>
                      </FormItem>
                    )}
                  />
                  
                  <Button type="submit" disabled={isSubmitting} className="w-full">
                    {isSubmitting && appearanceMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Save Appearance Settings
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}