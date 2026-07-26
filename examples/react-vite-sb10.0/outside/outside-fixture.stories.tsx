import type { Meta, StoryObj } from "@storybook/react-vite";

// Deliberately outside this project's configured `storyRoots` (["src"], set
// in .storybook/main.ts) — part of storyproof's reusable acceptance suite,
// proving the addon fails closed for a story outside its story roots
// instead of writing artifacts anywhere. See src/visual-fixture.stories.tsx
// for the full explanation of why this example carries test-fixture content.

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

export const Default: Story = {};
