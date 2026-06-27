import assert from "node:assert/strict";
import { test } from "node:test";

import {
  parseCabinetName,
  projectKeyFromParts,
} from "../src/cabinet_parser.mjs";

test("parses project, city, and duplicate number from cabinet names", () => {
  assert.deepEqual(parseCabinetName("Яблочный Спас | Орск (2)"), {
    projectName: "Яблочный Спас",
    city: "Орск",
    duplicateNumber: 2,
    projectKey: "яблочный спас|орск",
  });
  assert.deepEqual(parseCabinetName("Repoint | Саратов"), {
    projectName: "Repoint",
    city: "Саратов",
    duplicateNumber: null,
    projectKey: "repoint|саратов",
  });
});

test("maps repeated cabinets to the same project key", () => {
  const names = [
    "Аймоби | Москва (2)",
    "Аймоби | Москва (3)",
    "Аймоби | Москва (4)",
    "Аймоби | Москва (5)",
    "Аймоби | Москва (6)",
  ];

  assert.deepEqual(
    names.map((name) => parseCabinetName(name).projectKey),
    [
      "аймоби|москва",
      "аймоби|москва",
      "аймоби|москва",
      "аймоби|москва",
      "аймоби|москва",
    ],
  );
});

test("builds stable project key from project and city", () => {
  assert.equal(projectKeyFromParts(" Apple Super Store ", " Гатчина "), "apple super store|гатчина");
});

test("rejects names that do not contain project and city delimiter", () => {
  assert.equal(parseCabinetName("Непонятное название"), null);
});
