/** @type {import("tailwindcss").Config} */
module.exports = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        ink: "#111827",
        sand: "#f5efe5",
        coral: "#ef6f4f",
        pine: "#1f4d3c",
        mist: "#d9e6de",
        darkBg: "#0a0a0a",
        darkCard: "#1a1a1a",
        darkBorder: "#2a2a2a",
        darkText: "#f5f5f5",
        darkMuted: "#a0a0a0",
      },
    },
  },
};
