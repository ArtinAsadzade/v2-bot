export const uiDivider = "━━━━━━━━━━━━━━";

export function section(title: string, lines: Array<string | number | null | undefined>): string {
  return [title, ...lines.filter((line) => line !== undefined && line !== null && String(line).trim() !== "")].join("\n");
}

export function card(title: string, lines: Array<string | number | null | undefined>): string {
  return `${title}\n${lines.filter((line) => line !== undefined && line !== null && String(line).trim() !== "").join("\n")}`;
}

export function joinSections(sections: string[]): string {
  return sections.filter(Boolean).join(`\n\n${uiDivider}\n\n`);
}
