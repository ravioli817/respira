// Changed in this fork (Respira with a Create screen): see "This fork" in README.md.
/**
 * ThreadLegend Component
 *
 * The threads a design uses, in sewing order, as one line of labelled swatches.
 * It sits under the canvas: as a box on top of it, it covered a third of the hoop.
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
      className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-gray-900 dark:text-gray-100"
    >
      {colors.map((color, idx) => (
        <li key={idx} className="inline-flex items-center gap-2">
          <span
            aria-hidden="true"
            className="w-5 h-5 rounded-full border border-gray-400 dark:border-gray-300 flex-shrink-0"
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
