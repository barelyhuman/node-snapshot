import { test } from "node:test";
import { snapsnot } from "../src/snapshot.js";

test("yo", (t) => {
  snapsnot(t, "make it rain");
});

test("yo 2", (t) => {
  snapsnot(t, { name: 2 });
});

test("for", (t) => {
  t.test("lols", (t) => {
    snapsnot(t, [{ name: 1 }, { name: 2 }]);
  });
});
