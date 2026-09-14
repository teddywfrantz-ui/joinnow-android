import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Lock, Check } from "lucide-react";

// Custom useMediaQuery hook
function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const media = window.matchMedia(query);
    if (media.matches !== matches) {
      setMatches(media.matches);
    }
    
    const listener = () => {
      setMatches(media.matches);
    };
    
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, [matches, query]);

  return matches;
}
import { useParams, useLocation, Link } from "wouter";
import { Card } from "@/components/ui/card";
import { ProfileAvatar } from "@/components/common/profile-avatar";
import { Badge } from "@/components/ui/badge";
import { 
  Clock, 
  Medal, 
  ThumbsUp, 
  UserCircle2,
  User,
  Loader2, 
  LogIn,
  MapPin, 
  Users, 
  Camera, 
  Code, 
  Book,
  Coffee,
  Music,
  Utensils,
  Film,
  Dumbbell,
  Palette,
  ShoppingBag,
  Heart,
  Gamepad2,
  Mail,
  Calendar,
  Star,
  Award,
  Activity,
  Gift,
  Zap,
  MessageSquare,
  Globe,
  Info,
  Settings2,
  PenTool,
  AlertCircle,
  ListFilter,
  Crown,
  Diamond,
  Network,
  UserPlus,
  MessageCircle,
  Compass,
  FileText,
  CalendarDays,
  Layout,
  ShieldCheck,
  UsersRound,
  Rocket,
  Trophy,
  CircleDashed,
  Tag,
  CheckCircle2,
  MessagesSquare,
  CalendarClock,
  Gem,
  Map
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDistanceToNow } from "date-fns";
import { useUser } from "@/hooks/use-user";
import { Button } from "@/components/ui/button";
import { type UserStats } from "@/lib/types/stats";

interface Trait {
  traitId: number;
  traitName: string;
  traitCategory: string;
  endorsements: number;
  totalVotes: number;
  endorsers: string[];
}

interface Rating {
  id: number;
  rating: number;
  comment: string;
  raterUsername: string;
  meetupTitle: string;
  createdAt: string;
}

interface RatingResponse {
  ratings: Rating[];
  averageRating: number | null;
  totalRatings: number;
}

interface MeetHistoryEntry {
  id: number;
  userId: number;
  meetupId: number;
  joinedAt: string;
  leftAt?: string;
  createdAt: string;
  meetup: {
    title: string;
    theme: string;
    creator: string;
  };
}

interface ProfileData {
  id: number;
  username: string;
  displayName?: string;
  createdAt: string;
  bio?: string;
  location?: string;
  gender?: string;
  birthday?: string;
  interests?: string[];
  email?: string;
  meetHistory?: MeetHistoryEntry[];
  traits?: Trait[];
  website?: string;
  status?: string;
  profilePicture?: string | null;
}

const profileRedirectRoutes = [
  "map",
  "active-meet",
  "friends",
  "groups",
  "settings",
  "leaderboard",
  "leaderboards",
];

// Simulated achievements that would typically come from the backend
interface Achievement {
  id: number;
  name: string;
  description: string;
  icon: JSX.Element;
  tier?: 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond';
  earnedAt?: string;
  progress?: number;
  maxProgress?: number;
  isUnlocked: boolean;
}

function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return 'Unknown date';
  try {
    const date = new Date(dateString);
    // Format: Mar 2, 2025 at 11:45 AM
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      hour12: true
    }).format(date);
  } catch (error) {
    console.error('Error formatting date:', error);
    return 'Invalid date';
  }
}

// Function to check if a tier is unlocked based on completion of all achievements in lower tiers
function isTierUnlocked(tier: string, achievements: Achievement[]): boolean {
  const tiers = ['bronze', 'silver', 'gold', 'platinum', 'diamond'];
  const tierIndex = tiers.indexOf(tier);
  
  if (tierIndex === 0) return true; // Bronze tier is always available
  
  // Check if all achievements in previous tiers are completed
  for (let i = 0; i < tierIndex; i++) {
    const previousTier = tiers[i];
    const previousTierAchievements = achievements.filter(a => a.tier === previousTier);
    
    // If any achievement in the previous tier is not unlocked, the current tier is locked
    if (previousTierAchievements.some(a => !a.isUnlocked)) {
      return false;
    }
  }
  
  return true;
}

// Function to check if an individual achievement should be considered completed but not yet recognized
// This handles the case where users have completed higher tier achievements but haven't unlocked lower tiers yet
function isAchievementCompleted(achievement: Achievement): boolean {
  // If achievement is marked as unlocked, it's officially completed
  if (achievement.isUnlocked) return true;
  
  // If it has progress tracking and progress is equal or greater than max, it's technically completed
  // but might not be officially recognized due to tier requirements
  if (achievement.progress !== undefined && 
      achievement.maxProgress !== undefined && 
      achievement.progress >= achievement.maxProgress) {
    return true;
  }
  
  return false;
}

