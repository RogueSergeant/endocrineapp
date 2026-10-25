import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Icon, type IconName } from "./Icon";

interface Props {
  /** Small context text beside the back button; ignored on the home bar. */
  context?: string;
  back?: boolean;
  /** Where Back goes when there is no history to pop (a deep link). */
  backTo?: string;
  /** The home bar: the wordmark in place of Back. */
  home?: boolean;
  /** A short status (e.g. Offline) before the actions; the home bar drops its tagline for it. */
  status?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  /** A sticky bar of actions under the page body. */
  bar?: ReactNode;
  /** Camera and crop: always dark, full height, no page body. */
  media?: boolean;
}

/** Sticky app bar, then the page body. */
export function Layout({
  context,
  back = true,
  backTo = "/",
  home = false,
  status,
  actions,
  children,
  bar,
  media = false,
}: Props) {
  const navigate = useNavigate();
  const rootClass = media
    ? "es-page es-app es-media es-theme-dark es-media-page"
    : "es-page es-app";
  return (
    <div className={rootClass}>
      <header className={media ? "es-appbar es-appbar--media" : "es-appbar"}>
        {home ? (
          <Link className="es-appbar__title" to="/" aria-label="EndoScan home">
            <Wordmark description={!status} />
          </Link>
        ) : (
          <>
            {back && (
              <button
                type="button"
                className="es-btn es-btn--icon"
                aria-label="Back"
                onClick={() => {
                  // Deep links (e.g. a refreshed results page) have no history to pop.
                  if (window.history.state?.idx > 0) navigate(-1);
                  else navigate(backTo);
                }}
              >
                <Icon name="back" />
              </button>
            )}
            <span className="es-appbar__context">{context}</span>
          </>
        )}
        {status && (
          <span className="es-appbar__status" role="status">
            {status}
          </span>
        )}
        {actions}
      </header>
      {media ? children : <main className="es-body">{children}</main>}
      {bar && <div className="es-actionbar">{bar}</div>}
    </div>
  );
}

export function Wordmark({ description = true }: { description?: boolean }) {
  return (
    <span className="es-wordmark es-wordmark--bar">
      <span className="es-wordmark__name">
        <span className="es-wordmark__endo">Endo</span>
        <span className="es-wordmark__scan">Scan</span>
      </span>
      {description && <span className="es-wordmark__desc">The Endocrine Disruptor Checker</span>}
    </span>
  );
}

export function HeaderLink({ to, icon, label }: { to: string; icon: IconName; label: string }) {
  return (
    <Link to={to} className="es-btn es-btn--icon" aria-label={label}>
      <Icon name={icon} />
    </Link>
  );
}
