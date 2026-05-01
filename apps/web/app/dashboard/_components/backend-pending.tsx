import { AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/_components/ui/card";

interface Props { taskId: string; description: string; }

export function BackendPending({ taskId, description }: Props) {
  return (
    <Card className="border-dashed bg-muted/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base text-muted-foreground">
          <AlertCircle className="h-4 w-4" />
          Backend endpoint pending — {taskId}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">{description}</p>
        <p className="mt-2 text-xs text-muted-foreground">
          See <code className="font-mono">TODO.md</code> for status. UI is wired against the planned response shape and will activate when the endpoint lands.
        </p>
      </CardContent>
    </Card>
  );
}
