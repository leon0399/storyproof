import type { Meta, StoryObj } from "@storybook/react-vite";

// Deliberately outside this project's configured `storyRoots` (["src"], set
// in .storybook/main.ts). See src/visual-fixture.stories.tsx for why this
// example carries scenario content alongside its plain demo.

function OutsideFixture() {
  return (
    <main
      style={{
        width: 120,
        height: 80,
        background: "rgb(120, 80, 200)",
      }}
    >
      Outside story roots
    </main>
  );
}

const meta = {
  title: "Outside Fixture",
  component: OutsideFixture,
} satisfies Meta<typeof OutsideFixture>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * A real project has story files outside its configured `storyRoots`
 * (generated stories, a monorepo sibling, etc.). Expected: running visual
 * tests against a story here fails closed with "Story resolves outside the
 * configured story roots" and writes no artifacts anywhere — not even under
 * this file's own directory.
 */
export const Default: Story = {};
