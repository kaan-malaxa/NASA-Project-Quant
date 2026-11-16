/*
 * Pure layout helpers for the guided tour (unit-tested). The tour box is never shown until one of these has given it
 * a valid place: anchored next to its target, centered as a plain dialog, or as a bottom sheet on phones.
 */
export const MOBILE_MAX = 767;
const MARGIN = 12;
const GAP = 12;

/** Two rects within `tol` px of each other on every edge (used to tell when the layout has settled). */
export function sameRect(a, b, tol = 1) {
  if (!a || !b) return false;
  return (
    Math.abs(a.left - b.left) <= tol &&
    Math.abs(a.top - b.top) <= tol &&
    Math.abs(a.width - b.width) <= tol &&
    Math.abs(a.height - b.height) <= tol
  );
}

/** Settled = the last two measurements (consecutive animation frames) agree. */
export function isSettled(history, tol = 1) {
  return history.length >= 2 && sameRect(history[history.length - 1], history[history.length - 2], tol);
}

/** A rect at least partly inside the viewport. */
export function onScreen(rect, width, height) {
  return Boolean(rect) && rect.bottom > 0 && rect.right > 0 && rect.top < height && rect.left < width;
}

/** Keep the highlight and explanation inside the viewport, including on narrow phones. */
export function tourLayout(rect, width, height, cardHeight = 280) {
  const gap = GAP,
    margin = MARGIN;
  const box = {
    left: Math.max(margin, rect.left - 6),
    top: Math.max(margin, rect.top - 6),
    width: Math.min(rect.width + 12, width - margin * 2),
    height: Math.min(rect.height + 12, height - cardHeight - gap * 3),
  };
  box.left = Math.min(box.left, width - box.width - margin);
  box.top = Math.min(box.top, height - box.height - margin);
  const cardWidth = Math.min(360, width - margin * 2);
  // Last resort when there is no room beside, below or above the target: centred under it, clamped inside the
  // screen (overlapping its lower part), not pushed into a corner.
  let left = Math.max(margin, Math.min(box.left + box.width / 2 - cardWidth / 2, width - cardWidth - margin)),
    top = Math.min(box.top + box.height + gap, height - cardHeight - margin);
  if (width >= 768 && box.left + box.width + gap + cardWidth <= width - margin) {
    left = box.left + box.width + gap;
    top = box.top;
  } else if (box.top + box.height + gap + cardHeight <= height - margin) {
    left = Math.max(margin, Math.min(box.left, width - cardWidth - margin));
    top = box.top + box.height + gap;
  } else if (box.top - gap - cardHeight >= margin) {
    top = box.top - gap - cardHeight;
  }
  if (width < 768) {
    left = margin;
    top = height - cardHeight - margin;
  }
  return {
    box,
    card: { left, top: Math.max(margin, Math.min(top, height - cardHeight - margin)), width: cardWidth },
  };
}

/** A plain dialog in the middle of the screen (no target, or the target never became ready). */
export function centeredCard(width, height, cardHeight = 280) {
  const cardWidth = Math.min(420, width - MARGIN * 2);
  return {
    left: Math.round((width - cardWidth) / 2),
    top: Math.max(MARGIN, Math.round((height - cardHeight) / 2)),
    width: cardWidth,
  };
}

/**
 * Where the tour box (and its highlight) go for one step.
 * @param {{ rect: DOMRect | null, width: number, height: number, cardHeight: number }} m rect = the settled target,
 *   or null when the step has no target or it never became ready
 * @returns {{ mode: "anchored" | "centered" | "sheet", card: {left, top, width}, box: {left, top, width, height} | null }}
 */
export function tourPlacement({ rect, width, height, cardHeight }) {
  const mobile = width <= MOBILE_MAX;
  if (!rect) {
    // Phones keep the bottom sheet; wide screens a centered dialog. Never a corner.
    if (mobile)
      return {
        mode: "sheet",
        box: null,
        card: {
          left: MARGIN,
          top: Math.max(MARGIN, height - cardHeight - MARGIN),
          width: width - MARGIN * 2,
        },
      };
    return { mode: "centered", box: null, card: centeredCard(width, height, cardHeight) };
  }
  const { box, card } = tourLayout(rect, width, height, cardHeight);
  if (mobile) {
    // Bottom sheet; the highlight only when the target is actually on screen.
    return {
      mode: "sheet",
      box: onScreen(rect, width, height) ? box : null,
      card: { left: MARGIN, top: Math.max(MARGIN, height - cardHeight - MARGIN), width: width - MARGIN * 2 },
    };
  }
  return { mode: "anchored", box, card };
}
