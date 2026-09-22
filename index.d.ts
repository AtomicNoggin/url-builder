export declare class URLBuilderError extends Error {
  name: "URLBuilderError";
}

export type URLBuilderValue = string | number;
export type URLBuilderValues = Record<
  string,
  URLBuilderValue | URLBuilderValue[]
>;

export declare class URLBuilder {
  constructor(input?: string | URLPatternInit, baseURL?: string);
  constructor(input: string | URLPatternInit, options?: URLPatternOptions);
  constructor(
    input: string | URLPatternInit,
    baseURL: string,
    options?: URLPatternOptions,
  );
  constructor(input: URLPattern);
  /** builds a complete URL string, substituting named group values into the pattern */
  exec(values?: URLBuilderValues | FormData): string;

  /** like exec(), but also returns the entries not used by any named group */
  execWithRemainder(values?: URLBuilderValues): {
    url: string;
    remainder: URLBuilderValues;
  };
  execWithRemainder(values: FormData): { url: string; remainder: FormData };

  /** true if every required named group has a matching value */
  test(values?: URLBuilderValues | FormData): boolean;

  /** true if the pattern declares a named group with this name */
  hasNamedValue(name: string): boolean;
}

export default URLBuilder;
