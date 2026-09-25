/** 觸發瀏覽器下載（純本機，不上傳）。 */
export function downloadFile(filename: string, data: Uint8Array | string, mime: string): void {
  const part: BlobPart = typeof data === 'string' ? data : (data.slice().buffer as ArrayBuffer);
  const blob = new Blob([part], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function readFileAsText(file: File, maxBytes: number): Promise<string> {
  if (file.size > maxBytes) {
    return Promise.reject(new Error(`檔案過大（${Math.ceil(file.size / 1024)} KB），上限為 ${Math.floor(maxBytes / 1024)} KB。`));
  }
  return file.text();
}
