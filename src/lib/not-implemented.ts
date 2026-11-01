export class NotImplementedError extends Error {
  constructor(boundary: string) {
    super(`${boundary} is not implemented.`);
    this.name = "NotImplementedError";
  }
}
export function notImplemented(boundary: string): never {
  throw new NotImplementedError(boundary);
}
