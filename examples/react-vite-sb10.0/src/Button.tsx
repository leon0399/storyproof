export interface ButtonProps {
  label: string;
  variant?: "primary" | "secondary";
}

export function Button({ label, variant = "primary" }: ButtonProps) {
  const isPrimary = variant === "primary";
  return (
    <button
      type="button"
      style={{
        fontFamily: "system-ui, sans-serif",
        fontSize: 14,
        fontWeight: 600,
        padding: "10px 20px",
        borderRadius: 6,
        border: isPrimary ? "none" : "2px solid rgb(79, 70, 229)",
        background: isPrimary ? "rgb(79, 70, 229)" : "transparent",
        color: isPrimary ? "white" : "rgb(79, 70, 229)",
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}
