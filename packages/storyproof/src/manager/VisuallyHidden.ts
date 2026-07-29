import { styled } from "storybook/theming";

// The standard visually-hidden clip pattern: gives an icon-only button a
// real accessible name from its own text content. Storybook's `Button`
// supports `ariaLabel` throughout the supported range (verified against
// 10.5.5, which even deprecation-warns when it is absent), so this is
// defense in depth rather than a version shim: a content-derived name
// survives any future change to how the host component treats its naming
// props, and both are kept where used. (An earlier version of this comment
// claimed the supported floor predates the prop — that was true of the
// abandoned 10.0.x floor, not of `^10.5.0`.) One shared definition so an
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
