/** "Flower" from "Flower.pes": the name a person gave the design, without the file ending. */
export function designName(fileName: string | null | undefined): string {
  return (fileName ?? "").replace(/\.pes$/i, "");
}
