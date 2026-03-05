"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Excalidraw, convertToExcalidrawElements } from "@excalidraw/excalidraw";
import type {
  ExcalidrawImperativeAPI,
  ExcalidrawInitialDataState,
  BinaryFiles,
} from "@excalidraw/excalidraw/types";

import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";

import "@excalidraw/excalidraw/index.css";

import { useParams } from "next/navigation";
import LoadingPage from "@/components/LoadingPage";
import { useUser } from "@clerk/nextjs";

type SceneElement =
  | { type: "rectangle"; x: number; y: number; width: number; height: number }
  | { type: "text"; x: number; y: number; text: string; fontSize?: number }
  | {
      type: "arrow" | "line";
      x: number;
      y: number;
      width: number;
      height: number;
    };

type RawScene = {
  elements?: unknown;
  files?: unknown;
  appState?: unknown;
};

function normalizeScene(raw: RawScene): ExcalidrawInitialDataState {
  return {
    elements: (raw.elements ?? []) as readonly ExcalidrawElement[],
    files: (raw.files ?? {}) as BinaryFiles,
    appState: {
      viewBackgroundColor: "#ffffff",
      theme: "light",
      collaborators: new Map(),
    },
  };
}

export default function ExcalidrawWrapper() {
  const { boardId } = useParams<{ boardId: string }>();
  const { user, isLoaded } = useUser();

  const USER_ID = user?.id;
  const API_BASE = process.env.NEXT_PUBLIC_API_BASE!;

  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      files: {} as BinaryFiles,
      appState: {
        viewBackgroundColor: "#ffffff",
        theme: "light",
        collaborators: new Map(),
      },
    };
  }, []);

  // ---------------- LOAD SCENE ----------------
  useEffect(() => {
    if (!isLoaded || !USER_ID || !boardId) return;

    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(`${API_BASE}/boards/${boardId}/scene`, {
          headers: { "x-user-id": USER_ID },
        });

        if (!res.ok) {
          if (!cancelled) setInitialData(fallbackInitialData);
          return;
        }

        const raw: RawScene = await res.json();
        const normalized = normalizeScene(raw);

        if (!cancelled) setInitialData(normalized);
      } catch {
        if (!cancelled) setInitialData(fallbackInitialData);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [boardId, USER_ID, isLoaded, API_BASE, fallbackInitialData]);

  // ---------------- SAVE SCENE ----------------
  const scheduleSave = () => {
    if (!apiRef.current || !boardId || !USER_ID) return;

    if (saveTimer.current) clearTimeout(saveTimer.current);

    saveTimer.current = setTimeout(async () => {
      const api = apiRef.current;
      if (!api) return;

      const s = api.getAppState();

      const payload = {
        elements: api.getSceneElements(),
        files: api.getFiles(),
        appState: {
          viewBackgroundColor: s.viewBackgroundColor,
          theme: s.theme,
          zoom: s.zoom,
          scrollX: s.scrollX,
          scrollY: s.scrollY,
        },
      };

      await fetch(`${API_BASE}/boards/${boardId}/scene`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": USER_ID,
        },
        body: JSON.stringify(payload),
      });
    }, 700);
  };

  // ---------------- RENDER ----------------
  if (!isLoaded || !initialData) {
    return <LoadingPage />;
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