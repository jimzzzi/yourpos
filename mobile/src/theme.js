export function getPalette(dark) {
  return dark
    ? {
        bg: "#0B1220",
        surface: "#152238",
        surface2: "#1E293B",
        border: "#2A3B55",
        text: "#E6EDF7",
        muted: "#8FA3BF",
        input: "#0B1220",
        accent: "#43A047",
        danger: "#EF4444",
        dangerBg: "#3A1520",
        dangerText: "#FF8A8A",
        successBg: "#12331A",
        successText: "#7BD88A",
        warnBg: "#3A2A10",
        warnText: "#FFC53D",
      }
    : {
        bg: "#F1F5F9",
        surface: "#FFFFFF",
        surface2: "#F8FAFC",
        border: "#E2E8F0",
        text: "#0F172A",
        muted: "#64748B",
        input: "#F8FAFC",
        accent: "#43A047",
        danger: "#EF4444",
        dangerBg: "#FEE2E2",
        dangerText: "#DC2626",
        successBg: "#DCFCE7",
        successText: "#166534",
        warnBg: "#FEF9C3",
        warnText: "#854D0E",
      };
}