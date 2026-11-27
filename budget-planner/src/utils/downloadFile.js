export function downloadTextFile({ content, filename, mimeType }) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  try {
    if (!("download" in link)) throw new Error("This browser does not support file downloads.");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    if (!link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))) {
      throw new Error("The browser cancelled the file download request.");
    }
  } finally {
    link.remove();
    URL.revokeObjectURL(url);
  }
}
