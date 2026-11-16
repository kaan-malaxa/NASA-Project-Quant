/** Keep the highlight and explanation inside the viewport, including on narrow phones. */
export function tourLayout(rect, width, height, cardHeight = 280) {
  const gap = 12, margin = 12;
  const box = { left: Math.max(margin, rect.left - 6), top: Math.max(margin, rect.top - 6), width: Math.min(rect.width + 12, width - margin * 2), height: Math.min(rect.height + 12, height - cardHeight - gap * 3) };
  box.left = Math.min(box.left, width - box.width - margin);
  box.top = Math.min(box.top, height - box.height - margin);
  const cardWidth = Math.min(360, width - margin * 2);
  let left = width - cardWidth - margin, top = height - cardHeight - margin;
  if (width >= 768 && box.left + box.width + gap + cardWidth <= width - margin) { left = box.left + box.width + gap; top = box.top; }
  else if (box.top + box.height + gap + cardHeight <= height - margin) { left = Math.max(margin, Math.min(box.left, width - cardWidth - margin)); top = box.top + box.height + gap; }
  else if (box.top - gap - cardHeight >= margin) { top = box.top - gap - cardHeight; }
  if (width < 768) { left = margin; top = height - cardHeight - margin; }
  return { box, card: { left, top: Math.max(margin, Math.min(top, height - cardHeight - margin)), width: cardWidth } };
}
