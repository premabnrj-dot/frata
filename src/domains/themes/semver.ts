/** Compare two `major.minor.patch` versions: negative when a is older. Pure; the one comparison every theme reader uses. */
export const cmpSemver = (a: string, b: string) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < 3; i++) if (x[i]! !== y[i]!) return x[i]! - y[i]!; return 0 }
