import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Inbox,
  Loader2,
  MessageSquare,
  Star,
  Users,
} from "lucide-react";
import type { User } from "@db/schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ChatWindow } from "@/components/chat/chat-window";
import { GroupChat } from "@/components/groups/group-chat";
import { useIsMobile } from "@/hooks/use-mobile";
import { useUser } from "@/hooks/use-user";
import { cn } from "@/lib/utils";

type ConversationStatus =
  | "active"
  | "completed"
  | "disbanded"
  | "left"
  | "removed"
  | "switched";

type ConversationSummary = {
  kind: "group" | "meetup";
  id: number;
  title: string;
  subtitle?: string | null;
  createdAt: string;
  endedAt?: string | null;
  status: ConversationStatus;
  readOnly: boolean;
  latestContent?: string | null;
  latestUsername?: string | null;
  latestDisplayName?: string | null;
  latestCreatedAt?: string | null;
};

function conversationKey(conversation: ConversationSummary) {
  return `${conversation.kind}:${conversation.id}`;
}

const MESSAGES_SELECTION_STORAGE_KEY = "joinnow:messages-selection";

function statusLabel(status: ConversationStatus) {
  switch (status) {
    case "active":
      return "Active";
    case "completed":
      return "Completed";
    case "disbanded":
      return "Disbanded";
    case "removed":
      return "Removed";
    case "left":
      return "Left";
    case "switched":
      return "Left";
    default:
      return "Left";
  }
}

function statusMessage(conversation: ConversationSummary) {
  if (conversation.kind === "meetup") {
    return conversation.status === "completed"
      ? "This Meet has completed. This conversation is read-only."
      : "You left this Meet. Messages after you left are hidden.";
  }
  switch (conversation.status) {
    case "disbanded":
      return "This group has ended. This conversation is read-only.";
    case "removed":
      return "You were removed from this group. You can view messages from before your removal, but later messages are hidden.";
    case "left":
    case "switched":
      return "You left this group. You can view messages from before you left, but later messages are hidden.";
    default:
      return "This group conversation is read-only.";
  }
}

