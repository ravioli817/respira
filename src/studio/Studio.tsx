import { useEffect, useRef } from "react";
import { mountStudio, type StudioDesign } from "./studioApp.js";
import studioCss from "./studio.css?inline";

// Lettering fonts for the Text tool, bundled so the app keeps working offline.
import "@fontsource/lobster/latin-400.css";
import "@fontsource/pacifico/latin-400.css";
import "@fontsource/fredoka/latin-600.css";
import "@fontsource/titan-one/latin-400.css";
import "@fontsource/archivo-black/latin-400.css";
import "@fontsource/bebas-neue/latin-400.css";
import "@fontsource/bungee/latin-400.css";
import "@fontsource/permanent-marker/latin-400.css";
import "@fontsource/righteous/latin-400.css";

interface StudioProps {
  className?: string;
  /** Return a message to show under the button when the design cannot be taken. */
  onSend: (design: StudioDesign) => string | null;
}

/**
 * The Create screen. Its interface is plain JavaScript (studioApp.js) mounted in a shadow root, so its
 * stylesheet and Tailwind do not touch each other.
 */
export function Studio({ className, onSend }: StudioProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const onSendRef = useRef(onSend);

  useEffect(() => {
    onSendRef.current = onSend;
  }, [onSend]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const root = host.shadowRoot ?? host.attachShadow({ mode: "open" });
    const studio = mountStudio(root, {
      css: studioCss,
      onSend: (design) => onSendRef.current(design),
    });
    return () => studio.destroy();
  }, []);

  return <div ref={hostRef} className={className} />;
}
