/**
 * 把本地文件路径变成 <img src> 可直接用的 media:// 地址。
 * 主进程已注册 media 协议直接流式返回文件，不再走 base64 + IPC。
 */
export function toMediaUrl(filePath: string): string {
  return 'media:///' + encodeURI(filePath.replace(/\\/g, '/'))
}

/** 只有在 Electron 里（有 preload 注入的 API）media:// 才能加载；浏览器开发预览时退回空串。 */
export function hasMediaProtocol(): boolean {
  return typeof window !== 'undefined' && Boolean((window as Window & { galleryAPI?: unknown }).galleryAPI)
}
