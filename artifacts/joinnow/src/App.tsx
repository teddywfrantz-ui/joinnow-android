import { Switch, Route, Redirect, Router as WouterRouter } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { ImagePreloader } from "@/components/common/image-preloader";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import AuthPage from "@/pages/auth-page";
import RateParticipantsPage from "@/pages/rate-participants";
import ProfilePage from "@/pages/profile-page";
import EditProfilePage from "@/pages/edit-profile";
import SettingsPage from "@/pages/settings-page";
import LeaderboardPage from "@/pages/leaderboard-page";
import TokenTestPage from "@/pages/token-test";
import MessagesPage from "@/pages/messages-page";
import { MainLayout } from "@/components/layout/main-layout";

// Wrapper component for pages that need the main layout
const WithMainLayout = ({ children }: { children: React.ReactNode }) => (
  <MainLayout>{children}</MainLayout>
);

function Router() {
  return (
    <Switch>
      <Route path="/auth" component={AuthPage} />
      <Route path="/" component={() => <Redirect to="map" />} />
      <Route path="/map" component={Home} />
      <Route path="/active-meet" component={Home} />
      <Route
        path="/messages"
        component={() => (
          <WithMainLayout>
            <MessagesPage />
          </WithMainLayout>
        )}
      />
      <Route path="/friends" component={Home} />
      <Route path="/groups" component={Home} />
      <Route path="/profile" component={() => <WithMainLayout><ProfilePage key="profile-default" /></WithMainLayout>} />
      <Route path="/edit-profile" component={() => <WithMainLayout><EditProfilePage /></WithMainLayout>} />
      <Route path="/profile/:userId" component={(params) => {
        if (params.params.userId === 'settings') {
          return <Redirect to="/settings" />;
        }
        if (params.params.userId === 'edit') {
          return <Redirect to="/edit-profile" />;
        }
        // Generate a unique key based on the userId to force component remounting when navigating between profiles
        return <WithMainLayout><ProfilePage key={`profile-${params.params.userId}`} /></WithMainLayout>;
      }} />
      <Route path="/test-profile" component={() => <Redirect to="/profile/10" />} />
      <Route path="/settings" component={() => <WithMainLayout><SettingsPage /></WithMainLayout>} />
      <Route path="/leaderboard" component={() => <LeaderboardPage />} />
      <Route path="/leaderboards" component={() => <LeaderboardPage />} />
      <Route path="/rate/:meetupId" component={(params) => {
        // Ensure we have a valid meetupId before rendering
        if (!params.params.meetupId) return <Redirect to="/map" />;
        return <RateParticipantsPage />;
      }} />
      {/* JWT Token Test route for debugging */}
      <Route path="/token-test" component={() => <WithMainLayout><TokenTestPage /></WithMainLayout>} />
      {/* Catch-all route - render home if path begins with defined tabs */}
      <Route path="/:catchAll+" component={(params) => {
        const validPaths = [
          "map",
          "active-meet",
          "friends",
          "groups",
          "settings",
          "leaderboard",
          "leaderboards",
          "messages",
        ];
        const path = params.params["catchAll+"] || "";
        if (validPaths.includes(path)) {
          return <Home />;
        }
        return <NotFound />;
      }} />
    </Switch>
  );
}

function App() {
  // Define the list of images to preload
  const imagesToPreload = [
    "/images/joinup-logo.png",
    "/images/joinup-logo-dark.png"
  ];

  return (
    <QueryClientProvider client={queryClient}>
      {/* Preload all theme-related images at application start */}
      <ImagePreloader imagePaths={imagesToPreload} />
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
        <Router />
      </WouterRouter>
      <Toaster />
    </QueryClientProvider>
  );
}

export default App;