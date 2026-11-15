import { cn } from "@/lib/utils"

function Skeleton({
  className = undefined,
  ...props
}) {
  return (
    <div
      data-slot="skeleton"
      className={cn("animate-pulse rounded-md bg-accent", className)}
      {...props}
    />
  )
}

export { Skeleton }
