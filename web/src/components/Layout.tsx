import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";

interface Props {
  title: string;
  back?: boolean;
  actions?: ReactNode;
  children: ReactNode;
  bare?: boolean;
}

/** Sticky header with an optional back button, then the page body. */
export function Layout({ title, back = true, actions, children, bare = false }: Props) {
  const navigate = useNavigate();
  return (
    <div className="app">
      <header className="topbar">
        {back && (
          <button
            type="button"
            className="icon-btn"
            onClick={() => {
              // Deep links (e.g. a refreshed results page) have no history to pop.
              if (window.history.state?.idx > 0) navigate(-1);
              else navigate("/");
            }}
          >
            ‹ Back
          </button>
        )}
        <h1>{title}</h1>
        {actions}
      </header>
      {bare ? children : <main className="page">{children}</main>}
    </div>
  );
}

export function HeaderLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="icon-btn">
      {children}
    </Link>
  );
}
