"use client";

import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/logo";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

function SignInContent() {
  const searchParams = useSearchParams();
  const errorParam = searchParams.get("error");
  const callbackUrl = searchParams.get("callbackUrl") ?? "/";

  let errorMessage: string | null = null;
  if (errorParam === "AccessDenied") {
    errorMessage = "Your account is not on the invite list yet. Reach out to the owner for access.";
  } else if (errorParam) {
    errorMessage = "Sign-in failed. Please try again.";
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-sm rounded-xl border border-border/50 bg-card/50 backdrop-blur p-8 shadow-sm">
        <div className="flex flex-col items-center text-center">
          <Logo className="size-12 mb-4 rounded-xl shadow-md" />
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-primary/70 mb-2">
            Travel Planner
          </p>
          <h1 className="font-serif text-3xl tracking-tight text-foreground">
            Welcome back
          </h1>
          <p className="text-muted-foreground mt-2 text-sm">
            Sign in with Google to plan your trips.
          </p>
        </div>

        {errorMessage && (
          <div className="mt-6 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {errorMessage}
          </div>
        )}

        <Button
          onClick={() => signIn("google", { callbackUrl })}
          size="lg"
          className="w-full mt-6 gap-2 font-medium"
        >
          Continue with Google
        </Button>
      </div>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={null}>
      <SignInContent />
    </Suspense>
  );
}
