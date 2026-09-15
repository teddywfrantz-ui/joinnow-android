import assert from "node:assert/strict";
import test from "node:test";
import { groupEligibilityError, hasCapacity } from "./group-rules.ts";

test("group acceptance requires every member to satisfy gender eligibility", () => {
  const error = groupEligibilityError(
    [
      { gender: "Female", birthday: new Date("1990-01-01") },
      { gender: "Male", birthday: new Date("1990-01-01") },
    ],
    { genderFilter: "Female", minAgeFilter: null, maxAgeFilter: null },
    new Date("2025-01-01"),
  );
  assert.equal(
    error,
    "Every group member must meet the meetup gender requirements",
  );
});

test("group acceptance requires every member to have an eligible age", () => {
  const error = groupEligibilityError(
    [
      { gender: null, birthday: new Date("2010-01-01") },
      { gender: null, birthday: new Date("1990-01-01") },
    ],
    { genderFilter: null, minAgeFilter: 18, maxAgeFilter: null },
    new Date("2025-01-01"),
  );
  assert.equal(error, "Every group member must meet the meetup minimum age");
});

test("group acceptance fails when all members do not fit remaining capacity", () => {
  assert.equal(hasCapacity(4, 3, 6), false);
  assert.equal(hasCapacity(4, 2, 6), true);
});
