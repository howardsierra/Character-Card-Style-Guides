import { AnimatePresence, motion } from "motion/react";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import { useCallback, useRef, useState } from "react";

import { cn } from "@/src/lib/utils";

export type ToastVariant = "error" | "success" | "info";

export interface Toast {
  id: number;
  message: string;
  variant: ToastVariant;
}

const ERROR_HINTS = /\b(fail|failed|error|could not|couldn't|cannot|can't|invalid|no |not found|please )/i;
const SUCCESS_HINTS = /\b(success|successfully|saved|imported|exported|added|recovered|copied|complete)/i;

/**
 * Pick a variant from the message when the caller does not specify one. These
 * strings were written for window.alert(), which had no notion of severity, so
 * inferring keeps the migration to a single mechanical change per call site.
 */
export function inferVariant(message: string): ToastVariant {
  if (ERROR_HINTS.test(message)) return "error";
  if (SUCCESS_HINTS.test(message)) return "success";
  return "info";
}

const DEFAULT_DURATION_MS = 6000;

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const notify = useCallback(
    (message: string, variant?: ToastVariant) => {
      if (!message) return;
      const id = nextId.current++;
      setToasts((prev) => [...prev, { id, message, variant: variant ?? inferVariant(message) }]);
      // Errors linger; they usually carry detail worth reading.
      const ttl = (variant ?? inferVariant(message)) === "error" ? DEFAULT_DURATION_MS * 1.5 : DEFAULT_DURATION_MS;
      setTimeout(() => dismiss(id), ttl);
      return id;
    },
    [dismiss]
  );

  return { toasts, notify, dismiss };
}

const VARIANT_STYLES: Record<ToastVariant, { icon: typeof Info; accent: string; ring: string }> = {
  error: { icon: AlertTriangle, accent: "text-destructive", ring: "ring-destructive/25" },
  success: { icon: CheckCircle2, accent: "text-emerald-600", ring: "ring-emerald-500/25" },
  info: { icon: Info, accent: "text-[#8B3A3A]", ring: "ring-[#8B3A3A]/20" },
};

export function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: number) => void;
}) {
  return (
    <div
      aria-live="polite"
      aria-relevant="additions text"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[100] flex flex-col items-center gap-2 p-4 sm:inset-x-auto sm:right-6 sm:bottom-6 sm:items-end sm:p-0"
    >
      <AnimatePresence initial={false}>
        {toasts.map((t) => {
          const { icon: Icon, accent, ring } = VARIANT_STYLES[t.variant];
          return (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 16, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.97 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className={cn(
                "pointer-events-auto w-full max-w-md sm:w-[26rem] rounded-2xl border border-[#e5e4e2] bg-white shadow-lg ring-1",
                ring
              )}
            >
              <div className="flex items-start gap-3 p-4">
                <Icon className={cn("mt-0.5 h-[18px] w-[18px] shrink-0", accent)} strokeWidth={2.25} />
                <p className="flex-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-700">
                  {t.message}
                </p>
                <button
                  onClick={() => onDismiss(t.id)}
                  aria-label="Dismiss notification"
                  className="-m-1 shrink-0 rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
