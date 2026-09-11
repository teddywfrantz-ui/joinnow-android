import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Users } from "lucide-react";
import type { Group } from "@db/schema";

interface GroupCardProps {
  group: Group;
  onAddMember?: () => void;
  onLeave?: () => void;
}

export function GroupCard({ group, onAddMember, onLeave }: GroupCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-lg font-bold">{group.name}</CardTitle>
        <Users className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Created {new Date(group.createdAt).toLocaleDateString()}
        </p>
      </CardContent>
      <CardFooter className="flex justify-between">
        {onAddMember && (
          <Button 
            variant="outline" 
            size="sm"
            onClick={onAddMember}
          >
            Add Member
          </Button>
        )}
        {onLeave && (
          <Button 
            variant="destructive" 
            size="sm"
            onClick={onLeave}
          >
            Leave Group
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
