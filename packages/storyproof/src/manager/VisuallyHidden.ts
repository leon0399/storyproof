import { styled } from "storybook/theming";

// The standard visually-hidden clip pattern: gives an icon-only button a real
// accessible name from its own text content, so it works regardless of
// whether the host `Button`'s `ariaLabel` prop is recognized — storyproof's
// minimum supported Storybook predates that prop's introduction, so
// `ariaLabel` alone silently produces an unnamed button there. Keep the
// `ariaLabel` prop too where used: it satisfies newer Storybook's own
// deprecation warning and costs nothing. One shared definition so an
// accessibility fix cannot land in one copy and silently miss the other.
export const VisuallyHidden = styled.span({
  border: 0,
  clip: "rect(0, 0, 0, 0)",
  height: 1,
  margin: -1,
  overflow: "hidden",
  padding: 0,
  position: "absolute",
  whiteSpace: "nowrap",
  width: 1,
});
