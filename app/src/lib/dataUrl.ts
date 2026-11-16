declare const __DATA_VERSION__: string
/** URL of a file in /data, tagged with the fingerprint of this release's data (see vite.config.ts) so a browser never pairs new code with an old cached file. */
export const dataUrl = (file: string) => `${import.meta.env.BASE_URL}data/${file}?v=${__DATA_VERSION__}`
