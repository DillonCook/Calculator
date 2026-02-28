import { useLayoutEffect, useState, type CSSProperties, type RefObject } from 'react';

export type FloatingTooltipPlacement = 'top' | 'bottom';

interface UseFloatingTooltipPositionOptions {
  open: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  tooltipRef: RefObject<HTMLElement | null>;
  preferredPlacement?: FloatingTooltipPlacement;
  viewportPadding?: number;
  offset?: number;
  maxWidth?: number;
  fallbackHeight?: number;
  zIndex?: number;
}

interface FloatingTooltipPositionState {
  style: CSSProperties;
  placement: FloatingTooltipPlacement;
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export function useFloatingTooltipPosition({
  open,
  anchorRef,
  tooltipRef,
  preferredPlacement = 'bottom',
  viewportPadding = 12,
  offset = 10,
  maxWidth = 320,
  fallbackHeight = 180,
  zIndex = 170
}: UseFloatingTooltipPositionOptions): FloatingTooltipPositionState {
  const [state, setState] = useState<FloatingTooltipPositionState>({
    placement: preferredPlacement,
    style: {
      position: 'fixed',
      top: viewportPadding,
      left: viewportPadding,
      maxWidth: `min(${maxWidth}px, calc(100vw - ${viewportPadding * 2}px))`,
      zIndex,
      visibility: 'hidden'
    }
  });

  useLayoutEffect(() => {
    if (!open) return;

    let animationFrame = 0;
    let resizeObserver: ResizeObserver | null = null;

    const update = () => {
      const anchor = anchorRef.current;
      const tooltip = tooltipRef.current;
      if (!anchor || !tooltip) return;

      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const maxAllowedWidth = Math.max(viewportWidth - viewportPadding * 2, 140);

      const anchorRect = anchor.getBoundingClientRect();
      const tooltipRect = tooltip.getBoundingClientRect();
      const tooltipWidth = Math.min(tooltipRect.width || maxWidth, maxWidth, maxAllowedWidth);
      const tooltipHeight = tooltipRect.height || fallbackHeight;

      const spaceAbove = anchorRect.top - viewportPadding;
      const spaceBelow = viewportHeight - anchorRect.bottom - viewportPadding;

      let placement = preferredPlacement;
      if (placement === 'bottom' && spaceBelow < tooltipHeight + offset && spaceAbove > spaceBelow) {
        placement = 'top';
      } else if (placement === 'top' && spaceAbove < tooltipHeight + offset && spaceBelow > spaceAbove) {
        placement = 'bottom';
      }

      const maxLeft = Math.max(viewportPadding, viewportWidth - viewportPadding - tooltipWidth);
      const left = clamp(anchorRect.left + anchorRect.width / 2 - tooltipWidth / 2, viewportPadding, maxLeft);

      const unconstrainedTop = placement === 'bottom' ? anchorRect.bottom + offset : anchorRect.top - tooltipHeight - offset;
      const maxTop = Math.max(viewportPadding, viewportHeight - viewportPadding - tooltipHeight);
      const top = clamp(unconstrainedTop, viewportPadding, maxTop);

      setState({
        placement,
        style: {
          position: 'fixed',
          top,
          left,
          maxWidth: `min(${maxWidth}px, calc(100vw - ${viewportPadding * 2}px))`,
          zIndex,
          visibility: 'visible'
        }
      });
    };

    const schedule = () => {
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(update);
    };

    schedule();
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, true);

    if (typeof ResizeObserver !== 'undefined' && tooltipRef.current) {
      resizeObserver = new ResizeObserver(() => schedule());
      resizeObserver.observe(tooltipRef.current);
    }

    return () => {
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', schedule, true);
      resizeObserver?.disconnect();
    };
  }, [
    open,
    anchorRef,
    tooltipRef,
    preferredPlacement,
    viewportPadding,
    offset,
    maxWidth,
    fallbackHeight,
    zIndex
  ]);

  return state;
}

