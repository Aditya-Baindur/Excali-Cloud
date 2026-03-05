import React from "react";
import { LoaderCircle } from "lucide-react";


export default function LoadingPage() {
  return (
    <div className="flex h-screen items-center justify-center bg-black">
      <div className="flex items-center gap-3 text-2xl font-semibold text-white">
        <LoaderCircle className="h-6 w-6 animate-spin" />
        <h1>Loading…</h1>
      </div>
    </div>
  );
}