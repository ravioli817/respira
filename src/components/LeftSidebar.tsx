// Changed in this fork (Respira with a Create screen): see "This fork" in README.md.
import { StitchPanel } from "../stitch/StitchPanel";
export function LeftSidebar({ onPrepare }: { onPrepare: () => void }) {
  return <StitchPanel onPrepare={onPrepare} />;
}
