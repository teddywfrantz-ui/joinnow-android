import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Loader2,
  Send,
  Smile,
  Users,
} from "lucide-react";
import EmojiPicker, { EmojiClickData, Theme } from "emoji-picker-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ProfileAvatar } from "@/components/common/profile-avatar";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/hooks/use-user";
import { useIsMobile } from "@/hooks/use-mobile";

import { cn } from "@/lib/utils";

export interface GroupMessage {
  id: number;
  groupId: number;
  userId: number;
  content: string;
  createdAt: string;
  username: string;
  displayName?: string | null;
  profilePicture?: string | null;
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(payload?.error || "Unable to load group chat");
  return payload as T;
}

export function GroupChat({
  groupId,
  groupName,
  memberCount,
  hasCurrentMeetup = false,
  fullHeight = false,
  readOnly = false,
  statusMessage,
}: {
  groupId: number;
  groupName: string;
  memberCount: number;
  hasCurrentMeetup?: boolean;
  fullHeight?: boolean;
  readOnly?: boolean;
  statusMessage?: string;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useUser();
  const isMobile = useIsMobile();
  const [content, setContent] = useState("");
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const messagesQuery = useQuery<GroupMessage[]>({
    queryKey: [`/api/groups/${groupId}/messages`],
    queryFn: () =>
      requestJson<GroupMessage[]>(`/api/groups/${groupId}/messages`),
    staleTime: 0,
    refetchInterval: 5000,
    refetchOnWindowFocus: true,
  });
  const sendMutation = useMutation({
    mutationFn: (message: string) =>
      requestJson<GroupMessage>(`/api/groups/${groupId}/messages`, {
        method: "POST",
        body: JSON.stringify({ content: message }),
      }),
    onSuccess: () => {
      setContent("");
      queryClient.invalidateQueries({
        queryKey: [`/api/groups/${groupId}/messages`],
      });
    },
    onError: (error: Error) =>
      toast({
        title: "Message not sent",
        description: error.message,
        variant: "destructive",
      }),
  });

  useEffect(() => {
    const container = scrollRef.current;
    if (container) container.scrollTop = container.scrollHeight;
  }, [messagesQuery.data?.length]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = content.trim();
    if (!trimmed || sendMutation.isPending) return;
    sendMutation.mutate(trimmed);
  };

  const quickEmojis = [
    "👍",
    "👏",
    "❤️",
    "😂",
    "😮",
    "😢",
    "😡",
    "🎉",
    "👋",
    "🙏",
    "✅",
    "🔥",
    "⭐",
    "🤔",
  ];

  const messageList = messagesQuery.isError ? (
    <div className="flex h-full flex-col items-center justify-center p-4 text-center">
      <p className="font-semibold text-destructive">Failed to load chat</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Please try refreshing the chat.
      </p>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="mt-4"
        onClick={() => messagesQuery.refetch()}
      >
        Retry
      </Button>
    </div>
  ) : (
    <div
      ref={scrollRef}
      className={cn(
        "flex-1 overflow-y-auto overscroll-contain px-4 hide-scrollbar",
        fullHeight ? "min-h-0" : "h-64 sm:h-72"
      )}
      aria-live="polite"
    >
      <div className="flex flex-col space-y-6 py-6 pb-[160px]">
        {readOnly && statusMessage && (
          <div className="sticky top-2 z-10 mx-auto rounded-full border bg-background/95 px-4 py-2 text-center text-sm font-medium text-muted-foreground shadow-sm backdrop-blur">
            {statusMessage}
          </div>
        )}
        {messagesQuery.isLoading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : messagesQuery.data?.length ? (
          messagesQuery.data.map((message) => {
            const isOwnMessage = message.userId === user?.id;
            return (
              <div
                key={message.id}
                className={cn(
                  "mb-3 flex",
                  isOwnMessage ? "justify-end" : "justify-start"
                )}
              >
                {!isOwnMessage && (
                  <div className="mr-2 flex-shrink-0 self-end pb-1">
                    <ProfileAvatar
                      profilePicture={message.profilePicture}
                      username={message.username}
                      displayName={message.displayName}
                      size="sm"
                    />
                  </div>
                )}
                {isOwnMessage && (
                  <div className="order-last ml-2 flex-shrink-0 self-end pb-1">
                    <ProfileAvatar
                      profilePicture={user?.profilePicture || message.profilePicture}
                      username={user?.username || message.username}
                      size="sm"
                    />
                  </div>
                )}
                <div className="group relative flex max-w-[85%] flex-col">
                  <div
                    className={cn(
                      "max-w-full break-words rounded-lg px-4 py-2 shadow-sm",
                      isOwnMessage
                        ? "bg-primary text-primary-foreground"
                        : "border bg-background"
                    )}
                  >
                    {!isOwnMessage && (
                      <div className="mb-1 text-[15px] font-medium">
                        {message.displayName || message.username}
                      </div>
                    )}
                    <div className="break-words whitespace-pre-wrap text-[15px] leading-relaxed">
                      {message.content}
                    </div>
                    <div className="mt-1.5 flex items-center justify-between gap-1.5">
                      <time
                        className="text-[15px] opacity-70"
                        dateTime={message.createdAt}
                      >
                        {format(new Date(message.createdAt), "h:mm a")}
                      </time>
                      {isOwnMessage && sendMutation.isPending && (
                        <Loader2 className="h-3 w-3 animate-spin text-primary-foreground/70" />
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="py-8 text-center text-muted-foreground">
            No messages yet. Start the conversation!
          </div>
        )}
      </div>
    </div>
  );

  const composer = (
    <div
      className={cn(
        "border-t bg-background p-3",
        fullHeight
          ? cn(
              "fixed left-0 right-0 z-50 mx-auto w-full max-w-[100vw] shadow-lg",
              isMobile
                ? "bottom-0 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
                : "bottom-0"
            )
          : "shrink-0",
        fullHeight && "pb-3 pt-2"
      )}
      style={
        fullHeight
          ? { maxWidth: scrollRef.current?.clientWidth || "100%" }
          : undefined
      }
    >
      <div className="space-y-2">
        <form onSubmit={submit} className="flex w-full items-center gap-2">
          <div className="relative flex flex-1 items-center gap-1">
            <Popover
              open={emojiPickerOpen}
              onOpenChange={setEmojiPickerOpen}
            >
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-9 w-9 flex-shrink-0"
                  onClick={() => setEmojiPickerOpen(!emojiPickerOpen)}
                >
                  <Smile className="h-5 w-5 text-muted-foreground" />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                className="w-full p-0 shadow-lg"
                side="top"
                align="start"
              >
                <EmojiPicker
                  onEmojiClick={(emojiData: EmojiClickData) => {
                    setContent((previous) => previous + emojiData.emoji);
                    setEmojiPickerOpen(false);
                  }}
                  searchDisabled={true}
                  width="100%"
                  height={350}
                  theme={Theme.AUTO}
                />
              </PopoverContent>
            </Popover>
            <Input
              value={content}
              onChange={(event) => setContent(event.target.value)}
              placeholder="Type a message..."
              maxLength={1000}
              aria-label="Group chat message"
              disabled={sendMutation.isPending}
              className="h-10 flex-1"
            />
          </div>
          <Button
            type="submit"
            size="icon"
            aria-label="Send group chat message"
            disabled={!content.trim() || sendMutation.isPending}
          >
            {sendMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </form>
        <div className="flex items-center gap-1.5 overflow-x-auto rounded-lg border bg-muted/30 px-2 py-1 hide-scrollbar">
          <span className="mr-1 flex-shrink-0 whitespace-nowrap text-[15px] font-medium text-muted-foreground">
            Quick:
          </span>
          {quickEmojis.map((emoji) => (
            <Button
              key={emoji}
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-7 flex-shrink-0 rounded-full p-0 hover:bg-accent"
              disabled={sendMutation.isPending}
              onClick={() => sendMutation.mutate(emoji)}
            >
              <span className="text-base">{emoji}</span>
            </Button>
          ))}
        </div>
      {sendMutation.isError && (
        <div className="mt-2 flex items-center justify-between gap-2 text-xs text-destructive">
          <span>
            {sendMutation.error instanceof Error
              ? sendMutation.error.message
              : "Message could not be sent. Try again."}
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              const retryContent = content.trim();
              if (retryContent) sendMutation.mutate(retryContent);
            }}
          >
            Retry
          </Button>
        </div>
      )}
      </div>
    </div>
  );

  if (fullHeight) {
    return (
      <div className="flex h-full min-h-0 flex-col overflow-hidden bg-card">
        {messageList}
        {!readOnly && composer}
      </div>
    );
  }

  return (
    <Card className="overflow-hidden border-primary/25">
      <CardHeader className="gap-2 bg-primary/[0.04] pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-base">Your group chat</CardTitle>
              <Badge variant="secondary" className="gap-1 text-[11px]">
                <Users className="h-3 w-3" />
                Members only
              </Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              A private conversation for {groupName}.
            </p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          This chat stays with your group.{" "}
          {hasCurrentMeetup
            ? "Your Meet conversation is separate in the active Meet."
            : "If you join a Meet, its conversation will be separate."}
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {messageList}
        {!readOnly && composer}
      </CardContent>
    </Card>
  );
}