import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";

const THRESHOLD = 8;

function isIgnored(target: EventTarget | null) {
  return Boolean(
    (target as HTMLElement | null)?.closest?.(
      "button, a, input, textarea, select, [data-hold-ignore]",
    ),
  );
}

function closestId(listId: string, clientY: number, skipId: string) {
  const nodes = document.querySelectorAll<HTMLElement>(
    `[data-hold-list="${listId}"][data-hold-id]`,
  );
  let bestId: string | null = null;
  let bestDist = Number.POSITIVE_INFINITY;
  nodes.forEach((node) => {
    const id = node.dataset.holdId;
    if (!id || id === skipId) return;
    const rect = node.getBoundingClientRect();
    const dist = Math.abs(clientY - (rect.top + rect.height / 2));
    if (dist < bestDist) {
      bestDist = dist;
      bestId = id;
    }
  });
  return bestId;
}

export function useHoldReorder(
  listId: string,
  onMove: (fromId: string, toId: string) => void,
  enabled = true,
) {
  const session = useRef<{
    id: string;
    startY: number;
    dragging: boolean;
  } | null>(null);
  const overRef = useRef<string | null>(null);
  const skipClick = useRef(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [dragY, setDragY] = useState(0);

  const finish = useCallback(
    (fromId: string, dragged: boolean) => {
      const toId = overRef.current;
      session.current = null;
      overRef.current = null;
      setDraggingId(null);
      setOverId(null);
      setDragY(0);
      if (dragged) skipClick.current = true;
      if (dragged && toId && toId !== fromId) onMove(fromId, toId);
    },
    [onMove],
  );

  useEffect(() => {
    if (!draggingId) return;
    const previousCursor = document.body.style.cursor;
    const previousSelect = document.body.style.userSelect;
    document.body.style.cursor = "grabbing";
    document.body.style.userSelect = "none";
    return () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousSelect;
    };
  }, [draggingId]);

  const bind = useCallback(
    (id: string) => {
      const dragging = draggingId === id;
      const over = overId === id && draggingId !== null && draggingId !== id;
      const style: CSSProperties | undefined = dragging
        ? {
            transform: `translate3d(0, ${dragY}px, 0) scale(1.03)`,
            zIndex: 50,
            position: "relative",
            boxShadow: "0 18px 40px rgba(0,0,0,0.55)",
            transition: "none",
            cursor: "grabbing",
            touchAction: "none",
          }
        : {
            touchAction: "none",
          };
      return {
        "data-hold-list": listId,
        "data-hold-id": id,
        "data-hold-dragging": dragging ? "true" : undefined,
        "data-hold-over": over ? "true" : undefined,
        style,
        onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
          if (!enabled || event.button !== 0 || isIgnored(event.target)) return;
          session.current = { id, startY: event.clientY, dragging: false };
          try {
            event.currentTarget.setPointerCapture(event.pointerId);
          } catch (err) {
            console.error("Pointer capture failed", err);
          }
        },
        onPointerMove: (event: ReactPointerEvent<HTMLElement>) => {
          const current = session.current;
          if (!current || current.id !== id) return;
          if (!current.dragging && Math.abs(event.clientY - current.startY) < THRESHOLD) {
            return;
          }
          if (!current.dragging) {
            current.dragging = true;
            setDraggingId(id);
          }
          event.preventDefault();
          setDragY(event.clientY - current.startY);
          const next = closestId(listId, event.clientY, id);
          overRef.current = next;
          setOverId(next);
        },
        onPointerUp: (event: ReactPointerEvent<HTMLElement>) => {
          const current = session.current;
          try {
            event.currentTarget.releasePointerCapture(event.pointerId);
          } catch {
            /* already released */
          }
          if (!current || current.id !== id) return;
          finish(id, current.dragging);
        },
        onPointerCancel: () => {
          session.current = null;
          overRef.current = null;
          setDraggingId(null);
          setOverId(null);
          setDragY(0);
        },
        onClickCapture: (event: { stopPropagation: () => void; preventDefault: () => void }) => {
          if (!skipClick.current) return;
          skipClick.current = false;
          event.stopPropagation();
          event.preventDefault();
        },
      };
    },
    [dragY, draggingId, enabled, finish, listId, overId],
  );

  return { bind, draggingId, overId };
}
