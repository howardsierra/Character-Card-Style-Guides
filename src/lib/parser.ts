import * as pdfjsLib from 'pdfjs-dist';
// @ts-ignore
import pdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';
import mammoth from 'mammoth';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

export interface CharacterCard {
  name: string;
  description: string;
  personality: string;
  scenario: string;
  first_mes: string;
  mes_example: string;
  creator_notes?: string;
  system_prompt?: string;
  post_history_instructions?: string;
  tags?: string[];
  creator?: string;
  character_version?: string;
  alternate_greetings?: string[];
  image?: string;
}

export async function parseDocxToText(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value.trim();
}

export async function parsePdfToText(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
  let fullText = '';

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items.map((item: any) => item.str).join(' ');
    fullText += pageText + '\n\n';
  }

  return fullText.trim();
}

export async function parseSillyTavernPng(file: File): Promise<CharacterCard> {
  const arrayBuffer = await file.arrayBuffer();
  const dataView = new DataView(arrayBuffer);
  
  // PNG signature: 89 50 4E 47 0D 0A 1A 0A
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  for (let i = 0; i < signature.length; i++) {
    if (dataView.getUint8(i) !== signature[i]) {
      throw new Error("Invalid PNG file");
    }
  }

  let offset = 8;
  while (offset < dataView.byteLength) {
    const length = dataView.getUint32(offset);
    const type = String.fromCharCode(
      dataView.getUint8(offset + 4),
      dataView.getUint8(offset + 5),
      dataView.getUint8(offset + 6),
      dataView.getUint8(offset + 7)
    );

    if (type === 'tEXt') {
      const chunkData = new Uint8Array(arrayBuffer, offset + 8, length);
      const text = new TextDecoder().decode(chunkData);
      const nullSeparatorIndex = text.indexOf('\0');
      const keyword = text.substring(0, nullSeparatorIndex);
      
      if (keyword === 'chara') {
        const base64Data = text.substring(nullSeparatorIndex + 1);
        try {
          const decodedStr = atob(base64Data);
          const utf8Str = decodeURIComponent(escape(decodedStr));
          const parsed = JSON.parse(utf8Str);
          // Handle V2 format
          if (parsed.spec === 'chara_card_v2' && parsed.data) {
             return parsed.data as CharacterCard;
          }
          return parsed as CharacterCard;
        } catch (e) {
          console.error("Failed to parse chara chunk", e);
          throw new Error("Failed to parse character data from PNG");
        }
      }
    }

    offset += 12 + length; // length (4) + type (4) + data (length) + crc (4)
  }

  throw new Error("No character data found in PNG");
}

export async function parseFile(file: File): Promise<CharacterCard> {
  if (file.type === "application/json" || file.name.endsWith(".json")) {
    const text = await file.text();
    const parsed = JSON.parse(text);
    if (parsed.spec === 'chara_card_v2' && parsed.data) {
       return parsed.data as CharacterCard;
    }
    return parsed as CharacterCard;
  } else if (file.type === "image/png" || file.name.endsWith(".png")) {
    return parseSillyTavernPng(file);
  }
  throw new Error("Unsupported file type");
}
