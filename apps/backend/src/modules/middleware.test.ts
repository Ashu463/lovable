import { beforeEach, describe, expect, test } from "bun:test";
import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { auth, internalAuth, type AuthRequest } from "./middleware";

const JWT_SECRET = "test-jwt-secret";
const INTERNAL_TOKEN = "test-internal-token";

function makeReq(authorization?: string): AuthRequest {
  return { headers: authorization ? { authorization } : {} } as AuthRequest;
}

function makeRes() {
  const sent: { status?: number; body?: unknown } = {};
  const res = {
    status(code: number) {
      sent.status = code;
      return this;
    },
    json(body: unknown) {
      sent.body = body;
      return this;
    },
  } as unknown as Response;
  return { res, sent };
}

function makeNext() {
  const calls: unknown[][] = [];
  const next = ((...args: unknown[]) => {
    calls.push(args);
  }) as unknown as NextFunction;
  return { next, calls };
}

beforeEach(() => {
  process.env.JWT_SECRET = JWT_SECRET;
  process.env.INTERNAL_SERVICE_TOKEN = INTERNAL_TOKEN;
});

describe("auth", () => {
  test("attaches the decoded user and calls next for a valid JWT", () => {
    const token = jwt.sign({ id: "u1", email: "user@example.com" }, JWT_SECRET);
    const req = makeReq(`Bearer ${token}`);
    const { res, sent } = makeRes();
    const { next, calls } = makeNext();

    auth(req, res, next);

    expect(calls).toHaveLength(1);
    expect(req.user).toMatchObject({ id: "u1", email: "user@example.com" });
    expect(sent.status).toBeUndefined();
  });

  test("lets the internal service token through without a user", () => {
    const req = makeReq(`Bearer ${INTERNAL_TOKEN}`);
    const { res } = makeRes();
    const { next, calls } = makeNext();

    auth(req, res, next);

    expect(calls).toHaveLength(1);
    expect(req.user).toBeUndefined();
  });

  test.each([
    ["a missing Authorization header", undefined],
    ["a non-Bearer scheme", "Basic dXNlcjpwYXNz"],
    ["a lowercase bearer prefix", "bearer sometoken"],
  ])("401s on %s", (_label, header) => {
    const { res, sent } = makeRes();
    const { next, calls } = makeNext();

    auth(makeReq(header), res, next);

    expect(calls).toHaveLength(0);
    expect(sent.status).toBe(401);
    expect(sent.body).toEqual({ message: "Unauthorized" });
  });

  test("401s with 'Invalid token' for a token signed with the wrong secret", () => {
    const token = jwt.sign({ id: "u1", email: "user@example.com" }, "other-secret");
    const { res, sent } = makeRes();
    const { next, calls } = makeNext();

    auth(makeReq(`Bearer ${token}`), res, next);

    expect(calls).toHaveLength(0);
    expect(sent.status).toBe(401);
    expect(sent.body).toEqual({ message: "Invalid token" });
  });

  test("401s with 'Invalid token' for an expired token", () => {
    const token = jwt.sign({ id: "u1", email: "user@example.com" }, JWT_SECRET, {
      expiresIn: "-1s",
    });
    const { res, sent } = makeRes();
    const { next } = makeNext();

    auth(makeReq(`Bearer ${token}`), res, next);

    expect(sent.status).toBe(401);
    expect(sent.body).toEqual({ message: "Invalid token" });
  });

  test("401s with 'Invalid token' for garbage after Bearer", () => {
    const { res, sent } = makeRes();
    const { next } = makeNext();

    auth(makeReq("Bearer not-a-jwt"), res, next);

    expect(sent.status).toBe(401);
    expect(sent.body).toEqual({ message: "Invalid token" });
  });
});

describe("internalAuth", () => {
  test("calls next when the shared secret matches", () => {
    const { res, sent } = makeRes();
    const { next, calls } = makeNext();

    internalAuth(makeReq(`Bearer ${INTERNAL_TOKEN}`) as Request, res, next);

    expect(calls).toHaveLength(1);
    expect(sent.status).toBeUndefined();
  });

  test.each([
    ["no Authorization header", undefined],
    ["a non-Bearer scheme", `Basic ${INTERNAL_TOKEN}`],
    ["the wrong secret", "Bearer wrong-token"],
    ["an empty Bearer token", "Bearer "],
  ])("401s on %s", (_label, header) => {
    const { res, sent } = makeRes();
    const { next, calls } = makeNext();

    internalAuth(makeReq(header) as Request, res, next);

    expect(calls).toHaveLength(0);
    expect(sent.status).toBe(401);
    expect(sent.body).toEqual({ message: "Unauthorized" });
  });

  test("rejects a valid user JWT — this path is service-to-service only", () => {
    const token = jwt.sign({ id: "u1", email: "user@example.com" }, JWT_SECRET);
    const { res, sent } = makeRes();
    const { next, calls } = makeNext();

    internalAuth(makeReq(`Bearer ${token}`) as Request, res, next);

    expect(calls).toHaveLength(0);
    expect(sent.status).toBe(401);
  });
});