function MessagesContent({ user }: { user: User }) {
  const [, setLocation] = useLocation();
  const isMobile = useIsMobile();
  const [selectedKey, setSelectedKey] = useState<string | null>(() => {
    try {
      return window.sessionStorage.getItem(MESSAGES_SELECTION_STORAGE_KEY);
    } catch {
      return null;
    }
  });
  const {
    data: conversations = [],
    isLoading,
    isError,
    refetch,
  } = useQuery<ConversationSummary[]>({
    queryKey: ["/api/conversations"],
    staleTime: 1000,
    refetchInterval: 5000,
  });

  const selectedConversation = useMemo(
    () =>
      conversations.find(
        (conversation) => conversationKey(conversation) === selectedKey,
      ) ?? null,
    [conversations, selectedKey],
  );

  useEffect(() => {
    if (isLoading) {
      return;
    }

    const requestedKind = new URLSearchParams(window.location.search).get(
      "chat",
    );
    const requested =
      requestedKind === "group" || requestedKind === "meetup"
        ? conversations.find(
            (conversation) =>
              conversation.kind === requestedKind &&
              conversation.status === "active",
          )
        : null;
    if (requested) {
      setSelectedKey(conversationKey(requested));
      return;
    }

    if (
      selectedKey &&
      !conversations.some(
        (conversation) => conversationKey(conversation) === selectedKey,
      )
    ) {
      setSelectedKey(null);
    }
  }, [conversations, isLoading, selectedKey]);

  useEffect(() => {
    try {
      if (selectedKey) {
        window.sessionStorage.setItem(
          MESSAGES_SELECTION_STORAGE_KEY,
          selectedKey,
        );
      } else {
        window.sessionStorage.removeItem(MESSAGES_SELECTION_STORAGE_KEY);
      }
    } catch {
      // Session storage may be unavailable in restricted browser contexts.
    }
  }, [selectedKey]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const showList = !isMobile || !selectedConversation;
  const showConversation = !isMobile || Boolean(selectedConversation);

  return (
    <div className="flex h-[calc(100vh-5rem)] w-full gap-4 pt-4 md:h-[calc(100vh-2rem)] md:pt-0">
      {showList && (
        <div
          className={cn(
            "flex w-full flex-shrink-0 flex-col gap-4 md:w-80 lg:w-96",
            conversations.length === 0 && "md:w-full",
          )}
        >
          <div className="flex shrink-0 items-center justify-between px-1">
            <h1 className="text-2xl font-bold tracking-tight">Messages</h1>
          </div>

          {isError ? (
            <Card className="flex flex-1 flex-col items-center justify-center p-8 text-center">
              <h2 className="text-lg font-semibold">Messages did not load</h2>
              <Button className="mt-4" variant="outline" onClick={() => refetch()}>
                Try again
              </Button>
            </Card>
          ) : conversations.length === 0 ? (
            <Card className="flex flex-1 flex-col items-center justify-center border-dashed bg-muted/30 p-8 text-center">
              <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                <Inbox className="h-8 w-8 text-primary" />
              </div>
              <h2 className="mb-2 text-xl font-semibold">
                No conversations yet
              </h2>
              <p className="mb-8 max-w-sm text-sm text-muted-foreground">
                Join a group or Meet to start chatting.
              </p>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Button
                  onClick={() => setLocation("/groups")}
                  variant="outline"
                  className="h-11"
                >
                  Find a group
                </Button>
                <Button onClick={() => setLocation("/map")} className="h-11">
                  Browse map
                </Button>
              </div>
            </Card>
          ) : (
            <div className="flex flex-1 flex-col gap-3 overflow-y-auto pb-4 pr-1">
              {conversations.map((conversation) => {
                const key = conversationKey(conversation);
                const isSelected = key === selectedKey;
                return (
                  <button
                    key={key}
                    onClick={() => setSelectedKey(key)}
                    className={cn(
                      "flex flex-col rounded-xl border p-4 text-left transition-all",
                      isSelected
                        ? "border-primary/40 bg-primary/[0.08] shadow-sm ring-1 ring-primary/20"
                        : "border-border bg-card hover:bg-accent/50",
                    )}
                  >
                    <div className="mb-1 flex w-full items-start justify-between">
                      <span className="flex min-w-0 items-center gap-2 truncate pr-2 font-semibold">
                        {conversation.kind === "group" ? (
                          <Users className="h-4 w-4 shrink-0 text-primary" />
                        ) : (
                          <Star className="h-4 w-4 shrink-0 text-primary" />
                        )}
                        <span className="truncate">{conversation.title}</span>
                      </span>
                      <div className="flex shrink-0 gap-1">
                        <Badge
                          variant="secondary"
                          className="bg-primary/10 text-[10px] font-semibold uppercase text-primary"
                        >
                          {conversation.kind === "group" ? "Group" : "Meet"}
                        </Badge>
                        {conversation.status !== "active" && (
                          <Badge
                            variant="outline"
                            className="text-[10px] font-semibold uppercase"
                          >
                            {statusLabel(conversation.status)}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="mb-3 text-xs font-medium text-muted-foreground">
                      {conversation.subtitle ||
                        (conversation.readOnly
                          ? "Conversation history"
                          : "Active conversation")}
                    </div>
                    {conversation.latestContent ? (
                      <div className="w-full truncate text-sm text-muted-foreground">
                        <span className="font-medium text-foreground/80">
                          {conversation.latestDisplayName ||
                            conversation.latestUsername}
                          :
                        </span>{" "}
                        {conversation.latestContent}
                      </div>
                    ) : (
                      <div className="text-sm italic text-muted-foreground/50">
                        No messages yet
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {showConversation && conversations.length > 0 && (
        <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden bg-background shadow-sm md:rounded-2xl md:border md:border-border/50">
          {isMobile && selectedConversation && (
            <div className="z-10 flex shrink-0 items-center gap-2 border-b bg-card p-3 shadow-sm">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSelectedKey(null)}
                className="h-9 w-9"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div className="truncate text-lg font-semibold">
                {selectedConversation.title}
              </div>
            </div>
          )}

          {!selectedConversation && !isMobile ? (
            <div className="flex flex-1 flex-col items-center justify-center bg-muted/10 text-muted-foreground/60">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted/30">
                <MessageSquare className="h-8 w-8 opacity-50" />
              </div>
              <p className="font-medium">
                Select a conversation to start chatting
              </p>
            </div>
          ) : selectedConversation?.kind === "group" ? (
            <GroupChat
              groupId={selectedConversation.id}
              groupName={selectedConversation.title}
              memberCount={0}
              fullHeight={true}
              readOnly={selectedConversation.readOnly}
              statusMessage={
                selectedConversation.readOnly
                  ? statusMessage(selectedConversation)
                  : undefined
              }
            />
          ) : selectedConversation?.kind === "meetup" ? (
            <div className="relative flex-1 overflow-hidden bg-card [&>div]:!h-full [&>div]:!min-h-0">
              <ChatWindow
                meetupId={selectedConversation.id}
                currentUserId={user.id}
                currentUsername={user.username || "Anonymous"}
                currentUserPicture={user.profilePicture}
                isMobileChat={isMobile}
                showToggleDetails={false}
                readOnly={selectedConversation.readOnly}
                statusMessage={
                  selectedConversation.readOnly
                    ? statusMessage(selectedConversation)
                    : undefined
                }
              />
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

export default function MessagesPage() {
  const [, setLocation] = useLocation();
  const { user, isLoading } = useUser();

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Card className="max-w-md p-8 text-center">
          <MessageSquare className="mx-auto mb-4 h-10 w-10 text-primary" />
          <h1 className="text-xl font-semibold">
            Your conversations live here
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Sign in to open your group and Meet messages.
          </p>
          <Button className="mt-6" onClick={() => setLocation("/auth")}>
            Sign in
          </Button>
        </Card>
      </div>
    );
  }

  return <MessagesContent user={user} />;
}