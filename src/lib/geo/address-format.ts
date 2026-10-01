function normalizedPart(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("fr-FR");
}

/**
 * Cleans legacy comma-separated geocoder text without deleting legitimate cities.
 * Exact duplicate parts are removed. A redundant bare city next to "12345 City"
 * is also removed, while the postal-code form is retained.
 */
export function cleanAddressText(text: string): string {
  const parts = text
    .split(",")
    .map((part) => part.replace(/\s+/g, " " ).trim())
    .filter(Boolean);

  const result: string[] = [];
  const keys: string[] = [];

  for (const part of parts) {
    const key = normalizedPart(part);
    if (keys.includes(key)) continue;

    const postal = key.match(/^\d{5}\s+(.+)$/);
    if (postal) {
      const bareCityIndex = keys.indexOf(postal[1]);
      if (bareCityIndex >= 0) {
        result.splice(bareCityIndex, 1);
        keys.splice(bareCityIndex, 1);
      }
    } else {
      const alreadyWithPostal = keys.some((existing) => {
        const match = existing.match(/^\d{5}\s+(.+)$/);
        return match?.[1] === key;
      });
      if (alreadyWithPostal) continue;
    }

    result.push(part);
    keys.push(key);
  }

  return result.join(", " );
}
