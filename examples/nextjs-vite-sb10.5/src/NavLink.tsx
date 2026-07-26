import Link from "next/link";

export interface NavLinkProps {
  label: string;
  href: string;
  active?: boolean;
}

export function NavLink({ label, href, active = false }: NavLinkProps) {
  return (
    <Link
      href={href}
      style={{
        fontFamily: "system-ui, sans-serif",
        fontSize: 14,
        fontWeight: 600,
        padding: "8px 16px",
        borderRadius: 6,
        textDecoration: "none",
        background: active ? "rgb(79, 70, 229)" : "transparent",
        color: active ? "white" : "rgb(51, 51, 51)",
      }}
    >
      {label}
    </Link>
  );
}
