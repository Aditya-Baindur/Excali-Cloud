"use client";

import React, { useMemo, useRef } from "react";
import { Excalidraw, convertToExcalidrawElements } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import "@excalidraw/excalidraw/index.css";

import { useParams } from "next/navigation";

type SceneElement =
  | { type: "rectangle"; x: number; y: number; width: number; height: number }
  | { type: "text"; x: number; y: number; text: string; fontSize?: number }
  | {
      type: "arrow" | "line";
      x: number;
      y: number;
      width: number;
      height: number;
      endArrowhead?: "arrow" | null;
      startArrowhead?: "arrow" | null;
    };

export default function ExcalidrawWrapper() {
  const { boardId } = useParams<{ boardId: string }>();

  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const saveTimer = useRef<NodeJS.Timeout | null>(null);

  const initialData = useMemo(() => {
    const skeleton = [
      { type: "rectangle", x: 100, y: 100, width: 200, height: 100 },
      { type: "text", x: 120, y: 135, text: "Hello world", fontSize: 40 },
      { type: "arrow", x: 150, y: 150, width: 90, height: 40 },
    ] satisfies SceneElement[];

    return {
      elements: convertToExcalidrawElements(skeleton),
      appState: { viewBackgroundColor: "#ffffff" },
    };
  }, []);

  const scheduleSave = () => {
    if (!apiRef.current) return;

    if (saveTimer.current) clearTimeout(saveTimer.current);

    saveTimer.current = setTimeout(async () => {
      const api = apiRef.current;
      if (!api) return;

      const payload = {
        type: "excalidraw",
        version: 1,
        updatedAt: Date.now(),
        boardId, // ✅ include it here

        elements: api.getSceneElements(),
        appState: api.getAppState(),
        files: api.getFiles(),
      };

      await fetch("/api/excalidraw/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      console.log("saved scene JSON");
    }, 800);
  };

  return (
    <div className="h-screen w-screen">
      <Excalidraw
        initialData={initialData}
        excalidrawAPI={(api) => (apiRef.current = api)}
        onChange={scheduleSave}
      />
    </div>
  );
}
