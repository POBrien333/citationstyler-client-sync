export function isDarkMode(win: Window): boolean {
  return win.matchMedia("(prefers-color-scheme: dark)")?.matches ?? false;
}

export function getColors(win: Window) {
  const dark = isDarkMode(win);
  return {
    success:     dark ? "#4caf7d" : "#28a745",
    warning:     dark ? "#ff9f43" : "#fd7e14",
    error:       dark ? "#ff6b6b" : "#dc3545",
    neutral:     dark ? "#aaa"    : "#888",
    rowBg:       dark ? "#272727" : "white",
    rowBgWarn:   dark ? "#2e2416" : "#fff8f0",
    rowBgOk:     dark ? "#192519" : "#f0fff4",
    rowBorder:   dark ? "#3a3944" : "#eee",
    badgeOkBg:   dark ? "#1a3324" : "#e6f9ee",
    badgeOkBdr:  dark ? "#2e6644" : "#b7ebc8",
    badgeUpdBg:  dark ? "#332510" : "#fff3e0",
    badgeUpdBdr: dark ? "#7a5510" : "#ffd08a",
    btnDisabled: dark ? "#666"    : "#6c757d",
    btnText:     dark ? "#e0e0e0" : "black",
    mutedText:   dark ? "#999"    : "#adb5bd",
  };
}
