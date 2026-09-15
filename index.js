const COMPONENTS = [
  "protocol",
  "username",
  "password",
  "hostname",
  "port",
  "pathname",
  "search",
  "hash",
];

// values that should not be percent-encoded when substituted
const RAW_COMPONENTS = new Set(["protocol", "hostname", "port"]);

export class URLBuilderError extends Error {
  name = "URLBuilderError";
}

class MissingValueError extends URLBuilderError {
  constructor(paramName) {
    super(`Missing value for named group "${paramName}"`);
    this.paramName = paramName;
  }
}

const isNameChar = (char) => char !== undefined && /[A-Za-z0-9_$]/.test(char);
const isModifierChar = (char) => char === "?" || char === "*" || char === "+";

// turns a URLPattern component string into a tree of literal/param/wildcard/group tokens
function tokenize(pattern) {
  let i = 0;

  const readModifier = () => (isModifierChar(pattern[i]) ? pattern[i++] : "");

  // consumes a balanced (...) custom-regex group without interpreting its contents
  const skipParenGroup = () => {
    let depth = 0;
    do {
      if (pattern[i] === "\\") {
        i += 2;
        continue;
      }
      if (pattern[i] === "(") depth++;
      else if (pattern[i] === ")") depth--;
      i++;
    } while (depth > 0 && i < pattern.length);
  };

  const parseSegment = (stopChar) => {
    const tokens = [];
    let literal = "";
    const flushLiteral = () => {
      if (literal) {
        tokens.push({ type: "literal", value: literal });
        literal = "";
      }
    };
    while (i < pattern.length && pattern[i] !== stopChar) {
      const char = pattern[i];
      if (char === "\\") {
        literal += pattern[i + 1] ?? "";
        i += 2;
      } else if (char === "{") {
        flushLiteral();
        i++;
        const children = parseSegment("}");
        if (pattern[i] !== "}") {
          throw new URLBuilderError(
            `Unterminated "{" group in pattern "${pattern}"`,
          );
        }
        i++;
        tokens.push({ type: "group", children, modifier: readModifier() });
      } else if (char === ":") {
        flushLiteral();
        i++;
        const start = i;
        while (isNameChar(pattern[i])) i++;
        const name = pattern.slice(start, i);
        if (!name) {
          throw new URLBuilderError(
            `Expected a parameter name after ":" in pattern "${pattern}"`,
          );
        }
        if (pattern[i] === "(") skipParenGroup();
        tokens.push({ type: "param", name, modifier: readModifier() });
      } else if (char === "(") {
        // anonymous regex group, e.g. "(foo|bar)", built as an unnamed wildcard
        flushLiteral();
        skipParenGroup();
        tokens.push({ type: "wildcard", modifier: readModifier() });
      } else if (char === "*") {
        flushLiteral();
        i++;
        tokens.push({ type: "wildcard", modifier: readModifier() });
      } else {
        literal += char;
        i++;
      }
    }
    flushLiteral();
    return tokens;
  };

  const tokens = parseSegment();
  if (i < pattern.length) {
    throw new URLBuilderError(
      `Unexpected "${pattern[i]}" at position ${i} in pattern "${pattern}"`,
    );
  }
  return tokens;
}

function resolveValue(name, modifier, values, encode) {
  const hasValue = Object.prototype.hasOwnProperty.call(values, name);
  const value = hasValue ? values[name] : undefined;
  if (Array.isArray(value)) {
    if (modifier !== "*" && modifier !== "+") {
      throw new URLBuilderError(
        `Named group "${name}" does not accept multiple values`,
      );
    }
    if (value.length === 0) {
      if (modifier === "+") throw new MissingValueError(name);
      return "";
    }
    return value.map((entry) => encode(String(entry))).join("/");
  }
  if (value === undefined || value === null || value === "") {
    if (modifier === "?" || modifier === "*") return "";
    throw new MissingValueError(name);
  }
  return encode(String(value));
}

function renderToken(token, values, wildcardCounter, encode) {
  switch (token.type) {
    case "param":
      return resolveValue(token.name, token.modifier, values, encode);
    case "wildcard": {
      // "*" inherently matches zero or more, so treat it as optional unless "+" is explicit
      const modifier = token.modifier === "+" ? "+" : "*";
      const name = String(wildcardCounter.next++);
      return resolveValue(name, modifier, values, encode);
    }
    case "group":
      try {
        return render(token.children, values, wildcardCounter, encode);
      } catch (error) {
        if (
          error instanceof MissingValueError &&
          (token.modifier === "?" || token.modifier === "*")
        ) {
          return "";
        }
        throw error;
      }
    default:
      return "";
  }
}

