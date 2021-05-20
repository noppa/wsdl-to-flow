export const hasOwnProperty = (() => {
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const object$hasOwnProperty = Object.prototype.hasOwnProperty;
  return <T extends Record<string, unknown>>(obj: T, key: keyof T): boolean =>
    object$hasOwnProperty.call(obj, key) as boolean;
})();
