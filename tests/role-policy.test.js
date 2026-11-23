import test from "node:test";
import assert from "node:assert/strict";
import { navigationFor, homeFor, routeFor } from "../public/role-policy.js";
test("staff navigation excludes citizen actions and redirects citizen-only routes", () => {
  for (const role of ["ADMIN", "OFFICER"]) {
    const user = {
      role,
    };
    const routes = navigationFor(user).map((x) => {
      return x[0];
    });
    assert.ok(routes.includes("dashboard"));
    assert.ok(!routes.includes("board"));
    assert.ok(!routes.includes("report"));
    assert.equal(homeFor(user), "dashboard");
    for (const page of ["board", "report", "mine", "register", "login"]) {
      assert.equal(routeFor(user, page), "dashboard");
    }
  }
});
test("citizens keep reporting, community and their own reports", () => {
  assert.deepEqual(
    navigationFor({
      role: "CITIZEN",
    }).map((x) => {
      return x[0];
    }),
    ["board", "mine", "report", "notifications"],
  );
  assert.equal(homeFor(null), "board");
  assert.equal(
    routeFor(
      {
        role: "CITIZEN",
      },
      "report",
    ),
    "report",
  );
  assert.equal(
    routeFor(
      {
        role: "OFFICER",
      },
      "complaint",
    ),
    "complaint",
  );
});
