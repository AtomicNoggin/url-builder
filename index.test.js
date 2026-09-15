import assert from "node:assert/strict";
import { describe, test } from "node:test";
import URLBuilder, { URLBuilderError } from "./index.js";

describe("URLBuilder", () => {
  test("builds a URL from a pathname pattern and baseURL", () => {
    const builder = new URLBuilder("/users/:id", "https://example.com");
    assert.equal(
      builder.exec({ id: "42" }),
      "https://example.com/users/42",
    );
  });

  test("throws a URLBuilderError when a required named group is missing", () => {
    const builder = new URLBuilder("/users/:id", "https://example.com");
    assert.throws(() => builder.exec({}), URLBuilderError);
  });

  test("omits an optional named group when its value is missing", () => {
    const builder = new URLBuilder(
      "/users/:id/posts/:postId?",
      "https://example.com",
    );
    assert.equal(
      builder.exec({ id: "42" }),
      "https://example.com/users/42/posts",
    );
    assert.equal(
      builder.exec({ id: "42", postId: "7" }),
      "https://example.com/users/42/posts/7",
    );
  });

  test("joins repeatable named groups with '/'", () => {
    const builder = new URLBuilder("/files/:path*", "https://example.com");
    assert.equal(
      builder.exec({ path: ["a", "b", "c"] }),
      "https://example.com/files/a/b/c",
    );
    assert.equal(
      builder.exec({}),
      "https://example.com/files",
    );
  });

  test("requires at least one value for a '+' repeatable named group", () => {
    const builder = new URLBuilder("/files/:path+", "https://example.com");
    assert.throws(() => builder.exec({}), URLBuilderError);
    assert.throws(() => builder.exec({ path: [] }), URLBuilderError);
    assert.equal(
      builder.exec({ path: ["a"] }),
      "https://example.com/files/a",
    );
  });

  test("substitutes named groups in the hostname and search", () => {
    const builder = new URLBuilder(
      "https://:tenant.example.com/search?q=:term",
    );
    assert.equal(
      builder.exec({ tenant: "acme", term: "widgets" }),
      "https://acme.example.com/search?q=widgets",
    );
  });

  test("percent-encodes pathname, search, and hash values", () => {
    const builder = new URLBuilder("/search/:term", "https://example.com");
    assert.equal(
      builder.exec({ term: "a b/c" }),
      "https://example.com/search/a%20b%2Fc",
    );
  });

  test("drops an optional group when a value inside it is missing", () => {
    const builder = new URLBuilder(
      "/reports/:id{-:ext}?",
      "https://example.com",
    );
    assert.equal(
      builder.exec({ id: "42" }),
      "https://example.com/reports/42",
    );
    assert.equal(
      builder.exec({ id: "42", ext: "pdf" }),
      "https://example.com/reports/42-pdf",
    );
  });

  test("accepts a FormData instance in place of a plain object", () => {
    const builder = new URLBuilder("/files/:path*", "https://example.com");
    const formData = new FormData();
    formData.append("path", "a");
    formData.append("path", "b");
    assert.equal(
      builder.exec(formData),
      "https://example.com/files/a/b",
    );
  });

  test("execWithRemainder returns the url and unused plain object entries", () => {
    const builder = new URLBuilder("/users/:id", "https://example.com");
    const { url, remainder } = builder.execWithRemainder({
      id: "42",
      name: "Ada",
    });
    assert.equal(url, "https://example.com/users/42");
    assert.deepEqual(remainder, { name: "Ada" });
  });

  test("execWithRemainder returns the url and an unused FormData", () => {
    const builder = new URLBuilder("/users/:id", "https://example.com");
    const formData = new FormData();
    formData.append("id", "42");
    formData.append("name", "Ada");

    const { url, remainder } = builder.execWithRemainder(formData);
    assert.equal(url, "https://example.com/users/42");
    assert.ok(remainder instanceof FormData);
    assert.deepEqual([...remainder.keys()], ["name"]);
    assert.equal(remainder.get("name"), "Ada");
  });

  test("test returns true when required named groups are satisfied", () => {
    const builder = new URLBuilder("/users/:id", "https://example.com");
    assert.equal(builder.test({ id: "42" }), true);
    assert.equal(builder.test({}), false);
  });

  test("test accepts a FormData instance", () => {
    const builder = new URLBuilder("/users/:id", "https://example.com");
    const formData = new FormData();
    formData.append("id", "42");
    assert.equal(builder.test(formData), true);
    assert.equal(builder.test(new FormData()), false);
  });
});
