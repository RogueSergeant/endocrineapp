import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "./Icon";

/** A message shown for a few seconds; `show(text)` replaces any current one. */
export function useToast(ms = 4000) {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    if (text === null) return;
    const timer = setTimeout(() => setText(null), ms);
    return () => clearTimeout(timer);
  }, [text, ms]);
  return { text, show: setText, hide: () => setText(null) };
}

export function Toast({
  children,
  action,
  aboveBar = false,
}: {
  children: ReactNode;
  action?: ReactNode;
  aboveBar?: boolean;
}) {
  return (
    <div className={aboveBar ? "es-toast-slot es-toast-slot--above-bar" : "es-toast-slot"}>
      <div className="es-toast" role="status">
        <span className="es-toast__text">{children}</span>
        {action}
      </div>
    </div>
  );
}

/**
 * A bottom sheet asking to confirm a destructive action. Escape or a tap
 * on the scrim cancels; focus starts on the safe choice.
 */
export function ConfirmSheet({
  title,
  text,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  title: string;
  text: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const keepRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    keepRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      opener?.focus?.();
    };
  }, [onCancel]);
  return (
    <div className="es-dialog-layer">
      <div className="es-scrim" onClick={onCancel} />
      <div
        className="es-confirm"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-h"
        aria-describedby="confirm-t"
      >
        <h2 className="es-confirm__title" id="confirm-h">
          {title}
        </h2>
        <p className="es-confirm__text" id="confirm-t">
          {text}
        </p>
        <div className="es-confirm__actions">
          <button
            ref={keepRef}
            type="button"
            className="es-btn es-btn--secondary"
            onClick={onCancel}
          >
            Keep
          </button>
          <button type="button" className="es-btn es-btn--destructive-fill" onClick={onConfirm}>
            <Icon name="trash" />
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function Banner({
  kind,
  title,
  children,
  actions,
}: {
  kind: "info" | "warning" | "alert";
  title: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  const icon = kind === "info" ? "images" : kind === "warning" ? "warning" : "alert";
  return (
    <div className={`es-banner es-banner--${kind}`} role={kind === "alert" ? "alert" : "status"}>
      <Icon name={icon} />
      <div className="es-banner__body">
        <span className="es-banner__title">{title}</span>
        {children && <span>{children}</span>}
        {actions && <div className="es-banner__actions">{actions}</div>}
      </div>
    </div>
  );
}
