export function downloadFile(file: File) {
  const url = URL.createObjectURL(file), link = document.createElement('a'); link.href = url; link.download = file.name; document.body.append(link); link.click(); link.remove();
  // Safari needs the object URL to remain alive while the download is handed off.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
export const canShareFile = (file: File) => { try { return typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] }); } catch { return false; } };
/** Call directly from a user click, after the file has already been prepared. */
export async function shareFile(file: File) { if (canShareFile(file) && navigator.share) await navigator.share({ files: [file], title: file.name }); else downloadFile(file); }
