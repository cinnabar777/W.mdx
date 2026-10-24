export function shouldRefreshHeightMapForWidget(
  previousHeight,
  measuredHeight,
  estimatedHeight
) {
  const baseline = Number.isFinite(previousHeight)
    ? previousHeight
    : estimatedHeight;

  return !Number.isFinite(baseline) || Math.abs(measuredHeight - baseline) >= 1;
}
