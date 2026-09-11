import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useUser } from '@/hooks/use-user';
import { Loader2, Eye, EyeOff, ArrowLeft } from 'lucide-react';
import type { NewUser } from '@db/schema';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useLocation, Link } from 'wouter';
import { useToast } from '@/hooks/use-toast';
import { useAppearance } from '@/hooks/use-appearance';
import { AnimatedMascot } from '@/components/auth/animated-mascot';
import { ThemeAwareLogo } from '@/components/common/theme-aware-logo';
import { Eye as EyeIcon, EyeOff as EyeOffIcon } from "lucide-react";

const authSchema = z.object({
  username: z.string().min(3, 'Username must be at least 3 characters'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

const registerSchema = authSchema.extend({
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

export default function AuthPage() {
  const { register: registerUser, login } = useUser();
  const [isLoading, setIsLoading] = useState(false);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("login");
  
  // Handle tab changes - clear any error messages when switching tabs
  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    if (tab === "register") {
      setLoginError(null);
    }
  };
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showRegisterPassword, setShowRegisterPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isTypingLoginUsername, setIsTypingLoginUsername] = useState(false);
  const [isTypingRegisterUsername, setIsTypingRegisterUsername] = useState(false);
  const [isTypingLoginPassword, setIsTypingLoginPassword] = useState(false);
  const [isTypingRegisterPassword, setIsTypingRegisterPassword] = useState(false);
  const [isTypingConfirmPassword, setIsTypingConfirmPassword] = useState(false);
  const { appearance } = useAppearance();
  
  // Preload logo images to prevent lag when switching themes
  useEffect(() => {
    // Preload both logo images to prevent lag when switching
    const lightLogo = new Image();
    lightLogo.src = "/images/joinup-logo.png";
    const darkLogo = new Image();
    darkLogo.src = "/images/joinup-logo-dark.png";
  }, []);

  const loginForm = useForm<NewUser>({
    resolver: zodResolver(authSchema),
    defaultValues: { username: '', password: '' }
  });

  const registerForm = useForm<z.infer<typeof registerSchema>>({
    resolver: zodResolver(registerSchema),
    defaultValues: { username: '', password: '', confirmPassword: '' }
  });

  const [loginError, setLoginError] = useState<string | null>(null);

  const handleLogin = async (data: NewUser) => {
    setIsLoading(true);
    setLoginError(null);
    
    try {
      console.log('Attempting login:', data.username);
      await login(data);
      toast({
        title: "Success",
        description: "Logged in successfully!",
        duration: 2000 // 2 second duration (testing)
      });
      setLocation('/');
    } catch (error) {
      console.error('Login failed:', error);
      // Set form-level error message
      if (error instanceof Error) {
        setLoginError(error.message);
      } else {
        setLoginError("Login failed. Please check your credentials.");
      }
      
      toast({
        title: "Login Failed",
        description: error instanceof Error ? error.message : "Login failed",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async (data: z.infer<typeof registerSchema>) => {
    setIsLoading(true);
    try {
      // Remove confirmPassword from the data before sending to API
      const { confirmPassword, ...userData } = data;
      console.log('Registering with data:', userData); // Debug log
      await registerUser(userData);
      toast({
        title: "Success",
        description: "Registration successful! Please log in with your new account.",
        duration: 1000 // 1 second duration
      });
      registerForm.reset();
      setActiveTab("login");
    } catch (error) {
      console.error('Registration failed:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Registration failed",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleFocusLoginUsername = () => setIsTypingLoginUsername(true);
  const handleBlurLoginUsername = () => setIsTypingLoginUsername(false);
  const handleFocusRegisterUsername = () => setIsTypingRegisterUsername(true);
  const handleBlurRegisterUsername = () => setIsTypingRegisterUsername(false);
  const handleFocusLoginPassword = () => setIsTypingLoginPassword(true);
  const handleBlurLoginPassword = () => setIsTypingLoginPassword(false);
  const handleFocusRegisterPassword = () => setIsTypingRegisterPassword(true);
  const handleBlurRegisterPassword = () => setIsTypingRegisterPassword(false);
  const handleFocusConfirmPassword = () => setIsTypingConfirmPassword(true);
  const handleBlurConfirmPassword = () => setIsTypingConfirmPassword(false);


  useEffect(() => {
    console.log('Tab changed to:', activeTab);
  }, [activeTab]);

  const isTyping = isTypingLoginUsername || isTypingRegisterUsername;
  console.log('Animation state:', { 
    activeTab, 
    isTyping,
    loginTyping: isTypingLoginUsername,
    registerTyping: isTypingRegisterUsername
  });

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
      <div className="fixed top-4 left-4">
        <Link href="/">
          <Button 
            variant="outline" 
            size="sm" 
            className="gap-2 text-gray-800 dark:text-white dark:border-gray-600 dark:hover:bg-gray-800"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Home
          </Button>
        </Link>
      </div>
      <Card className="w-[400px]">
        <CardHeader className="pb-0">
          <AnimatedMascot
            isPasswordField={
              activeTab === "login"
                ? isTypingLoginPassword
                : (isTypingRegisterPassword || isTypingConfirmPassword)
            }
            showPassword={
              activeTab === "login"
                ? showLoginPassword
                : (showRegisterPassword || showConfirmPassword)
            }
            isTyping={isTyping}
            className="mb-0"
          />
          <div className="flex flex-col items-center gap-4">
            <CardTitle className="text-lg font-medium text-center mb-1">Welcome to</CardTitle>
            <div className="h-16 w-auto mx-auto mb-2">
              {appearance?.darkMode ? (
                <img 
                  src="/images/joinup-logo-dark.png"
                  alt="JoinUp Logo - Dark Mode"
                  className="h-16 mx-auto"
                />
              ) : (
                <img 
                  src="/images/joinup-logo.png"
                  alt="JoinUp Logo - Light Mode"
                  className="h-16 mx-auto"
                />
              )}
            </div>
          </div>
          <CardDescription className="text-center mx-auto max-w-[300px]">
            Connect with people nearby by joining local gatherings happening right now
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={handleTabChange}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">Login</TabsTrigger>
              <TabsTrigger value="register">Register</TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <form onSubmit={loginForm.handleSubmit(handleLogin)} className="space-y-4">
                {loginError && (
                  <div className="bg-red-50 dark:bg-red-900/20 border border-red-300 dark:border-red-800 rounded p-3 mb-2">
                    <p className="text-sm text-red-700 dark:text-red-400">{loginError}</p>
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="username">Username</Label>
                  <Input
                    id="username"
                    type="text"
                    {...loginForm.register('username')}
                    onFocus={handleFocusLoginUsername}
                    onBlur={handleBlurLoginUsername}
                    className="w-full"
                  />
                  {loginForm.formState.errors.username && (
                    <p className="text-sm text-destructive">{loginForm.formState.errors.username.message}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showLoginPassword ? "text" : "password"}
                      {...loginForm.register('password')}
                      onFocus={handleFocusLoginPassword}
                      onBlur={handleBlurLoginPassword}
                      className="w-full"
                    />
                   <button
  type="button"
  className="absolute right-0 top-0 h-full px-3"
  onMouseDown={(event) => {
    event.preventDefault();
    event.stopPropagation();
    setShowLoginPassword(!showLoginPassword);
  }}
>
  {showLoginPassword ? (
    <EyeOffIcon className="h-5 w-5 text-gray-600 dark:text-gray-400" />
  ) : (
    <EyeIcon className="h-5 w-5 text-gray-600 dark:text-gray-400" />
  )}
</button>

                  </div>
                  {loginForm.formState.errors.password && (
                    <p className="text-sm text-destructive">{loginForm.formState.errors.password.message}</p>
                  )}
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Login"
                  )}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="register">
              <form onSubmit={registerForm.handleSubmit(handleRegister)} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="reg-username">Username</Label>
                  <Input
                    id="reg-username"
                    type="text"
                    {...registerForm.register('username')}
                    onFocus={handleFocusRegisterUsername}
                    onBlur={handleBlurRegisterUsername}
                    className="w-full"
                  />
                  {registerForm.formState.errors.username && (
                    <p className="text-sm text-destructive">{registerForm.formState.errors.username.message}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reg-password">Password</Label>
                  <div className="relative">
                    <Input
                      id="reg-password"
                      type={showRegisterPassword ? "text" : "password"}
                      {...registerForm.register('password')}
                      onFocus={handleFocusRegisterPassword}
                      onBlur={handleBlurRegisterPassword}
                      className="w-full"
                    />
                    <button
  type="button"
  className="absolute right-0 top-0 h-full px-3"
  onMouseDown={(event) => {
    event.preventDefault();
    event.stopPropagation();
    setShowRegisterPassword(!showRegisterPassword);
  }}
>
  {showRegisterPassword ? (
    <EyeOffIcon className="h-5 w-5 text-gray-600 dark:text-gray-400" />
  ) : (
    <EyeIcon className="h-5 w-5 text-gray-600 dark:text-gray-400" />
  )}
</button>

                  </div>
                  {registerForm.formState.errors.password && (
                    <p className="text-sm text-destructive">{registerForm.formState.errors.password.message}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm-password">Confirm Password</Label>
                  <div className="relative">
                    <Input
                      id="confirm-password"
                      type={showConfirmPassword ? "text" : "password"}
                      {...registerForm.register('confirmPassword')}
                      onFocus={handleFocusConfirmPassword}
                      onBlur={handleBlurConfirmPassword}
                      className="w-full"
                    />
                    <button
  type="button"
  className="absolute right-0 top-0 h-full px-3"
  onMouseDown={(event) => {
    event.preventDefault();
    event.stopPropagation();
    setShowConfirmPassword(!showConfirmPassword);
  }}
>
  {showConfirmPassword ? (
    <EyeOffIcon className="h-5 w-5 text-gray-600" />
  ) : (
    <EyeIcon className="h-5 w-5 text-gray-600" />
  )}
</button>

                  </div>
                  {registerForm.formState.errors.confirmPassword && (
                    <p className="text-sm text-destructive">{registerForm.formState.errors.confirmPassword.message}</p>
                  )}
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Register"
                  )}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}