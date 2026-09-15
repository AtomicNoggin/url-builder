# URL Builder

A lightweight, zero dependency JS library that builds complete URLs from a
[`URLPattern`](https://developer.mozilla.org/en-US/docs/Web/API/URLPattern),
substituting named group values back into the pattern.

`URLBuilder` takes the exact same constructor arguments as `URLPattern`, so any
pattern you already use for matching can also be used to build matching URLs.

## Usage

```js
import URLBuilder from "url-builder";

const builder = new URLBuilder("/users/:id/posts/:postId?", "https://example.com");

builder.exec({ id: "42", postId: "7" });
// "https://example.com/users/42/posts/7"

builder.exec({ id: "42" });
// "https://example.com/users/42/posts" (the "?" group is optional and omitted)
```

Named groups can also appear in the hostname, search, or hash:

```js
const builder = new URLBuilder("https://:tenant.example.com/search?q=:term");

builder.exec({ tenant: "acme", term: "widgets" });
// "https://acme.example.com/search?q=widgets"
```

## Named groups

`exec(values)` accepts a plain object or a `FormData` instance. When given a
`FormData`, repeated field names become an array (for `*`/`+` groups) and
`File` values are substituted using their `name`.

`exec(values)` walks each pattern component (`protocol`, `username`,
`password`, `hostname`, `port`, `pathname`, `search`, `hash`) and substitutes:

| Pattern syntax | Behavior |
| --- | --- |
| `:name` | Required; throws a `URLBuilderError` if `values.name` is missing. |
| `:name?` | Optional; renders as an empty string if missing. |
| `:name*` | Optional, repeatable; pass an array to join multiple segments with `/`. |
| `:name+` | Required, repeatable; throws if missing or given an empty array. |
| `*` (wildcard) | Optional by default, keyed by its position (e.g. `"0"`). |
| `{...}?` or `{...}*` | The whole group is omitted if any value inside it is missing. |

Values for `pathname`, `search`, and `hash` are percent-encoded with
`encodeURIComponent`. Values for `protocol`, `hostname`, and `port` are used
as-is.

## Errors

`exec()` throws a `URLBuilderError` (also exported) when a required named
group has no matching value.

## execWithRemainder

`execWithRemainder(values)` builds the URL like `exec()`, and also returns the
entries that weren't consumed by any named group, useful for forwarding
leftover form fields as a request body:

```js
const builder = new URLBuilder("/users/:id", "https://example.com");
const formData = new FormData();
formData.append("id", "42");
formData.append("name", "Ada");

const { url, remainder } = builder.execWithRemainder(formData);
// url === "https://example.com/users/42"
// remainder is a FormData containing only "name"
```

`remainder` matches the input type: a plain object in, a plain object out; a
`FormData` in, a `FormData` out.

## test

`test(values)` returns `true` if `exec(values)` would succeed, or `false` if a
required named group has no matching value, without throwing:

```js
const builder = new URLBuilder("/users/:id", "https://example.com");

builder.test({ id: "42" }); // true
builder.test({}); // false
```

