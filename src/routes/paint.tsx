import { useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { PaintEditor } from "@/components/engine/PaintEditor";
import type { SpriteAsset } from "@/lib/engine/core";

export const Route = createFileRoute("/paint")({
  head: () => ({ meta: [{ title: "Dibujar · Asternal" }] }),
  component: PaintPage,
});

const STORAGE_KEY = "gallery:pending-artwork";

function PaintPage() {
  useEffect(() => {
    // Clean any stale key on mount
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
  }, []);

  const handleSave = (sprite: SpriteAsset) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sprite));
      // Small delay so the storage event propagates, then close
      setTimeout(() => window.close(), 100);
    } catch {
      // If localStorage is full or unavailable, try postMessage fallback
      if (window.opener) {
        window.opener.postMessage(
          { type: "gallery:artwork-saved", sprite },
          window.location.origin,
        );
      }
      setTimeout(() => window.close(), 100);
    }
  };

  const handleClose = () => {
    window.close();
  };

  return <PaintEditor onSave={handleSave} onClose={handleClose} size={512} />;
}
