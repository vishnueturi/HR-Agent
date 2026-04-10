"use client";

import * as React from "react";
import * as ProgressPrimitive from "@radix-ui/react-progress";

import { cn } from "./utils";

function Progress({
  className,
  value,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root>) {
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      className={cn(
        "bg-primary/20 relative h-2 w-full overflow-hidden rounded-full",
        className,
      )}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className="ui-progress-indicator bg-primary h-full w-full flex-1 transition-all"
        style={
          {
            "--progress": value ?? 0,
          } as React.CSSProperties
        }
      />
    </ProgressPrimitive.Root>
  );
}

export { Progress };
