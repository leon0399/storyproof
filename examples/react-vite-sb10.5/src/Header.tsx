import "./ledgerline.css";
import { Button } from "./Button.js";

// Derived from Storybook's official scaffold Header: same user/onLogin/
// onLogout/onCreateAccount contract, restyled as the Ledgerline top bar.

export interface HeaderProps {
  user?: { name: string };
  onLogin?: () => void;
  onLogout?: () => void;
  onCreateAccount?: () => void;
}

export function Header({
  user,
  onLogin,
  onLogout,
  onCreateAccount,
}: HeaderProps) {
  return (
    <header className="ll-header">
      <h1 className="ll-header__wordmark">Ledgerline</h1>
      <nav aria-label="Main" className="ll-header__nav">
        <a className="ll-header__link ll-header__link--active" href="#overview">
          Overview
        </a>
        <a className="ll-header__link" href="#invoices">
          Invoices
        </a>
        <a className="ll-header__link" href="#clients">
          Clients
        </a>
      </nav>
      <div className="ll-header__auth">
        {user ? (
          <>
            <span className="ll-header__welcome">
              Signed in as <strong>{user.name}</strong>
            </span>
            <Button
              label="Sign out"
              size="sm"
              variant="secondary"
              onClick={onLogout}
            />
          </>
        ) : (
          <>
            <Button
              label="Sign in"
              size="sm"
              variant="secondary"
              onClick={onLogin}
            />
            <Button
              label="Open an account"
              size="sm"
              variant="primary"
              onClick={onCreateAccount}
            />
          </>
        )}
      </div>
    </header>
  );
}
