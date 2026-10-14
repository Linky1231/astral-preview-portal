import * as React from "react";

const MOBILE_BREAKPOINT = 768;
const DESKTOP_BREAKPOINT = 1280;

export type FormFactor = "mobile" | "tablet" | "desktop";

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined);

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    };
    mql.addEventListener("change", onChange);
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return !!isMobile;
}

function detect(): FormFactor {
  if (typeof window === "undefined") return "mobile";
  const w = window.innerWidth;
  if (w < MOBILE_BREAKPOINT) return "mobile";
  if (w < DESKTOP_BREAKPOINT) return "tablet";
  return "desktop";
}

export function useFormFactor(): FormFactor {
  const [ff, setFf] = React.useState<FormFactor>(() => detect());
  React.useEffect(() => {
    const onResize = () => setFf(detect());
    window.addEventListener("resize", onResize);
    onResize();
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return ff;
}

export function useIsTablet() {
  return useFormFactor() === "tablet";
}
