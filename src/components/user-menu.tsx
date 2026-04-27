"use client";

import { signOut, useSession } from "next-auth/react";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";

export function UserMenu() {
  const { data: session, status } = useSession();

  if (status !== "authenticated" || !session.user) return null;

  const { email, image, name } = session.user;
  const label = name ?? email ?? "Account";

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2 text-sm">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image}
            alt={label}
            className="size-7 rounded-full border border-border/50"
          />
        ) : (
          <div className="size-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary">
            {label.charAt(0).toUpperCase()}
          </div>
        )}
        <span className="text-muted-foreground hidden sm:inline">{email}</span>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => signOut({ callbackUrl: "/auth/signin" })}
        className="gap-1.5 text-muted-foreground hover:text-foreground"
      >
        <LogOut className="size-3.5" />
        <span className="hidden sm:inline">Sign out</span>
      </Button>
    </div>
  );
}
