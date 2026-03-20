import { useCallback, useRef, useState } from 'react';

export interface ZoomPanState {
  scale: number;
  translateX: number;
  translateY: number;
}

export function useZoomPan(minScale = 0.3, maxScale = 3) {
  const [state, setState] = useState<ZoomPanState>({ scale: 1, translateX: 0, translateY: 0 });
  const dragging = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setState((prev) => ({
      ...prev,
      scale: Math.min(maxScale, Math.max(minScale, prev.scale * delta)),
    }));
  }, [minScale, maxScale]);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    dragging.current = true;
    lastPos.current = { x: e.clientX, y: e.clientY };
  }, []);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging.current) return;
    const dx = e.clientX - lastPos.current.x;
    const dy = e.clientY - lastPos.current.y;
    lastPos.current = { x: e.clientX, y: e.clientY };
    setState((prev) => ({
      ...prev,
      translateX: prev.translateX + dx,
      translateY: prev.translateY + dy,
    }));
  }, []);

  const onMouseUp = useCallback(() => {
    dragging.current = false;
  }, []);

  const zoomIn = useCallback(() => {
    setState((prev) => ({ ...prev, scale: Math.min(maxScale, prev.scale * 1.3) }));
  }, [maxScale]);

  const zoomOut = useCallback(() => {
    setState((prev) => ({ ...prev, scale: Math.max(minScale, prev.scale * 0.7) }));
  }, [minScale]);

  const reset = useCallback(() => {
    setState({ scale: 1, translateX: 0, translateY: 0 });
  }, []);

  const transform = `translate(${state.translateX}px, ${state.translateY}px) scale(${state.scale})`;
  const svgTransform = `translate(${state.translateX}, ${state.translateY}) scale(${state.scale})`;

  const handlers = { onWheel, onMouseDown, onMouseMove, onMouseUp, onMouseLeave: onMouseUp };

  return { state, transform, svgTransform, handlers, zoomIn, zoomOut, reset };
}
