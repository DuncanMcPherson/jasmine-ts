export default function unWindows(dir: string) {
  return dir.replace(/\\/g, '/');
}
