import mammoth from 'mammoth';

export const MAX_PROCEDURE_BYTES = 5 * 1024 * 1024;
export const SUPPORTED_EXTENSIONS = ['docx', 'md', 'txt'];

function extensionOf(fileName) {
  const match = /\.([^.]+)$/.exec(String(fileName ?? '').trim());
  return match ? match[1].toLowerCase() : '';
}

async function toArrayBuffer(input) {
  if (input instanceof ArrayBuffer) return input;
  if (ArrayBuffer.isView(input)) {
    return input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength);
  }
  if (input && typeof input.arrayBuffer === 'function') return input.arrayBuffer();
  throw new Error('No se pudo leer el archivo del procedimiento.');
}

/**
 * Extrae texto plano de un procedimiento (.docx, .md o .txt).
 * @param {File|Blob|ArrayBuffer|Uint8Array} input
 * @param {string} [fileName] si se omite, se usa `input.name`
 * @returns {Promise<string>}
 */
export async function extractProcedureText(input, fileName) {
  const name = fileName ?? input?.name ?? '';
  const ext = extensionOf(name);
  if (!SUPPORTED_EXTENSIONS.includes(ext)) {
    throw new Error(
      `Formato no soportado${ext ? ` (.${ext})` : ''}. Sube el procedimiento en .docx, .md o .txt.`,
    );
  }

  const size = typeof input?.size === 'number' ? input.size : input?.byteLength;
  if (typeof size === 'number' && size > MAX_PROCEDURE_BYTES) {
    throw new Error('El archivo supera el máximo de 5 MB.');
  }

  const arrayBuffer = await toArrayBuffer(input);
  if (arrayBuffer.byteLength > MAX_PROCEDURE_BYTES) {
    throw new Error('El archivo supera el máximo de 5 MB.');
  }

  if (ext === 'docx') {
    try {
      // `arrayBuffer` lo usa la versión de navegador de mammoth; `buffer`, la de Node.
      const { value } = await mammoth.extractRawText({ arrayBuffer, buffer: arrayBuffer });
      return value;
    } catch {
      throw new Error('No se pudo leer el archivo .docx. Verifica que no esté dañado.');
    }
  }

  return new TextDecoder('utf-8').decode(arrayBuffer).replace(/^﻿/, '');
}
