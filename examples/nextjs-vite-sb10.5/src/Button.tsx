import "./ledgerline.css";

// Derived from Storybook's official scaffold Button: same prop shape, styled
// as part of the Ledgerline demo system (see ledgerline.css).

export interface ButtonProps {
  label: string;
  variant?: "primary" | "secondary" | "danger";
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  onClick?: () => void;
}

export function Button({
  label,
  variant = "primary",
  size = "md",
  disabled = false,
  onClick,
}: ButtonProps) {
  return (
    <button
      type="button"
      className={`ll-button ll-button--${variant} ll-button--${size}`}
      disabled={disabled}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
