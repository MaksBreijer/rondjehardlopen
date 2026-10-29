/** Light tap feedback on phones that support it (Android; iOS Safari ignores it). */
export const buzz = (ms = 8) => {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* not supported */
  }
};
