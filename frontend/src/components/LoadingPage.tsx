"use client";

import React, { useEffect } from "react";
import { LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";

export default function LoadingPage() {
  const { isLoaded, isSignedIn } = useUser();
  const router = useRouter();

  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      router.push("/sign-in");
    }
  }, [isLoaded, isSignedIn, router]);

  if (!isLoaded) {
    return (
      <div className="flex h-screen items-center justify-center bg-black">
        <div className="flex items-center gap-3 text-2xl font-semibold text-white">
          <LoaderCircle className="h-6 w-6 animate-spin" />
          <h1>Loading…</h1>
        </div>
      </div>
    );
  }

  return null;
}