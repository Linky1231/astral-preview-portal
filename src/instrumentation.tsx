import { Dialog } from "@radix-ui/react-dialog";
import { AlertTriangle, ChevronDown, ExternalLink } from "lucide-react";
import React, { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type GenericError = {
  error: string;
  stack: string;
  filename?: string;
  lineno?: number;
  colno?: number;
  componentStack?: string;
};

function normalizeError(value: unknown): GenericError {
  if (value instanceof Error) {
    return {
      error: value.message || "Unknown runtime error",
      stack: value.stack || "",
    };
  }

  if (typeof value === "string") {
    return { error: value || "Unknown runtime error", stack: "" };
  }

  if (value && typeof value === "object") {
    const candidate = value as {
      message?: unknown;
      error?: unknown;
      stack?: unknown;
    };
    const message =
      typeof candidate.message === "string"
        ? candidate.message
        : typeof candidate.error === "string"
          ? candidate.error
          : "";

    return {
      error: message || "Unknown runtime error",
      stack: typeof candidate.stack === "string" ? candidate.stack : "",
    };
  }

  return {
    error: value == null ? "Unknown runtime error" : String(value),
    stack: "",
  };
}

async function reportErrorToVly(errorData: {
  error: string;
  stackTrace?: string;
  filename?: string;
  lineno?: number;
  colno?: number;
}) {
  const appId = import.meta.env.VITE_VLY_APP_ID;
  const monitoringUrl = import.meta.env.VITE_VLY_MONITORING_URL;

  if (!appId || !monitoringUrl) {
    return;
  }

  try {
    await fetch(monitoringUrl, {
      method: "POST",
      body: JSON.stringify({
        ...errorData,
        url: window.location.href,
        projectSemanticIdentifier: appId,
      }),
    });
  } catch (error) {
    console.error("Failed to report error to Vly:", error);
  }
}

function ErrorDialog({
  error,
  setError,
}: {
  error: GenericError;
  setError: (error: GenericError | null) => void;
}) {
  const technicalDetails = [
    error.filename &&
      `Source: ${error.filename}${error.lineno ? `:${error.lineno}` : ""}${error.colno ? `:${error.colno}` : ""}`,
    error.stack && `Stack trace:\n${error.stack}`,
    error.componentStack && `Component stack:\n${error.componentStack}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  return (
    <Dialog
      defaultOpen={true}
      onOpenChange={(open) => {
        if (!open) setError(null);
      }}
    >
      {/* Diálogo M3: contenedor de error, icono en círculo de 40dp y tipografía
          por roles. Antes usaba la paleta «zinc» del generador, ajena al tema. */}
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader className="pr-8">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-destructive/10">
              <AlertTriangle className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <DialogTitle className="m3-headline-small">Error en tiempo de ejecución</DialogTitle>
              <DialogDescription className="m3-body-medium mt-1 text-muted-foreground">
                La vista previa se detuvo al dibujar. Abre el editor para
                arreglarlo o cierra este aviso para seguir navegando.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5">
          <div className="m3-label-small mb-1 uppercase text-destructive">
            Mensaje de error
          </div>
          <p className="m3-body-medium whitespace-pre-wrap break-words text-foreground">
            {error.error}
          </p>
        </div>

        {technicalDetails && (
          <Collapsible>
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="m3-label-large m3-state flex cursor-pointer items-center gap-1.5 rounded-full px-2 py-1 text-muted-foreground hover:text-foreground"
              >
                <ChevronDown className="h-3.5 w-3.5" />
                Ver detalles técnicos
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap break-words rounded-md border border-line bg-muted p-3 font-mono text-[11px] leading-relaxed text-ink-2">
                {technicalDetails}
              </pre>
            </CollapsibleContent>
          </Collapsible>
        )}

        <DialogFooter className="gap-3 sm:items-center">
          <span className="m3-body-small text-muted-foreground">
            Los detalles del error también están en el chat.
          </span>
          <a
            href={`https://freebuff.com/project/${import.meta.env.VITE_VLY_APP_ID}`}
            target="_blank"
            rel="noreferrer"
          >
            <Button className="m3-btn">
              <ExternalLink className="h-4 w-4" /> Abrir editor
            </Button>
          </a>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type ErrorBoundaryState = {
  hasError: boolean;
  error: GenericError | null;
};

class ErrorBoundary extends React.Component<
  {
    children: React.ReactNode;
  },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      error: normalizeError(error),
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    const normalizedError = normalizeError(error);
    const componentStack = info.componentStack?.trim();

    reportErrorToVly({
      error: normalizedError.error,
      stackTrace: [normalizedError.stack, componentStack]
        .filter(Boolean)
        .join("\n\n"),
    });

    this.setState((state) => ({
      hasError: true,
      error: {
        ...(state.error ?? normalizedError),
        componentStack,
      },
    }));
  }

  render() {
    if (this.state.hasError && this.state.error) {
      return (
        <ErrorDialog
          error={this.state.error}
          setError={(error) => {
            if (error === null) {
              this.setState({ hasError: false, error: null });
            }
          }}
        />
      );
    }

    return this.props.children;
  }
}

export function InstrumentationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [error, setError] = useState<GenericError | null>(null);

  useEffect(() => {
    const handleError = async (event: ErrorEvent) => {
      try {
        event.preventDefault();
        const normalizedError = normalizeError(event.error ?? event.message);
        const capturedError = {
          ...normalizedError,
          filename: event.filename || undefined,
          lineno: event.lineno || undefined,
          colno: event.colno || undefined,
        };
        setError(capturedError);

        await reportErrorToVly({
          error: normalizedError.error,
          stackTrace: normalizedError.stack,
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
        });
      } catch (error) {
        console.error("Error in handleError:", error);
      }
    };

    const handleRejection = async (event: PromiseRejectionEvent) => {
      try {
        const normalizedError = normalizeError(event.reason);
        console.error("[Freebuff runtime error]", normalizedError.error);
        setError(normalizedError);

        await reportErrorToVly({
          error: normalizedError.error,
          stackTrace: normalizedError.stack,
        });
      } catch (error) {
        console.error("Error in handleRejection:", error);
      }
    };

    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleRejection);

    return () => {
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleRejection);
    };
  }, []);
  return (
    <>
      <ErrorBoundary>{children}</ErrorBoundary>
      {error && <ErrorDialog error={error} setError={setError} />}
    </>
  );
}
