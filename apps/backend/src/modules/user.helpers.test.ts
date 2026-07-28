import { describe, expect, test } from "bun:test";
import jwt from "jsonwebtoken";
import { isValidEmail, isValidPassword, signUserToken, toPublicUser } from "./user.helpers";

describe("isValidEmail", () => {
  test.each([
    "user@example.com",
    "first.last@sub.domain.co.in",
    "user+tag@example.io",
  ])("accepts %p", (email) => {
    expect(isValidEmail(email)).toBe(true);
  });

  test.each([
    "",
    "user",
    "user@",
    "@example.com",
    "user@example",
    "user @example.com",
    "user@exam ple.com",
    "two@at@example.com",
  ])("rejects %p", (email) => {
    expect(isValidEmail(email)).toBe(false);
  });

  test("rejects non-string values", () => {
    for (const value of [undefined, null, 42, {}, ["user@example.com"]]) {
      expect(isValidEmail(value)).toBe(false);
    }
  });
});

describe("isValidPassword", () => {
  test("accepts a password of exactly the 8 character minimum", () => {
    expect(isValidPassword("12345678")).toBe(true);
  });

  test("rejects a password shorter than 8 characters", () => {
    expect(isValidPassword("1234567")).toBe(false);
    expect(isValidPassword("")).toBe(false);
  });

  test("rejects non-string values", () => {
    for (const value of [undefined, null, 12345678, { password: "12345678" }]) {
      expect(isValidPassword(value)).toBe(false);
    }
  });
});

describe("signUserToken", () => {
  const secret = "test-secret";

  test("signs id and email into a token verifiable with JWT_SECRET", () => {
    process.env.JWT_SECRET = secret;

    const token = signUserToken({ id: "u1", email: "user@example.com" });
    const payload = jwt.verify(token, secret) as {
      id: string;
      email: string;
      exp: number;
      iat: number;
    };

    expect(payload.id).toBe("u1");
    expect(payload.email).toBe("user@example.com");
    expect(payload.exp - payload.iat).toBe(7 * 24 * 60 * 60);
  });

  test("produces a token that fails verification under a different secret", () => {
    process.env.JWT_SECRET = secret;
    const token = signUserToken({ id: "u1", email: "user@example.com" });

    expect(() => jwt.verify(token, "other-secret")).toThrow();
  });

  test("does not leak fields beyond id and email", () => {
    process.env.JWT_SECRET = secret;
    const token = signUserToken({
      id: "u1",
      email: "user@example.com",
      password: "hashed",
    } as { id: string; email: string });

    expect(Object.keys(jwt.decode(token) as object).sort()).toEqual([
      "email",
      "exp",
      "iat",
      "id",
    ]);
  });
});

describe("toPublicUser", () => {
  test("keeps only the publicly safe fields", () => {
    const createdAt = new Date("2026-01-01T00:00:00.000Z");
    const user = {
      id: "u1",
      email: "user@example.com",
      name: "Ada",
      createdAt,
      password: "hashed-secret",
      googleId: "g1",
    };

    const publicUser = toPublicUser(user);

    expect(publicUser).toEqual({
      id: "u1",
      email: "user@example.com",
      name: "Ada",
      createdAt,
    });
    expect(Object.keys(publicUser)).not.toContain("password");
  });

  test("preserves a null name", () => {
    expect(
      toPublicUser({
        id: "u1",
        email: "user@example.com",
        name: null,
        createdAt: new Date(0),
      }).name,
    ).toBeNull();
  });
});