interface TraitCardProps {
  trait: Trait;
}

function TraitCard({ trait }: TraitCardProps) {
  const [showRaters, setShowRaters] = useState(false);

  return (
    <Card key={trait.traitId} className="p-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-lg">{trait.traitName}</h3>
            <Badge variant="secondary">{trait.traitCategory}</Badge>
          </div>
          <div className="flex items-center gap-3 mt-2">
            <div 
              className="flex items-center gap-1 text-sm text-muted-foreground"
              title="Total interactions"
            >
              <span>{trait.totalVotes || 0}</span>
              <span className="text-xs">total ratings</span>
            </div>
            <button
              onClick={() => setShowRaters(!showRaters)}
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
              title="Net ratings"
            >
              <ThumbsUp className="w-4 h-4" />
              <span>{trait.endorsements}</span> {/* Using existing prop but displaying as ratings */}
            </button>
          </div>
          {showRaters && trait.endorsers?.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {trait.endorsers.map((rater: string, i: number) => (
                <Badge key={i} variant="outline" className="text-xs">
                  {rater}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

export default function ProfilePage() {
  const { userId } = useParams();
  const [activeTab, setActiveTab] = useState("achievements");
  const { user: currentUser } = useUser();
  const [location, navigate] = useLocation();
  const isMobile = useMediaQuery('(max-width: 640px)');
  
  // Extract userId from path and normalize it
  console.log("ProfilePage - userId from path:", userId);
  
  // Determine which user profile to show - either the specified user or current user
  // Check if userId is valid (a numeric string) before processing
  const isNumericUserId = userId ? !isNaN(parseInt(userId)) : false;
  
  // Only proceed if userId is numeric or "me"
  const targetUserId = userId ? 
    (userId === "me" && currentUser ? currentUser.id : 
      (isNumericUserId ? parseInt(userId) : null)) : 
    (currentUser ? currentUser.id : null);
  
  console.log("ProfilePage - targetUserId after normalization:", targetUserId);
  
  // If the userId is not a valid profile ID but matches a route, redirect
  useEffect(() => {
    if (userId && !isNumericUserId && userId !== "me") {
      if (profileRedirectRoutes.includes(userId)) {
        console.log("ProfilePage - detected route instead of userId, redirecting to:", userId);
        navigate(`/${userId}`);
      }
    }
  }, [userId, navigate]);
  
  // Convert to numeric ID and validate
  const numericUserId = typeof targetUserId === 'string' ? parseInt(targetUserId) : targetUserId;
  const isValidId = numericUserId !== null && !isNaN(numericUserId as number);
  
  console.log("ProfilePage - Final numeric userId:", numericUserId, "isValidId:", isValidId);
  
  // Sample mock data for achievements (would normally come from API)
  const [achievements, setAchievements] = useState<Achievement[]>([
    // Bronze tier (beginner)
    {
      id: 1,
      name: "Meet Newbie",
      description: "Attended your first Meet",
      icon: <MapPin className="h-5 w-5 text-amber-600" />,
      tier: "bronze",
      isUnlocked: true,
      earnedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString() // 30 days ago
    },
    {
      id: 2,
      name: "First Impression",
      description: "Received your first trait endorsement",
      icon: <ThumbsUp className="h-5 w-5 text-amber-600" />,
      tier: "bronze",
      isUnlocked: true,
      earnedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 25).toISOString() // 25 days ago
    },
    {
      id: 3,
      name: "Host Debut",
      description: "Created your first Meet",
      icon: <User className="h-5 w-5 text-amber-600" />,
      tier: "bronze",
      isUnlocked: true,
      earnedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 20).toISOString() // 20 days ago
    },
    {
      id: 4,
      name: "Profile Meet Filters",
      description: "Fill out all your profile information",
      icon: <FileText className="h-5 w-5 text-amber-600" />,
      tier: "bronze",
      isUnlocked: true,
      earnedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 28).toISOString() // 28 days ago
    },
    {
      id: 5,
      name: "Friend Finder",
      description: "Sent your first friend request",
      icon: <UserPlus className="h-5 w-5 text-amber-600" />,
      tier: "bronze",
      isUnlocked: true,
      earnedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 22).toISOString() // 22 days ago
    },
    {
      id: 31,
      name: "Social Starter",
      description: "Send your first chat message in a Meet",
      icon: <MessageCircle className="h-5 w-5 text-amber-600" />,
      tier: "bronze",
      isUnlocked: true,
      earnedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 26).toISOString() // 26 days ago
    },
    
    // Silver tier (intermediate)
    {
      id: 6,
      name: "Social Butterfly",
      description: "Attended 5 Meets",
      icon: <Users className="h-5 w-5 text-slate-400" />,
      tier: "silver",
      isUnlocked: true,
      earnedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 14).toISOString() // 14 days ago
    },
    {
      id: 7,
      name: "Trendsetter",
      description: "Created a Meet that reached maximum capacity",
      icon: <Star className="h-5 w-5 text-slate-400" />,
      tier: "silver",
      isUnlocked: false,
      progress: 3,
      maxProgress: 5
    },
    {
      id: 8,
      name: "Conversation Starter",
      description: "Sent 50 chat messages across all Meets",
      icon: <MessageSquare className="h-5 w-5 text-slate-400" />,
      tier: "silver",
      isUnlocked: false,
      progress: 27,
      maxProgress: 50
    },
    {
      id: 19,
      name: "Regular Attendee",
      description: "Join Meets in 3 different themes",
      icon: <Layout className="h-5 w-5 text-slate-400" />,
      tier: "silver",
      isUnlocked: false,
      progress: 2,
      maxProgress: 3
    },
    {
      id: 20,
      name: "Friendly Neighbor",
      description: "Accept 5 friend requests",
      icon: <UserPlus className="h-5 w-5 text-slate-400" />,
      tier: "silver",
      isUnlocked: false,
      progress: 3,
      maxProgress: 5
    },
    {
      id: 21,
      name: "Event Planner",
      description: "Create 3 Meets with different themes",
      icon: <Calendar className="h-5 w-5 text-slate-400" />,
      tier: "silver",
      isUnlocked: false,
      progress: 1,
      maxProgress: 3
    },
    
    // Gold tier (advanced)
    {
      id: 9,
      name: "Meet Maven",
      description: "Attended 20 Meets",
      icon: <Activity className="h-5 w-5 text-yellow-500" />,
      tier: "gold",
      isUnlocked: true, // Should be unlocked since they've attended 20 meetups
      earnedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(), // 2 days ago
      progress: 20,
      maxProgress: 20
    },
    {
      id: 10,
      name: "Networker",
      description: "Add 10 friends to your network",
      icon: <Globe className="h-5 w-5 text-yellow-500" />,
      tier: "gold",
      isUnlocked: false,
      progress: 4,
      maxProgress: 10
    },
    {
      id: 11,
      name: "Highly Regarded",
      description: "Receive 10 positive trait endorsements",
      icon: <Award className="h-5 w-5 text-yellow-500" />,
      tier: "gold",
      isUnlocked: false,
      progress: 6,
      maxProgress: 10
    },
    {
      id: 22,
      name: "Meet Mentor",
      description: "Successfully host 5 different Meets",
      icon: <PenTool className="h-5 w-5 text-yellow-500" />,
      tier: "gold",
      isUnlocked: false,
      progress: 3,
      maxProgress: 5
    },
    {
      id: 23,
      name: "Diverse Explorer",
      description: "Attend Meets in 5 different locations",
      icon: <Map className="h-5 w-5 text-yellow-500" />,
      tier: "gold",
      isUnlocked: false,
      progress: 3,
      maxProgress: 5
    },
    {
      id: 24,
      name: "Community Contributor",
      description: "Rate 15 participants after Meets",
      icon: <Star className="h-5 w-5 text-yellow-500" />,
      tier: "gold",
      isUnlocked: false,
      progress: 7,
      maxProgress: 15
    },
    
    // Platinum tier (expert)
    {
      id: 12,
      name: "Local Legend",
      description: "Host 10 successful Meets with full attendance",
      icon: <Zap className="h-5 w-5 text-blue-500" />,
      tier: "platinum",
      isUnlocked: false,
      progress: 2,
      maxProgress: 10
    },
    {
      id: 13,
      name: "Influencer",
      description: "Have 5 of your traits endorsed by 10+ unique users",
      icon: <Gift className="h-5 w-5 text-blue-500" />,
      tier: "platinum",
      isUnlocked: false,
      progress: 1,
      maxProgress: 5
    },
    {
      id: 14,
      name: "Community Pillar",
      description: "Participate in 50 Meets across all categories",
      icon: <Crown className="h-5 w-5 text-blue-500" />,
      tier: "platinum",
      isUnlocked: false,
      progress: 18,
      maxProgress: 50
    },
    {
      id: 25,
      name: "Trait Expert",
      description: "Have all personality traits rated by other users",
      icon: <CheckCircle2 className="h-5 w-5 text-blue-500" />,
      tier: "platinum",
      isUnlocked: false,
      progress: 7,
      maxProgress: 15
    },
    {
      id: 26,
      name: "Meet Ambassador",
      description: "Successfully invite 20 users to your Meets",
      icon: <UsersRound className="h-5 w-5 text-blue-500" />,
      tier: "platinum",
      isUnlocked: false,
      progress: 12,
      maxProgress: 20
    },
    {
      id: 27,
      name: "Discussion Leader",
      description: "Send 200 chat messages across all Meets",
      icon: <MessagesSquare className="h-5 w-5 text-blue-500" />,
      tier: "platinum",
      isUnlocked: false,
      progress: 124,
      maxProgress: 200
    },
    
    // Diamond tier (legendary)
    {
      id: 16,
      name: "Social Virtuoso",
      description: "Have 50+ positive trait endorsements across all categories",
      icon: <Diamond className="h-5 w-5 text-purple-500" />,
      tier: "diamond",
      isUnlocked: false,
      progress: 6,
      maxProgress: 50
    },
    {
      id: 17,
      name: "Meet Maestro",
      description: "Participate in 100 Meets with perfect attendance",
      icon: <Trophy className="h-5 w-5 text-purple-500" />,
      tier: "diamond",
      isUnlocked: false,
      progress: 20, // Updated to reflect the actual meetup count from database
      maxProgress: 100
    },
    {
      id: 18,
      name: "Community Legend",
      description: "Be the most endorsed user in 5 different trait categories",
      icon: <Star className="h-5 w-5 text-purple-500" />,
      tier: "diamond",
      isUnlocked: false,
      progress: 1,
      maxProgress: 5
    },
    {
      id: 28,
      name: "Master Host",
      description: "Create and successfully host 25 Meets",
      icon: <Crown className="h-5 w-5 text-purple-500" />,
      tier: "diamond",
      isUnlocked: false,
      progress: 8,
      maxProgress: 25
    },
    {
      id: 29,
      name: "Global Explorer",
      description: "Attend Meets in 10 different regions",
      icon: <Globe className="h-5 w-5 text-purple-500" />,
      tier: "diamond",
      isUnlocked: false,
      progress: 4,
      maxProgress: 10
    },
    {
      id: 30,
      name: "Esteemed Veteran",
      description: "Be a member for 1 year with at least 50 Meets attended",
      icon: <Award className="h-5 w-5 text-purple-500" />,
      tier: "diamond",
      isUnlocked: false,
      progress: 20,
      maxProgress: 50
    }
  ]);
  
  // Profile data effect
  const {
    data: profile,
    isLoading: isProfileLoading,
    error: profileError
  } = useQuery({
    queryKey: ['/api/users', numericUserId, 'profile'],
    queryFn: async () => {
      console.log('Fetching profile for user:', numericUserId);
      const res = await fetch(`/api/users/${numericUserId}/profile`);
      if (!res.ok) {
        console.error('Profile fetch error:', await res.text());
        throw new Error(await res.text());
      }
      const data = await res.json();
      console.log('Received profile data:', data);
      return data;
    },
    enabled: isValidId
  });
  
  // Check URL for tab parameter
  useEffect(() => {
    // If there's a tab parameter in the URL, set it as active tab
    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get('tab');
    // Set active tab based on URL parameter
    if (tabParam) {
      if (tabParam === 'meetfilters') {
        // Map the old name to the new name
        setActiveTab('achievements');
      } else if (['achievements', 'traits', 'history'].includes(tabParam)) {
        setActiveTab(tabParam);
      }
    }
  }, [location]);
  
  // Debug info effect
  useEffect(() => {
    console.log("🔍 ProfilePage Component:");
    console.log("- Current path:", location);
    console.log("- userId param:", userId);
    console.log("- currentUser:", currentUser);
  }, [userId, currentUser, location]);
  
  // Update the "Profile Complete" achievement based on gender and birthday
  useEffect(() => {
    if (profile) {
      const profileCompleteIndex = achievements.findIndex(a => a.id === 4);
      if (profileCompleteIndex !== -1) {
        // Make sure both gender and birthday are detected correctly
        const hasGender = Boolean(profile.gender);
        const hasBirthday = Boolean(profile.birthday);
        const hasCompletedProfile = hasGender && hasBirthday;
        
        console.log("Profile completion check:", {
          gender: profile.gender,
          birthday: profile.birthday,
          hasGender,
          hasBirthday,
          hasCompletedProfile
        });
        
        if (achievements[profileCompleteIndex].isUnlocked !== hasCompletedProfile) {
          const updatedAchievements = [...achievements];
          updatedAchievements[profileCompleteIndex] = {
            ...updatedAchievements[profileCompleteIndex],
            isUnlocked: hasCompletedProfile,
            earnedAt: hasCompletedProfile ? new Date().toISOString() : undefined
          };
          
          console.log("📋 Updating Profile Meet Filters achievement:", { 
            wasUnlocked: achievements[profileCompleteIndex].isUnlocked,
            isNowUnlocked: hasCompletedProfile,
            hasBirthday: hasBirthday,
            hasGender: hasGender
          });
          
          setAchievements(updatedAchievements);
        }
      }
    }
  }, [profile, achievements]);

  console.log(`🧐 Checking if meet history query runs for user ${numericUserId}`);

  // Meet history effect
  const {
    data: meetHistory,
    isLoading: isMeetHistoryLoading,
    error: meetHistoryError
  } = useQuery({
    queryKey: ['/api/users', numericUserId, 'meet-history'],
    queryFn: async () => {
      console.log(`🔄 Fetching meet history for user ${numericUserId}`);
      
      const res = await fetch(`/api/users/${numericUserId}/meet-history`);
      console.log("📩 API Response Status:", res.status);
      
      if (!res.ok) {
        const errorText = await res.text();
        console.error("❌ Meet history fetch error:", errorText);
        throw new Error(errorText);
      }
      
      const data = await res.json();
      console.log("📜 Meet history data received:", data);
      return data;
    },
    enabled: isValidId
  });

  console.log("📊 Meet history state:", { meetHistory, isMeetHistoryLoading, meetHistoryError });

  // User stats effect
  const {
    data: stats,
    isLoading: isStatsLoading,
    error: statsError
  } = useQuery<UserStats>({
    queryKey: ['/api/users', numericUserId, 'stats'],
    queryFn: async () => {
      console.log(`Fetching stats for user: ${numericUserId}`);
      const res = await fetch(`/api/users/${numericUserId}/stats`);
      console.log(`Stats API response status: ${res.status}`);
      if (!res.ok) {
        const errorText = await res.text();
        console.error('Stats fetch error:', errorText);
        return { friendCount: 0, meetsAttended: 0, traitCount: 0 };
      }
      const data = await res.json();
      console.log('Received stats:', data);
      return data;
    },
    enabled: isValidId,
    retry: 2
  });
  
  // Query for user traits
  const {
    data: traits,
    isLoading: isTraitsLoading,
    error: traitsError
  } = useQuery({
    queryKey: ['/api/users', numericUserId, 'traits'],
    queryFn: async () => {
      console.log(`Fetching traits for user: ${numericUserId}`);
      const res = await fetch(`/api/users/${numericUserId}/traits`);
      console.log(`Traits API response status: ${res.status}`);
      if (!res.ok) {
        const errorText = await res.text();
        console.error('Traits fetch error:', errorText);
        return [];
      }
      const data = await res.json();
      console.log('Received traits data:', data);
      return data;
    },
    enabled: isValidId,
    retry: 2
  });

  // Keep route-specific branches below every hook so navigating between
  // profile routes never changes the component's hook order.
  if (userId && !isNumericUserId && profileRedirectRoutes.includes(userId)) {
    return null;
  }

  // If no valid user ID is specified and not logged in, show a helpful message
  if (targetUserId === null) {
    console.log("ProfilePage - No valid userId found, showing sign-in message");
    return (
      <div className="p-4 space-y-4">
        <h2 className="text-2xl font-bold">Profile</h2>
        <div className="flex flex-col items-center justify-center p-8 text-center">
          <UserCircle2 className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold">Sign in to access profiles</h3>
          <p className="text-muted-foreground mb-4">
            Adjust your profile and view items like your Traits, and Meet history
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

  if (isProfileLoading || isStatsLoading || isMeetHistoryLoading || isTraitsLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  if (profileError || !profile) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center space-y-4">
          <User className="w-12 h-12 mx-auto text-muted-foreground" />
          <h1 className="text-xl font-semibold">User Not Found</h1>
          <p className="text-muted-foreground">This user profile doesn't exist</p>
        </div>
      </div>
    );
  }

  if (statsError) {
    console.error('Stats error:', statsError);
  }

  if (meetHistoryError) {
    console.error('Meet history error:', meetHistoryError);
  }
  
  if (traitsError) {
    console.error('Traits error:', traitsError);
  }

  return (
    <div className="container max-w-6xl mx-auto p-4">
      <Card className="p-6 mb-4">
        <div className="flex flex-col sm:flex-row gap-6">
          <div className="flex flex-col items-center gap-4">
            <ProfileAvatar
              profilePicture={profile.profilePicture}
              username={profile.username}
              displayName={profile.displayName}
              size="lg"
              className="h-24 w-24"
            />
            {numericUserId === currentUser?.id && (
              <Button
                variant="outline"
                size="sm"
                className="w-full hidden sm:block"
                onClick={() => navigate(`/edit-profile`)}>
                Edit Profile
              </Button>
            )}
          </div>
          <div className="flex-1 flex flex-col sm:flex-row justify-between gap-4">
            <div className="flex-1">
              <h1 className="text-2xl font-bold truncate text-center sm:text-left">
                {profile.displayName || profile.username} <span className="text-muted-foreground">({profile.username})</span>
              </h1>
              <p className="text-muted-foreground text-center sm:text-left">
                Joined {formatDate(profile.createdAt)}
              </p>
              {profile.bio && (
                <p className="text-sm mt-2 text-center sm:text-left max-w-md">
                  {profile.bio}
                </p>
              )}
            </div>
            <div className="flex flex-col items-center sm:items-end">
              {numericUserId === currentUser?.id && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full sm:hidden mb-4"
                  onClick={() => navigate(`/edit-profile`)}>
                  Edit Profile
                </Button>
              )}
              <div className="w-full flex flex-wrap justify-center sm:justify-end items-center text-center gap-x-6 gap-y-2">
                <div className="flex items-center gap-1 text-sm">
                  <Users className="w-4 h-4" />
                  <span>{stats?.friendCount ?? 0} Friends</span>
                </div>
                <div className="flex items-center gap-1 text-sm">
                  <Medal className="w-4 h-4" />
                  <span>{stats?.meetsAttended ?? 0} Meets</span>
                </div>
                <div className="flex items-center gap-1 text-sm">
                  <ThumbsUp className="w-4 h-4" />
                  <span>{stats?.traitCount ?? 0} Traits</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Card>

      <Card className="border-none shadow-none bg-background">
        <Tabs defaultValue={activeTab} value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-4">
            <TabsTrigger value="achievements" className="flex items-center gap-2">
              <Award className="w-4 h-4" />
              {!isMobile && <span>Achievements</span>}
            </TabsTrigger>
            <TabsTrigger value="traits" className="flex items-center gap-2">
              <Medal className="w-4 h-4" />
              {!isMobile && <span>Traits</span>}
            </TabsTrigger>
            <TabsTrigger value="history" className="flex items-center gap-2">
              <MapPin className="w-4 h-4" />
              {!isMobile && <span>History</span>}
            </TabsTrigger>
          </TabsList>



          <TabsContent value="achievements" className="mt-0">
            <div className="space-y-6">
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="text-lg font-semibold">Achievements</h3>
                    <p className="text-sm text-muted-foreground">Complete achievements to track your progress on the platform</p>
                  </div>
                  <Badge variant="secondary" className="gap-1">
                    <Award className="h-3 w-3" />
                    <span>{achievements.filter((a: Achievement) => a.isUnlocked).length} / {achievements.length}</span>
                  </Badge>
                </div>
                
                {/* Achievement Tier Status - Single Current Tier */}
                <div className="bg-muted/50 rounded-lg p-4">
                  <h4 className="text-sm font-medium mb-3">Current Tier Status</h4>
                  {(() => {
                    // Find the current active tier
                    const tiers = ['bronze', 'silver', 'gold', 'platinum', 'diamond'];
                    let currentTierIndex = 0;
                    
                    // Find the highest tier where all previous tiers are completed
                    for (let i = 0; i < tiers.length; i++) {
                      const tier = tiers[i];
                      const tierAchievements = achievements.filter(a => a.tier === tier);
                      const isComplete = tierAchievements.every(a => a.isUnlocked);
                      
                      if (isComplete) {
                        // If this tier is complete, check the next tier
                        currentTierIndex = i + 1;
                      } else {
                        // If this tier isn't complete, this is our current tier
                        break;
                      }
                    }
                    
                    // Make sure we don't exceed the last tier
                    currentTierIndex = Math.min(currentTierIndex, tiers.length - 1);
                    const currentTier = tiers[currentTierIndex];
                    
                    // Get current tier achievements
                    const tierAchievements = achievements.filter(a => a.tier === currentTier);
                    const completedCount = tierAchievements.filter(a => a.isUnlocked).length;
                    const totalCount = tierAchievements.length;
                    const isComplete = completedCount === totalCount && totalCount > 0;
                    
                    // Determine tier color
                    const tierColor = currentTier === 'bronze' 
                      ? 'bg-amber-600' 
                      : currentTier === 'silver' 
                        ? 'bg-slate-400' 
                        : currentTier === 'gold' 
                          ? 'bg-yellow-500' 
                          : currentTier === 'platinum' 
                            ? 'bg-blue-500' 
                            : 'bg-purple-500';
                    
                    const tierTextColor = currentTier === 'bronze' 
                      ? 'text-amber-600' 
                      : currentTier === 'silver' 
                        ? 'text-slate-500' 
                        : currentTier === 'gold' 
                          ? 'text-yellow-500' 
                          : currentTier === 'platinum' 
                            ? 'text-blue-500' 
                            : 'text-purple-500';
                    
                    const progressPercent = totalCount > 0 
                      ? Math.round((completedCount / totalCount) * 100) 
                      : 0;
                    
                    return (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className={`h-4 w-4 rounded-full ${tierColor}`}></span>
                            <span className={`text-base font-medium capitalize ${tierTextColor}`}>
                              {currentTier}
                            </span>
                          </div>
                          
                          <div className="flex items-center gap-1.5">
                            {currentTierIndex > 0 && (
                              <div className="flex items-center gap-1 bg-green-100 text-green-700 px-2 py-0.5 rounded text-xs">
                                <CheckCircle2 className="h-3 w-3" />
                                <span>{currentTierIndex} tiers completed</span>
                              </div>
                            )}
                            {!isComplete && (
                              <Badge variant="outline" className="text-xs font-normal">
                                {completedCount}/{totalCount} achievements
                              </Badge>
                            )}
                            {isComplete && currentTierIndex < tiers.length - 1 && (
                              <Badge variant="outline" className="text-xs font-normal text-blue-500 border-blue-300 bg-blue-50">
                                Ready to advance!
                              </Badge>
                            )}
                            {isComplete && currentTierIndex === tiers.length - 1 && (
                              <Badge variant="outline" className="text-xs font-normal text-purple-500 border-purple-300 bg-purple-50">
                                Master achieved!
                              </Badge>
                            )}
                          </div>
                        </div>
                        
                        <div className="space-y-1">
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span>Progress to next tier</span>
                            <span className="font-medium">{progressPercent}%</span>
                          </div>
                          <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
                            <div 
                              className={`h-full ${tierColor} rounded-full ${isComplete ? 'animate-pulse' : ''}`}
                              style={{ width: `${progressPercent}%` }}
                            ></div>
                          </div>
                        </div>
                        
                        {!isComplete && (
                          <div className="text-xs text-muted-foreground">
                            Complete all achievements in the {currentTier} tier to advance.
                          </div>
                        )}
                        {isComplete && currentTierIndex < tiers.length - 1 && (
                          <div className="text-xs text-blue-500">
                            You've completed the {currentTier} tier! Achievements from the {tiers[currentTierIndex + 1]} tier are now unlocked.
                          </div>
                        )}
                        {isComplete && currentTierIndex === tiers.length - 1 && (
                          <div className="text-xs text-purple-500">
                            Congratulations! You've reached the highest tier level.
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </div>

              {['bronze', 'silver', 'gold', 'platinum', 'diamond'].map((tier) => {
                const tierAchievements = achievements.filter((a: Achievement) => a.tier === tier);
                if (tierAchievements.length === 0) return null;
                
                // Check if this tier is unlocked (all achievements in previous tiers are completed)
                const isTierActive = isTierUnlocked(tier, achievements);
                
                // Get the count of completed achievements in this tier
                const completedCount = tierAchievements.filter(a => a.isUnlocked).length;
                const totalCount = tierAchievements.length;
                
                return (
                  <div key={tier} className={`space-y-3 ${!isTierActive ? 'opacity-80' : ''}`}>
                    <div className="flex items-center justify-between">
                      <h4 className="font-semibold capitalize flex items-center gap-2">
                        {tier === 'bronze' && <span className="h-4 w-4 rounded-full bg-amber-600"></span>}
                        {tier === 'silver' && <span className="h-4 w-4 rounded-full bg-slate-400"></span>}
                        {tier === 'gold' && <span className="h-4 w-4 rounded-full bg-yellow-500"></span>}
                        {tier === 'platinum' && <span className="h-4 w-4 rounded-full bg-blue-500"></span>}
                        {tier === 'diamond' && <span className="h-4 w-4 rounded-full bg-purple-500"></span>}
                        {tier.charAt(0).toUpperCase() + tier.slice(1)} Tier
                        {!isTierActive && (
                          <Badge variant="outline" className="ml-2 gap-1 text-xs">
                            <Lock className="h-3 w-3" />
                            <span>Complete previous tiers first</span>
                          </Badge>
                        )}
                      </h4>
                      <Badge variant="secondary" className="text-xs">
                        {completedCount}/{totalCount}
                      </Badge>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {tierAchievements.map((achievement: Achievement) => {
                        // Determine if tier is unlocked (all previous tiers complete)
                        const isAchievementAccessible = isTierActive || achievement.isUnlocked;
                        
                        // Check if achievement is technically completed but not yet recognized
                        const isCompleted = isAchievementCompleted(achievement);
                        const isPendingRecognition = isCompleted && !achievement.isUnlocked && !isTierActive;
                        
                        // Styling classes based on achievement state
                        const cardOpacityClass = achievement.isUnlocked 
                          ? '' 
                          : isPendingRecognition
                            ? 'opacity-75' // Completed but waiting for tier recognition
                            : !isAchievementAccessible 
                              ? 'opacity-40 grayscale' 
                              : 'opacity-60';
                            
                        const iconClass = achievement.isUnlocked 
                          ? 'bg-primary/10 text-primary' 
                          : isPendingRecognition
                            ? 'bg-yellow-100 text-yellow-600' // Pending recognition
                            : !isAchievementAccessible
                              ? 'bg-muted/50 text-muted-foreground' 
                              : 'bg-muted text-muted-foreground';
                            
                        const progressBarColor = tier === 'bronze' 
                          ? 'bg-amber-600' 
                          : tier === 'silver' 
                            ? 'bg-slate-400' 
                            : tier === 'gold' 
                              ? 'bg-yellow-500' 
                              : tier === 'platinum' 
                                ? 'bg-blue-500' 
                                : 'bg-purple-500';
                                
                        const progressPercentage = achievement.progress && achievement.maxProgress
                          ? Math.min(100, (achievement.progress / achievement.maxProgress) * 100)
                          : 0;
                        
                        return (
                          <Card 
                            key={achievement.id} 
                            className={`p-4 transition-all ${cardOpacityClass}`}
                          >
                            <div className="flex items-start gap-3">
                              <div className={`rounded-full p-2 ${iconClass}`}>
                                {achievement.icon}
                              </div>
                              <div className="space-y-1 flex-1">
                                <div className="flex justify-between">
                                  <div className="flex items-center gap-2">
                                    <h4 className="font-semibold">{achievement.name}</h4>
                                    {achievement.isUnlocked && (
                                      <Badge variant="secondary" className="h-5 w-5 p-0.5 rounded-full">
                                        <Check className="h-4 w-4" />
                                      </Badge>
                                    )}
                                    {isPendingRecognition && (
                                      <Badge variant="outline" className="text-xs gap-1 text-yellow-600">
                                        <Clock className="h-3 w-3" />
                                        <span>Pending</span>
                                      </Badge>
                                    )}
                                    {!isAchievementAccessible && !isCompleted && (
                                      <Lock className="h-3 w-3 text-muted-foreground" />
                                    )}
                                  </div>
                                  {achievement.isUnlocked && achievement.earnedAt && (
                                    <Badge variant="outline" className="text-xs">
                                      {formatDate(achievement.earnedAt)}
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-sm text-muted-foreground">{achievement.description}</p>
                                {/* Progress bar for both in-progress and pending recognition achievements */}
                                {!achievement.isUnlocked && achievement.progress !== undefined && (
                                  <div className="mt-2 space-y-1">
                                    <div className="text-xs text-muted-foreground flex justify-between">
                                      <span>Progress: {achievement.progress}/{achievement.maxProgress}</span>
                                      {isPendingRecognition && (
                                        <span className="text-yellow-600">Complete previous tiers to unlock</span>
                                      )}
                                    </div>
                                    <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
                                      <div 
                                        className={`h-full ${progressBarColor} rounded-full ${isPendingRecognition ? 'animate-pulse' : ''}`}
                                        style={{ width: `${progressPercentage}%` }}
                                      />
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          </Card>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </TabsContent>

          <TabsContent value="traits" className="mt-0">
            <div className="space-y-4">
              {traits?.length ? (
                traits.map((trait: Trait) => (
                  <TraitCard key={trait.traitId} trait={trait} />
                ))
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No traits rated yet
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="history" className="mt-0">
            <div className="space-y-3">
              <div className="flex justify-end">
                <Badge variant="secondary">
                  {stats?.meetsAttended ?? 0} Total Meets
                </Badge>
              </div>
              
              {meetHistory?.length ? (
                meetHistory.map((history: MeetHistoryEntry) => {
                  // Generate theme-specific icons
                  let themeIcon = <MapPin className="h-4 w-4 text-gray-500" />;
                  
                  switch(history.meetup.theme) {
                    case 'Technology':
                      themeIcon = <Code className="h-4 w-4 text-blue-500" />;
                      break;
                    case 'Photography':
                      themeIcon = <Camera className="h-4 w-4 text-purple-500" />;
                      break;
                    case 'Education':
                      themeIcon = <Book className="h-4 w-4 text-green-500" />;
                      break;
                    case 'Food':
                      themeIcon = <Utensils className="h-4 w-4 text-orange-500" />;
                      break;
                    case 'Music':
                      themeIcon = <Music className="h-4 w-4 text-pink-500" />;
                      break;
                    case 'Movies':
                      themeIcon = <Film className="h-4 w-4 text-red-500" />;
                      break;
                    case 'Sports':
                      themeIcon = <Dumbbell className="h-4 w-4 text-emerald-500" />;
                      break;
                    case 'Art':
                      themeIcon = <Palette className="h-4 w-4 text-yellow-500" />;
                      break;
                    case 'Shopping':
                      themeIcon = <ShoppingBag className="h-4 w-4 text-indigo-500" />;
                      break;
                    case 'Dating':
                      themeIcon = <Heart className="h-4 w-4 text-rose-500" />;
                      break;
                    case 'Games':
                      themeIcon = <Gamepad2 className="h-4 w-4 text-violet-500" />;
                      break;
                    case 'Coffee':
                      themeIcon = <Coffee className="h-4 w-4 text-amber-700" />;
                      break;
                  }
                  
                  return (
                    <Card key={history.id} className="p-4 hover:shadow-md transition-all duration-200">
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            {themeIcon}
                            <p className="font-medium">{history.meetup.title}</p>
                            <Badge variant="outline">{history.meetup.theme}</Badge>
                          </div>
                          <p className="text-sm text-muted-foreground flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            Joined {formatDate(history.joinedAt)}
                          </p>
                          {history.leftAt && (
                            <p className="text-sm text-muted-foreground flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              Left {formatDate(history.leftAt)}
                            </p>
                          )}
                          <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                            <User className="h-3 w-3" />
                            Created by {history.meetup.creator}
                          </p>
                        </div>
                      </div>
                    </Card>
                  );
                })
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No meet history yet
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </Card>
    </div>
  );
}