// renders a token tree, substituting named values and dropping optional groups that can't be filled
function render(tokens, values, wildcardCounter, encode) {
  let out = "";
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (token.type === "literal") {
      const next = tokens[index + 1];
      // "/:name?" and "/*?" collapse their separator slash along with the group, matching URLPattern
      if (
        token.value.endsWith("/") &&
        next &&
        (next.type === "param" || next.type === "wildcard") &&
        (next.modifier === "?" || next.modifier === "*")
      ) {
        const rendered = renderToken(next, values, wildcardCounter, encode);
        out += rendered === "" ? token.value.slice(0, -1) : token.value + rendered;
        index++;
        continue;
      }
      out += token.value;
      continue;
    }
    out += renderToken(token, values, wildcardCounter, encode);
  }
  return out;
}

// FormData may repeat a key; collapse single entries to a scalar, keep repeats as an array
const valuesFromFormData = (formData) => {
  const values = {};
  for (const name of new Set(formData.keys())) {
    const entries = formData
      .getAll(name)
      .map((entry) => (typeof File !== "undefined" && entry instanceof File ? entry.name : entry));
    values[name] = entries.length > 1 ? entries : entries[0];
  }
  return values;
};

// walks a token tree to collect every named group and generated wildcard index it references
function collectNames(tokens, wildcardCounter, names) {
  for (const token of tokens) {
    if (token.type === "param") {
      names.add(token.name);
    } else if (token.type === "wildcard") {
      names.add(String(wildcardCounter.next++));
    } else if (token.type === "group") {
      collectNames(token.children, wildcardCounter, names);
    }
  }
}

const remainderFromObject = (values, knownNames) => {
  const remainder = {};
  for (const key of Object.keys(values)) {
    if (!knownNames.has(key)) remainder[key] = values[key];
  }
  return remainder;
};

const remainderFromFormData = (formData, knownNames) => {
  const remainder = new FormData();
  for (const [key, value] of formData.entries()) {
    if (!knownNames.has(key)) remainder.append(key, value);
  }
  return remainder;
};

function assembleURL(parts) {
  const { protocol, username, password, hostname, port, pathname, search, hash } =
    parts;
  let url = "";
  if (protocol) url += `${protocol}://`;
  if (username) {
    url += username;
    if (password) url += `:${password}`;
    url += "@";
  }
  url += hostname;
  if (port) url += `:${port}`;
  if (pathname) url += pathname.startsWith("/") ? pathname : `/${pathname}`;
  if (search) url += `?${search.replace(/^\?/, "")}`;
  if (hash) url += `#${hash.replace(/^#/, "")}`;
  return url;
}

/**
 * Builds complete URLs from a URLPattern-style pattern by substituting named
 * group values, mirroring URLPattern's own constructor arguments.
 */
export class URLBuilder {
  #tokens = {};
  #names = new Set();
  constructor(...args) {
    const pattern = new URLPattern(...args);
    for (const component of COMPONENTS) {
      const tokens = tokenize(pattern[component]);
      this.#tokens[component] = tokens;
      collectNames(tokens, { next: 0 }, this.#names);
    }
  }
  /**
   * @param {Record<string, string | number | Array<string | number>> | FormData} values named group values
   * @returns {string} the assembled URL
   * @throws {URLBuilderError} if a required named group has no value
   */
  exec(values = {}) {
    values =
      typeof FormData !== "undefined" && values instanceof FormData
        ? valuesFromFormData(values)
        : Object(values);
    const parts = {};
    for (const component of COMPONENTS) {
      const encode = RAW_COMPONENTS.has(component)
        ? String
        : (value) => encodeURIComponent(value);
      parts[component] = render(
        this.#tokens[component],
        values,
        { next: 0 },
        encode,
      );
    }
    return assembleURL(parts);
  }
  /**
   * Like exec(), but also returns the entries not used by any named group.
   * @param {Record<string, string | number | Array<string | number>> | FormData} values named group values
   * @returns {{ url: string, remainder: Record<string, unknown> | FormData }}
   * @throws {URLBuilderError} if a required named group has no value
   */
  execWithRemainder(values = {}) {
    const isFormData = typeof FormData !== "undefined" && values instanceof FormData;
    const url = this.exec(values);
    const remainder = isFormData
      ? remainderFromFormData(values, this.#names)
      : remainderFromObject(Object(values), this.#names);
    return { url, remainder };
  }
  /**
   * @param {Record<string, string | number | Array<string | number>> | FormData} values named group values
   * @returns {boolean} true if every required named group has a matching value
   */
  test(values = {}) {
    try {
      this.exec(values);
      return true;
    } catch (error) {
      if (error instanceof URLBuilderError) return false;
      throw error;
    }
  }
}

export default URLBuilder;
