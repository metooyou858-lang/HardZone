/**
 * Pure utility functions for barcode scanner input normalization
 * and GS1 DataMatrix marking code parsing.
 */

export const scannerLayoutMap: Record<string, string> = {
  ё: "`", Ё: "~", й: "q", Й: "Q", ц: "w", Ц: "W", у: "e", У: "E",
  к: "r", К: "R", е: "t", Е: "T", н: "y", Н: "Y", г: "u", Г: "U",
  ш: "i", Ш: "I", щ: "o", Щ: "O", з: "p", З: "P", х: "[", Х: "{",
  ъ: "]", Ъ: "}", ф: "a", Ф: "A", ы: "s", Ы: "S", в: "d", В: "D",
  а: "f", А: "F", п: "g", П: "G", р: "h", Р: "H", о: "j", О: "J",
  л: "k", Л: "K", д: "l", Д: "L", ж: ";", Ж: ":", э: "'", Э: '"',
  я: "z", Я: "Z", ч: "x", Ч: "X", с: "c", С: "C", м: "v", М: "V",
  и: "b", И: "B", т: "n", Т: "N", ь: "m", Ь: "M", б: ",", Б: "<",
  ю: ".", Ю: ">",
};

export function normalizeScannerLayout(value: string): string {
  // When keyboard is in Russian mode, the '/' key sends '.'.
  // The '.' key sends 'ю' (which the map already converts back to '.').
  // So if any Cyrillic chars are present, the whole scan was in Russian mode — convert '.' → '/'.
  const hasCyrillic = /[а-яёА-ЯЁ]/u.test(value);
  return Array.from(value, (char) => {
    if (scannerLayoutMap[char]) return scannerLayoutMap[char];
    if (hasCyrillic && char === ".") return "/";
    if (hasCyrillic && char === ",") return "?";
    return char;
  }).join("");
}

function splitMarkingTailWithAis(tail: string) {
  if (!tail) return null;

  // Try AI 93 with CRC lengths 4, 3, 2 (most common is 4)
  for (const crcLen of [4, 3, 2]) {
    const suffixLen = 2 + crcLen;
    if (tail.length > suffixLen && tail.slice(-suffixLen, -crcLen) === "93") {
      return { serial: tail.slice(0, -suffixLen), parts: [`93${tail.slice(-crcLen)}`] };
    }
  }

  if (tail.length > 52 && tail.slice(-52, -50) === "91" && tail.slice(-46, -44) === "92") {
    return {
      serial: tail.slice(0, -52),
      parts: [`91${tail.slice(-50, -46)}`, `92${tail.slice(-44)}`],
    };
  }

  if (tail.length > 46 && tail.slice(-46, -44) === "92") {
    return { serial: tail.slice(0, -46), parts: [`92${tail.slice(-44)}`] };
  }

  return null;
}

function restoreImplicitGs1Separators(value: string): string {
  if (!value || value.includes(String.fromCharCode(29)) || !/^01\d{14}21/.test(value)) {
    return value;
  }

  const prefix = value.slice(0, 18);
  const tail = value.slice(18);
  const parsedTail = splitMarkingTailWithAis(tail);

  if (!parsedTail?.serial) return value;

  return `${prefix}${parsedTail.serial}${String.fromCharCode(29)}${parsedTail.parts.join(String.fromCharCode(29))}`;
}

const GS = String.fromCharCode(29);

function toHex(s: string): string {
  return Array.from(s, (c) => c.charCodeAt(0).toString(16).padStart(2, "0")).join(" ");
}

/** Normalize a raw scan value: fix keyboard layout + restore GS1 separators. */
export function normalizeMarkingInput(value: string): string {
  const normalized = restoreImplicitGs1Separators(normalizeScannerLayout(value).replace(/^\]d2/i, ""));

  if (value.length >= 20) {
    console.log("[marking-diag]", {
      scanner_raw: value,
      scanner_raw_hex: toHex(value),
      normalized,
      normalized_hex: toHex(normalized),
      has_gs_before: value.includes(GS),
      has_gs_after: normalized.includes(GS),
    });
  }

  return normalized;
}

/**
 * Try to extract an EAN-13 barcode from a GS1 DataMatrix marking code.
 * GS1 format: 01{14-digit GTIN}21{serial}...
 * Returns null if the value doesn't look like GS1.
 */
export function extractBarcodeFromGs1(datamatrix: string): string | null {
  const noGs = datamatrix.replace(/\x1d/g, "");
  const match = noGs.match(/^01(\d{14})21/);
  if (!match) return null;
  const gtin14 = match[1];
  return gtin14.startsWith("0") ? gtin14.slice(1) : gtin14;
}
