"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Excalidraw, convertToExcalidrawElements } from "@excalidraw/excalidraw";
import type {
  ExcalidrawImperativeAPI,
  ExcalidrawInitialDataState,
} from "@excalidraw/excalidraw/types";
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

const API_BASE = process.env.NEXT_PUBLIC_API_BASE!;
const DEMO_USER_ID = process.env.NEXT_PUBLIC_DEMO_USER_ID || "demo-user";

/**
 * Your DB stores a wrapper object like:
 * {
 *   type, version, updatedAt, boardId,
 *   elements, appState, files
 * }
 *
 * Excalidraw wants ONLY:
 * { elements, appState, files }
 */
function normalizeScene(raw: any): ExcalidrawInitialDataState {
  const elements = raw?.elements ?? raw?.scene?.elements ?? [];
  const files = raw?.files ?? raw?.scene?.files ?? {};
  const appStateRaw = raw?.appState ?? raw?.scene?.appState ?? {};

  return {
    elements,
    files,
    appState: {
      // sensible defaults
      viewBackgroundColor: "#ffffff",
      theme: "light",

      // safe restore
      ...appStateRaw,

      // 🔥 HARD FIX: collaborators must NOT be an object
      // Excalidraw calls .forEach on it internally.
      collaborators: Array.isArray(appStateRaw?.collaborators)
        ? appStateRaw.collaborators
        : [],
    },
  };
}

export default function ExcalidrawWrapper() {
  const { boardId } = useParams<{ boardId: string }>();

  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const saveTimer = useRef<NodeJS.Timeout | null>(null);

  const [initialData, setInitialData] =
    useState<ExcalidrawInitialDataState | null>(null);

  const fallbackInitialData = useMemo<ExcalidrawInitialDataState>(() => {
    const skeleton = [
      { type: "rectangle", x: 100, y: 100, width: 260, height: 120 },
      { type: "text", x: 130, y: 140, text: "Hello world", fontSize: 34 },
      { type: "arrow", x: 160, y: 170, width: 140, height: 60 },
    ] satisfies SceneElement[];

    return {
      elements: convertToExcalidrawElements(skeleton),
      appState: {
        viewBackgroundColor: "#ffffff",
        theme: "light",
        collaborators: [],
      },
      files: {},
    };
  }, []);

  // -----------------------------
  // LOAD SCENE
  // -----------------------------
  useEffect(() => {
    if (!boardId) return;

    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(`${API_BASE}/boards/${boardId}/scene`, {
          headers: { "x-user-id": DEMO_USER_ID },
        });

        if (!res.ok) {
          if (!cancelled) setInitialData(fallbackInitialData);
          return;
        }

        const raw = await res.json();
        const normalized = normalizeScene(raw);

        if (!cancelled) setInitialData(normalized);
      } catch (err) {
        console.error("Failed to load scene:", err);
        if (!cancelled) setInitialData(fallbackInitialData);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [boardId, fallbackInitialData]);

  // -----------------------------
  // SAVE SCENE (DEBOUNCED)
  // -----------------------------
  const scheduleSave = () => {
    if (!apiRef.current) return;
    if (!boardId) return;

    if (saveTimer.current) clearTimeout(saveTimer.current);

    saveTimer.current = setTimeout(async () => {
      const api = apiRef.current;
      if (!api) return;

      const s = api.getAppState();

      /**
       * DO NOT STORE FULL APPSTATE.
       * - It contains Maps (collaborators) and runtime-only UI junk.
       * - JSON stringify will corrupt it.
       */
      const payload = {
        type: "excalidraw",
        version: 1,
        updatedAt: Date.now(),
        boardId,

        elements: api.getSceneElements(),
        files: api.getFiles(),

        appState: {
          // safe + useful
          viewBackgroundColor: s.viewBackgroundColor,
          theme: s.theme,
          zoom: s.zoom,
          scrollX: s.scrollX,
          scrollY: s.scrollY,
          gridSize: s.gridSize,
        },
      };

      try {
        await fetch(`${API_BASE}/boards/${boardId}/scene`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "x-user-id": DEMO_USER_ID,
          },
          body: JSON.stringify(payload),
        });
      } catch (err) {
        console.error("Failed to save scene:", err);
      }
    }, 700);
  };

  // -----------------------------
  // RENDER
  // -----------------------------
  if (!initialData) {
    return (
      <div className="h-screen w-screen bg-neutral-950 p-6 text-white">
        Loading…
      </div>
    );
  }

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
