// Changed in this fork (Respira with a Create screen): see "This fork" in README.md.
/**
 * ThreadLegend Component
 *
 * The threads a design uses, in sewing order, as a list of labelled swatches.
 * It sits in the panel beside the hoop: as a box on top of it, it covered a third of the hoop.
 */

interface ThreadColor {
  hex: string;
  brand?: string | null;
  catalogNumber?: string | null;
  chart?: string | null;
  description?: string | null;
}

interface ThreadLegendProps {
  colors: ThreadColor[];
}

/** "Pink (Brother #085)", the same wording the Stitch screen uses. */
function threadName(color: ThreadColor): string {
  const name = color.description
    ? color.description.charAt(0).toUpperCase() +
      color.description.slice(1).toLowerCase()
    : "Thread";
  return color.catalogNumber
    ? `${name} (${color.brand?.includes("Brother") ? "Brother " : ""}#${color.catalogNumber})`
    : name;
}

export function ThreadLegend({ colors }: ThreadLegendProps) {
  return (
    <ol
      aria-label="Threads in this design, in sewing order"
      className="flex flex-col gap-2"
    >
      {colors.map((color, idx) => (
        <li key={idx} className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="size-8 rounded-full border border-ink flex-shrink-0"
            style={{ backgroundColor: color.hex }}
          />
          <span>
            {idx + 1}. {threadName(color)}
          </span>
        </li>
      ))}
    </ol>
  );
}
